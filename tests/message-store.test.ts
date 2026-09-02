import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useSettingsStore } from '../src/stores/settings'
import { getClient } from '../src/client/singleton'
import { buildDemoFrames } from '../src/demo/script'

// MSG-2341 红证：getClient 保真 vi.fn——默认走真（老测不破），红证测
// mockImplementation 拦 chatSend 捕获载荷
vi.mock('../src/client/singleton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/singleton')>()
  return { ...actual, getClient: vi.fn(actual.getClient) }
})

describe('message store 事件组装', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('token/工具/完成 全链路组装', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 't-1'
    const conversationId = 'c-1'
    messages.ensureRun(taskId, conversationId)

    routeFrame(
      {
        event: 'tool.call',
        data: { task_id: taskId, call_id: 'c1', tool_name: 'web.search', args_preview: '{}' },
      },
      messages,
      approvals,
    )
    routeFrame({ event: 'token', data: { task_id: taskId, token: '你好' } }, messages, approvals)
    routeFrame(
      {
        event: 'tool.result',
        data: { task_id: taskId, call_id: 'c1', success: true, preview: 'ok' },
      },
      messages,
      approvals,
    )
    routeFrame({ event: 'done', data: { task_id: taskId } }, messages, approvals)

    const items = messages.list(conversationId)
    expect(items.map((item) => item.kind)).toEqual(['tool_call', 'assistant'])
    expect(items[1]?.text).toBe('你好')
    expect(items[1]?.meta?.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(items[1]?.meta?.streaming).toBeFalsy()
    expect(items[0]?.meta?.success).toBe(true)
  })

  it('审批要求与响应闭环', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 't-2'
    const conversationId = 'c-2'
    messages.ensureRun(taskId, conversationId)

    routeFrame(
      {
        event: 'approval.required',
        data: {
          request_id: 'r1',
          task_id: taskId,
          tool_name: 'classify_customers',
          args_preview: '{}',
        },
      },
      messages,
      approvals,
    )
    expect(approvals.pending).toHaveLength(1)

    routeFrame(
      { event: 'approval.resolved', data: { request_id: 'r1', approved: true } },
      messages,
      approvals,
    )
    expect(approvals.pending).toHaveLength(0)
    const msg = messages.list(conversationId).find((item) => item.kind === 'approval')
    expect(msg?.meta?.approved).toBe(true)
  })

  it('完整 demo 事件流（含 task_id 迁移）只产生一条 assistant 消息', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const conversationId = 'c-3'
    const clientTaskId = 't-client'
    const taskId = 'demo-abc'

    // 模拟 sendUserMessage：先建 clientTaskId 的 run，再被 daemon 回显迁移
    messages.ensureRun(clientTaskId, conversationId)
    const run = messages.runs[clientTaskId]
    if (!run) throw new Error('run missing')
    delete messages.runs[clientTaskId]
    run.taskId = taskId
    messages.runs[taskId] = run

    for (const frame of buildDemoFrames(taskId, '测试')) {
      routeFrame(frame, messages, approvals)
    }

    const items = messages.list(conversationId)
    const assistants = items.filter((item) => item.kind === 'assistant')
    expect(assistants).toHaveLength(1)
    expect(assistants[0]?.meta?.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(assistants[0]?.meta?.streaming).toBeFalsy()
  })

  it('stopRun 停止生成并忽略后续帧', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 't-stop'
    const conversationId = 'c-stop'
    messages.ensureRun(taskId, conversationId)

    routeFrame({ event: 'token', data: { task_id: taskId, token: '部分内容' } }, messages, approvals)
    messages.stopRun(taskId)
    expect(messages.runs[taskId]?.status).toBe('cancelled')
    expect(messages.runs[taskId]?.elapsedMs).toBeGreaterThanOrEqual(0)

    routeFrame({ event: 'token', data: { task_id: taskId, token: '后续' } }, messages, approvals)
    const msg = messages.list(conversationId).find((item) => item.kind === 'assistant')
    expect(msg?.text).toContain('已停止')
    expect(msg?.text).not.toContain('后续')
  })

  it('retryFrom 重新发送上一条用户消息', async () => {
    const messages = useMessageStore()
    const conversationId = 'c-retry'
    await messages.push(conversationId, {
      id: 'u-1',
      conversationId,
      kind: 'user',
      text: '再来一次',
      createdAt: Date.now(),
    })
    await messages.push(conversationId, {
      id: 's-1',
      conversationId,
      kind: 'status',
      text: 'boom',
      createdAt: Date.now(),
      meta: { statusKey: 'sendFailed' },
    })
    await messages.retryFrom(conversationId, 's-1')
    await new Promise((resolve) => setTimeout(resolve, 150))
    const users = messages.list(conversationId).filter((item) => item.kind === 'user')
    expect(users).toHaveLength(2)
  })

  it('removeMessage 删除单条消息', async () => {
    const messages = useMessageStore()
    const conversationId = 'c-del'
    await messages.push(conversationId, {
      id: 'm-1',
      conversationId,
      kind: 'user',
      text: 'x',
      createdAt: Date.now(),
    })
    await messages.removeMessage(conversationId, 'm-1')
    expect(messages.list(conversationId)).toHaveLength(0)
  })

  it('高频 token 流节流：首个即时、后续 100ms 合并', () => {
    vi.useFakeTimers()
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 't-fast'
    const conversationId = 'c-fast'
    messages.ensureRun(taskId, conversationId)

    routeFrame({ event: 'token', data: { task_id: taskId, token: 'A' } }, messages, approvals)
    expect(messages.runs[taskId]?.text).toBe('A')

    routeFrame({ event: 'token', data: { task_id: taskId, token: 'B' } }, messages, approvals)
    routeFrame({ event: 'token', data: { task_id: taskId, token: 'C' } }, messages, approvals)
    expect(messages.runs[taskId]?.text).toBe('A')

    vi.advanceTimersByTime(150)
    expect(messages.runs[taskId]?.text).toBe('ABC')
    vi.useRealTimers()
  })

  it('runs 超过上限时裁剪已完成任务', () => {
    const messages = useMessageStore()
    for (let i = 0; i < 60; i += 1) {
      messages.runs[`t-${i}`] = {
        taskId: `t-${i}`,
        conversationId: 'c',
        status: 'completed',
        startedAt: i,
        reasoning: '',
        text: '',
        trace: [],
      }
    }
    messages.trimRuns()
    expect(Object.keys(messages.runs).length).toBe(50)
  })
})

