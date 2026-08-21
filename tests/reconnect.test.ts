import { afterEach, describe, expect, it, vi } from 'vitest'
import { RpcError, RPC_ERROR_CODES } from '../src/client/rpc'
import { SseReconnect } from '../src/client/reconnect'
import { createMockTransport } from '../src/client/transports/mock'
import type { EventSubscribeParams, EventSubscribeResult } from '../src/client/types'

function makeSubscribe(calls: EventSubscribeParams[]) {
  return async (params: EventSubscribeParams): Promise<EventSubscribeResult> => {
    calls.push(params)
    return { subscribed: true, latest_seq: 50, oldest_seq: 1 }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('SseReconnect', () => {
  it('首次订阅不带 last_event_id，收到 id=5 后重连续订 last_event_id=5', async () => {
    vi.useFakeTimers()
    const transport = createMockTransport()
    const calls: EventSubscribeParams[] = []
    const reconnect = new SseReconnect({
      transport,
      taskId: '*',
      subscribe: makeSubscribe(calls),
      heartbeatTimeoutMs: 1000,
      retryDelayMs: 10,
    })

    await reconnect.start()
    expect(calls[0]).toEqual({ task_id: '*' })

    transport.emit({ id: 5, event: 'token', data: { token: 'x' } })
    await vi.advanceTimersByTimeAsync(1500)
    expect(calls[1]).toMatchObject({ task_id: '*', last_event_id: 5 })

    reconnect.stop()
  })

  it('心跳按时到达不触发重连', async () => {
    vi.useFakeTimers()
    const transport = createMockTransport()
    const calls: EventSubscribeParams[] = []
    const reconnect = new SseReconnect({
      transport,
      taskId: '*',
      subscribe: makeSubscribe(calls),
      heartbeatTimeoutMs: 1000,
      retryDelayMs: 10,
    })

    await reconnect.start()
    for (let i = 0; i < 6; i += 1) {
      transport.emit({ event: 'heartbeat' })
      await vi.advanceTimersByTimeAsync(500)
    }
    expect(calls).toHaveLength(1)

    reconnect.stop()
  })

  it('RESYNC_REQUIRED 触发全量重同步（清空 last_event_id）', async () => {
    const transport = createMockTransport()
    const calls: EventSubscribeParams[] = []
    let failFirst = true
    const states: string[] = []
    let resyncInfo: { oldest_seq: number; latest_seq: number } | null = null
    const subscribe = async (params: EventSubscribeParams): Promise<EventSubscribeResult> => {
      calls.push(params)
      if (failFirst) {
        failFirst = false
        throw new RpcError({
          code: RPC_ERROR_CODES.RESYNC_REQUIRED,
          message: 'out of window',
          data: { oldest_seq: 1, latest_seq: 50 },
        })
      }
      return { subscribed: true, latest_seq: 50, oldest_seq: 1 }
    }
    const reconnect = new SseReconnect({
      transport,
      taskId: '*',
      subscribe,
      onStateChange: (state) => states.push(state),
      onResyncRequired: (info) => {
        resyncInfo = info
      },
    })

    await reconnect.start()
    expect(resyncInfo).toEqual({ oldest_seq: 1, latest_seq: 50 })
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual({ task_id: '*' })
    expect(states).toContain('resync')

    reconnect.stop()
  })

  it('指数退避：连续失败后重试间隔递增', async () => {
    vi.useFakeTimers()
    const transport = createMockTransport()
    let calls = 0
    const reconnect = new SseReconnect({
      transport,
      taskId: '*',
      subscribe: async () => {
        calls += 1
        throw new Error('boom')
      },
      heartbeatTimeoutMs: 1000,
      retryDelayMs: 50,
    })

    await reconnect.start()
    await vi.advanceTimersByTimeAsync(600)
    expect(calls).toBeGreaterThanOrEqual(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toBeGreaterThanOrEqual(3)
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls).toBeGreaterThanOrEqual(4)

    reconnect.stop()
  })

  it('stop 后可重新 start（事件订阅重新注册）', async () => {
    vi.useFakeTimers()
    const transport = createMockTransport()
    const calls: EventSubscribeParams[] = []
    const reconnect = new SseReconnect({
      transport,
      taskId: '*',
      subscribe: makeSubscribe(calls),
      heartbeatTimeoutMs: 1000,
      retryDelayMs: 10,
    })

    await reconnect.start()
    reconnect.stop()
    await reconnect.start()

    expect(calls).toHaveLength(2)
    reconnect.stop()
  })
})
