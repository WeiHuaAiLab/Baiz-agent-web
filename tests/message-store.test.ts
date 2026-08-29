import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { buildDemoFrames } from '../src/demo/script'

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

describe('消息排队镜像（Codex 双输入模式）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('忙时会话入队：位置连续、启动帧摘除、取消移除', async () => {
    const messages = useMessageStore()
    const conversationId = 'c-queue'
    messages.ensureRun('t-running', conversationId)
    const running = messages.runs['t-running']
    if (running) running.status = 'running'

    // 乐观入队两条
    messages.pushPending(conversationId, {
      taskId: 't-1',
      text: '第一条',
      position: 1,
      queuedAt: Date.now(),
    })
    messages.pushPending(conversationId, {
      taskId: 't-2',
      text: '第二条',
      position: 2,
      queuedAt: Date.now(),
    })
    expect(messages.pendingFor(conversationId).map((item) => item.position)).toEqual([1, 2])
    expect(messages.nextQueuePosition(conversationId)).toBe(3)

    // 启动帧到来 → 摘除 + 剩余条目位置重排
    messages.ensureRun('t-1', conversationId)
    const queued = messages.runs['t-1']
    if (queued) queued.status = 'queued'
    messages.markRunActive('t-1')
    expect(messages.runs['t-1']?.status).toBe('running')
    expect(messages.pendingFor(conversationId).map((item) => item.taskId)).toEqual(['t-2'])
    expect(messages.pendingFor(conversationId)[0]?.position).toBe(1)

    // 取消：本地同步摘除 + run 转 cancelled（后端调用失败也不阻塞）
    messages.ensureRun('t-2', conversationId)
    const queued2 = messages.runs['t-2']
    if (queued2) queued2.status = 'queued'
    await messages.cancelQueued(conversationId, 't-2')
    expect(messages.pendingFor(conversationId)).toHaveLength(0)
    expect(messages.runs['t-2']?.status).toBe('cancelled')
  })

  it('SSE 首帧（token/task.updated）把 queued 转 running 并摘除镜像', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 't-queued-1'
    const conversationId = 'c-queue-2'
    messages.ensureRun(taskId, conversationId)
    const run = messages.runs[taskId]
    if (run) run.status = 'queued'
    messages.pushPending(conversationId, {
      taskId,
      text: '排队消息',
      position: 1,
      queuedAt: Date.now(),
    })

    routeFrame({ event: 'token', data: { task_id: taskId, token: '你' } }, messages, approvals)

    expect(messages.runs[taskId]?.status).toBe('running')
    expect(messages.pendingFor(conversationId)).toHaveLength(0)
  })
})