// MSG-2341 红证：设置面所选模型 → chat.send 载荷 model 键（A-4 前端残面升格）
describe('chat.send 载荷 model 透传', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('选 qwen → 载荷 model=qwen；切 deepseek 再发 → 载荷 model=deepseek（缺省态恒带键）', async () => {
    const messages = useMessageStore()
    const settings = useSettingsStore()
    const captured: Array<{ model?: string }> = []
    vi.mocked(getClient).mockImplementation(
      () =>
        ({
          chatSend: async (params: { model?: string }) => {
            captured.push(params)
            return { task_id: 't-x', status: 'ok', model: 'deepseek' }
          },
        }) as never,
    )

    // 设置面选 qwen → 载荷带 qwen
    settings.setModel('qwen')
    await messages.sendUserMessage('c-model', '你好')
    expect(captured[0].model).toBe('qwen')

    // 切回 deepseek（设置面默认值）再发 → 载荷随动
    settings.setModel('deepseek')
    await messages.sendUserMessage('c-model', '再发')
    expect(captured[1].model).toBe('deepseek')

    // 恒带键面：两发俱有 model 键（settings.model 恒有默认值——deepseek）
    expect(captured).toHaveLength(2)
    expect(captured.every((p) => typeof p.model === 'string')).toBe(true)
  })
})
