import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useSettingsStore } from '../src/stores/settings'
import { useAuthStore } from '../src/stores/auth'
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

// MSG-2341/2358 红证：设置面所选模型 → chat.send 载荷 model 键（枚举换正后双名）
describe('chat.send 载荷 model 透传', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('选 v4-flash → 载荷 model=deepseek-v4-flash；切 v4-pro 再发 → 载荷随动（缺省态恒带键）', async () => {
    const messages = useMessageStore()
    const settings = useSettingsStore()
    const captured: Array<{ model?: string }> = []
    vi.mocked(getClient).mockImplementation(
      () =>
        ({
          chatSend: async (params: { model?: string }) => {
            captured.push(params)
            return { task_id: 't-x', status: 'ok', model: 'deepseek-v4-pro' }
          },
        }) as never,
    )

    // MSG-2358 红证①：选 v4-flash → 载荷带 deepseek-v4-flash
    settings.setModel('deepseek-v4-flash')
    await messages.sendUserMessage('c-model', '你好')
    expect(captured[0].model).toBe('deepseek-v4-flash')

    // 切回 v4-pro（设置面默认值）再发 → 载荷随动
    settings.setModel('deepseek-v4-pro')
    await messages.sendUserMessage('c-model', '再发')
    expect(captured[1].model).toBe('deepseek-v4-pro')

    // 恒带键面：两发俱有 model 键（settings.model 恒有默认值——v4-pro）
    expect(captured).toHaveLength(2)
    expect(captured.every((p) => typeof p.model === 'string')).toBe(true)
  })
})

// DEBT-542A（MSG-2861）：附件元信息块——名/mime/尺寸人话齐——模型有
// 可答面不空回；图诚实文案（文本档不读图——勿假装看图）；dataUrl/
// 内容零入正文（防 base64 膨胀 token）
describe('DEBT-542A 附件元信息块', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function captureChatSend(): Array<{ message?: string }> {
    const captured: Array<{ message?: string }> = []
    vi.mocked(getClient).mockImplementation(
      () =>
        ({
          chatSend: async (params: { message?: string }) => {
            captured.push(params)
            return { task_id: 't-a', status: 'ok' }
          },
        }) as never,
    )
    return captured
  }

  it('图附件 → 元信息块（mime·尺寸）＋诚实文案，dataUrl 零入正文', async () => {
    const messages = useMessageStore()
    const captured = captureChatSend()
    await messages.sendUserMessage('c-img', '看图', undefined, [
      {
        id: 'a1',
        kind: 'image',
        name: 'photo.png',
        mimeType: 'image/png',
        size: 524288, // 512.0 KB
        dataUrl: 'data:image/png;base64,AAAA',
      },
    ])
    const sent = captured[0].message ?? ''
    // MSG-3270 改口径：行内块改**随机 nonce 信封**（fence 免疫）＋头部带 sha256；
    // 元信息（mime·尺寸）与"不读像素"的诚实文案原样保留。
    expect(sent).toMatch(/\[附件1：photo\.png（image\/png · 512\.0 KB） sha256=[0-9A-F]+\]/)
    expect(sent).toContain('不读图内容')
    expect(sent).toContain('查看会话中的图片')
    // 诚实面：dataUrl/base64 零入正文（防 token 膨胀）
    expect(sent).not.toContain('base64,AAAA')
    expect(sent).not.toContain('data:image')
  })

  it('文件附件 → 元信息块（mime·尺寸）＋文本 body 照拼', async () => {
    const messages = useMessageStore()
    const captured = captureChatSend()
    await messages.sendUserMessage('c-file', '读这个', undefined, [
      {
        id: 'a2',
        kind: 'file',
        name: 'notes.txt',
        mimeType: 'text/plain',
        size: 1536, // 1.5 KB
        content: '第一行\n第二行',
      },
    ])
    const sent = captured[0].message ?? ''
    expect(sent).toMatch(/\[附件1：notes\.txt（text\/plain · 1\.50 KB） sha256=[0-9A-F]+\]/)
    expect(sent).toContain('第一行\n第二行')
  })

  it('混合附件＋空 mime 兜底——元信息零缺失零炸', async () => {
    const messages = useMessageStore()
    const captured = captureChatSend()
    await messages.sendUserMessage('c-mix', '两个一起', undefined, [
      { id: 'a3', kind: 'image', name: 'a.png', mimeType: '', size: 0 },
      { id: 'a4', kind: 'file', name: 'data.bin', mimeType: '', size: 42 },
    ])
    const sent = captured[0].message ?? ''
    // 空 mime → 尺寸兜底照出；零 size → 0 B
    expect(sent).toMatch(/\[附件1：a\.png（0 B） sha256=/)
    expect(sent).toMatch(/\[附件2：data\.bin（42 B） sha256=/)
    // 两附件块并存（image 诚实文案只现于图块）
    expect(sent).toContain('不读图内容')
    expect(sent.indexOf('[附件1：a.png') < sent.indexOf('[附件2：data.bin')).toBe(true)
  })
})

// MSG-2922 门槛4② 红证：登录态 owner 透传——session_token 随 chat.send
// 载荷随行（登录态→请求面 owner 随行实证，勿文字承诺）；未登录/登出零键
// （旧客户端/单主兼容面零变）。daemon 以其经 SessionStore 查证 uid 驱动
// owner 隔离（daemon 侧红证在 sse::chat_send::memory_engine::tests）。
describe('chat.send 载荷 session_token 透传（登录态 owner 随行）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    sessionStorage.clear()
  })

  it('未登录零键 → 登录随行 → 登出回落零键（三态实证）', async () => {
    const messages = useMessageStore()
    const auth = useAuthStore()
    const captured: Array<{ session_token?: string }> = []
    vi.mocked(getClient).mockImplementation(
      () =>
        ({
          chatSend: async (params: { session_token?: string }) => {
            captured.push(params)
            return { task_id: 't-tok', status: 'ok', model: 'deepseek-v4-pro' }
          },
        }) as never,
    )

    // ① 未登录：零键（单主兼容面零变）
    await messages.sendUserMessage('c-tok', '未登录发一句')
    expect(captured[0]?.session_token).toBeUndefined()

    // ② 登录态（内存态注入——登录流程另有 auth.test.ts 专测）：随行
    auth.sessionToken = 'tok-live-1'
    await messages.sendUserMessage('c-tok', '登录后再发一句')
    expect(captured[1]?.session_token).toBe('tok-live-1')

    // ③ 登出：零键回落（token 零残留）
    auth.logout()
    await messages.sendUserMessage('c-tok', '登出后再发一句')
    expect(captured[2]?.session_token).toBeUndefined()
    expect(captured).toHaveLength(3)
  })
})
