// MSG-2608 红证包：用户主动停止之 abort 错误勿落 sendFailed 红条（双向——
// (a) 停止后 RPC 收束错 → 中性零红；(b) 真失败（未停止）→ 红条照现勿误杀）。
// 实序模拟：sendUserMessage 自建 clientTaskId（t-<ts>-<rnd>）——取消/断言
// 均取 runs 实际键（与真实 stopRun(runningRun.taskId) 同源）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMessageStore } from '../src/stores/message'
import { getClient } from '../src/client/singleton'

vi.mock('../src/client/singleton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/singleton')>()
  return { ...actual, getClient: vi.fn(actual.getClient) }
})

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('MSG-2608 停止红条抑制', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getClient).mockReturnValue({
      chatSend: vi.fn(),
      chatQueueCancel: vi.fn().mockResolvedValue({ ok: true }),
    } as never)
  })

  it('(a) 停止后 chat.send 收束出错：零 sendFailed 红条——cancelled 中性终态独现', async () => {
    const messages = useMessageStore()
    const cid = 'c-stop-1'
    messages.byConversation[cid] = []
    let rejectSend!: (e: unknown) => void
    vi.mocked(getClient().chatSend).mockImplementation(
      () => new Promise((_res, rej) => (rejectSend = rej)) as never,
    )
    const p = messages.sendUserMessage(cid, '停止前的问题')
    // 发送在途（push→db 异步链）——轮询待自动 clientTaskId run 生成
    let autoKey: string | undefined
    for (let i = 0; i < 30 && !autoKey; i += 1) {
      await tick()
      autoKey = Object.keys(messages.runs).find((k) => k.startsWith('t-'))
    }
    expect(autoKey).toBeTruthy()
    messages.runs[autoKey!].status = 'cancelled'
    messages.runs[autoKey!].finishedAt = Date.now()
    // daemon task.cancel 收束 → 在途 chat.send RPC 错回
    rejectSend(new Error('RPC 调用失败（未知错误）'))
    await p
    const statusItems = messages.byConversation[cid].filter((m) => m.kind === 'status')
    expect(statusItems).toHaveLength(0)
    expect(messages.byConversation[cid].some((m) => m.kind === 'user')).toBe(true)
    expect(messages.runs[autoKey!].status).toBe('cancelled')
  })

  it('(b) 真失败（未停止）：sendFailed 红条照现——run failed——勿误杀勿洗绿', async () => {
    const messages = useMessageStore()
    const cid = 'c-fail-1'
    messages.byConversation[cid] = []
    vi.mocked(getClient().chatSend).mockRejectedValue(new Error('RPC 调用失败（未知错误）'))
    await messages.sendUserMessage(cid, '会失败的问题')
    const autoKey = Object.keys(messages.runs).find((k) => k.startsWith('t-'))
    const statusItems = messages.byConversation[cid].filter((m) => m.kind === 'status')
    expect(statusItems).toHaveLength(1)
    expect(statusItems[0].meta?.statusKey).toBe('sendFailed')
    expect(messages.runs[autoKey!].status).toBe('failed')
  })
})
