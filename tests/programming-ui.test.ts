// MSG-2722 L3 编程 UI 红证：mode=programming 透传／Blocked 人工回传续跑
// （tool_loop.resume）／续跑目标判定——getClient 保真 mock 照 message-store
// 先例（MSG-2341 捕获载荷法）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMessageStore } from '../src/stores/message'
import { useUiStore } from '../src/stores/ui'
import { useSessionStore } from '../src/stores/session'
import { getClient } from '../src/client/singleton'

vi.mock('../src/client/singleton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/singleton')>()
  return { ...actual, getClient: vi.fn(actual.getClient) }
})

describe('MSG-2722 编程 UI 红证', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('① mode=programming 透传——编程态发送载荷含 mode（缺省 chat 零 mode）', async () => {
    const messages = useMessageStore()
    const ui = useUiStore()
    const session = useSessionStore()
    session.activeId = 'c-prog'
    const capture: Array<Record<string, unknown>> = []
    vi.mocked(getClient).mockImplementation(
      (() => ({
        chatSend: async (p: Record<string, unknown>) => {
          capture.push(p)
          return { task_id: 't-1' }
        },
      })) as never,
    )
    ui.programmingMode = true
    await messages.sendUserMessage('c-prog', '实现一个排序函数', undefined, undefined, 'programming')
    expect(capture[0]?.mode).toBe('programming')
    ui.programmingMode = false
    await messages.sendUserMessage('c-prog', '普通聊天', undefined, undefined, undefined)
    expect(capture[1]?.mode).toBeUndefined()
  })

  it('② Blocked 续跑——resumeRun 桥 tool_loop.resume（task_id＋note）＋回传入流', async () => {
    const messages = useMessageStore()
    const session = useSessionStore()
    session.activeId = 'c-res'
    const resumed: Array<Record<string, unknown>> = []
    vi.mocked(getClient).mockImplementation(
      (() => ({
        taskResume: async (p: Record<string, unknown>) => {
          resumed.push(p)
          return { resumed: true }
        },
      })) as never,
    )
    messages.ensureRun('t-blocked', 'c-res')
    const run = messages.runs['t-blocked']
    run.status = 'failed'
    run.finishedAt = Date.now()
    await messages.resumeRun('t-blocked', '已手工修正——请续跑')
    expect(resumed[0]).toMatchObject({ task_id: 't-blocked', note: '已手工修正——请续跑' })
    expect(messages.runs['t-blocked'].status).toBe('running')
    // 回传以 user 消息入流
    const list = messages.list('c-res')
    expect(list.some((m) => m.kind === 'user' && m.text.includes('续跑回传'))).toBe(true)
  })

  it('③ resume 失败红条（不静默）', async () => {
    const messages = useMessageStore()
    const session = useSessionStore()
    session.activeId = 'c-res-f'
    vi.mocked(getClient).mockImplementation(
      (() => ({
        taskResume: async () => {
          throw new Error('RPC: tool_loop.resume 失败')
        },
      })) as never,
    )
    messages.ensureRun('t-f', 'c-res-f')
    const run = messages.runs['t-f']
    run.status = 'failed'
    run.finishedAt = Date.now()
    await messages.resumeRun('t-f', '回传')
    const list = messages.list('c-res-f')
    expect(list.some((m) => m.kind === 'status')).toBe(true)
  })

  it('④ ui.programmingMode 会话级态——初值 false（缺省 chat 兼容）', () => {
    const ui = useUiStore()
    expect(ui.programmingMode).toBe(false)
    ui.programmingMode = true
    expect(ui.programmingMode).toBe(true)
  })
})
