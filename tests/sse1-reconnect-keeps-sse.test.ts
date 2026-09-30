// **`令-SSE1` 红证／绿证**：**登录后 SSE 失联**——`reconnectClient()` 换传输 ⇒ `SseReconnect`
// 仍挂在被 `close` 的旧传输上 ⇒ `daemon://frame` 不再路由 ⇒ **回复不上屏**（＝线上 1.0.26 同形态）。
//
// 判据（假传输·**非"代码看着对"**）：
//   Δ1 **改前必红**：`reconnectClient()` 后 **旧传输被 `close`**（`handlers` 清）且**新传输另建** ⇒
//      在旧传输上 `emit` 帧 ⇒ **SseReconnect 的 dispatch 不再触发**；
//   Δ2 **改后复绿**：**同一传输**重连 ⇒ 帧回调**仍触发**、`close` **未被调用**。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createClient } from '../src/client'
import type { RpcTransport } from '../src/client/transport'
import { SseReconnect } from '../src/client/reconnect'
import { reconnectClient, resetClientForTests, setClientSetupForTests } from '../src/client/singleton'

interface Frame {
  id?: number
  event?: string
  data?: unknown
}

/** 假传输：`close()` 模拟壳侧 wrapper（`teardownListeners` ⇒ **回调被清**）；`emit()` 模拟 `daemon://frame` */
class FakeTransport {
  readonly kind = 'mock' as const
  closed = false
  connectCount = 0
  private handlers = new Set<(frame: Frame) => void>()

  async connect(): Promise<void> {
    this.connectCount += 1
  }

  async request(): Promise<unknown> {
    return {}
  }

  onEvent(handler: (frame: Frame) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /** 与 `transports/tauri.ts` 的 `close()` 同语义：**解注册 ⇒ 不再收帧** */
  close(): void {
    this.closed = true
    this.handlers.clear()
  }

  emit(frame: Frame): void {
    this.handlers.forEach((handler) => handler(frame))
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetClientForTests()
})

describe('令-SSE1 · 登录后 SSE 失联（换传输 ⇒ 帧回调断）', () => {
  it('Δ1／Δ2 换/不换传输：帧回调是否仍达（改前必红·改后必绿）', async () => {
    const transport = new FakeTransport()
    const asTransport = transport as unknown as RpcTransport
    setClientSetupForTests({ client: createClient(asTransport), transport: asTransport })

    const frames: Frame[] = []
    const reconnect = new SseReconnect({
      transport: asTransport,
      taskId: '*',
      subscribe: async () => ({ subscribed: true, latest_seq: 0, oldest_seq: 0 }),
    })
    reconnect.onDispatch((frame) => frames.push(frame as Frame))
    await reconnect.start()
    expect(transport.connectCount, '首连已建立').toBeGreaterThanOrEqual(1)

    transport.emit({ id: 1, event: 'token', data: { token: 'A' } })
    expect(frames.length, '前置：首连后帧可达').toBe(1)

    // ★ 被修对象：登录径调用（信令＝换/不换传输）
    await reconnectClient()

    transport.emit({ id: 2, event: 'token', data: { token: 'B' } })
    // ★ Δ2（改后必绿）／改前＝仍 1（旧传输被 close·handlers 清）⇒ 必红
    expect(frames.length, '同传输重连后帧仍须可达（改前：旧传输被 close ⇒ 断）').toBe(2)
    expect(
      transport.closed,
      'reconnectClient 不得 close 传输（close ⇒ 壳侧 unlisten ⇒ 帧不再来）',
    ).toBe(false)
    expect(reconnect, '重连器实例仍是挂在同一传输上的那个').toBeDefined()
    void vi
  })
})
