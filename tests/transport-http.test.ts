import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpTransport } from '../src/client/transports/http'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('http transport', () => {
  it('SSE 流解析事件并在流结束时触发 onDisconnect', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: token\ndata: {"x":1}\n\n'))
        controller.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200 })),
    )

    const events: string[] = []
    const disconnected = vi.fn()
    const transport = createHttpTransport({ baseUrl: 'http://127.0.0.1:1' })
    const offDisconnect = transport.onDisconnect(disconnected)
    transport.onEvent((frame) => events.push(frame.event))

    await transport.connect()
    expect(events).toEqual(['token'])
    await vi.waitFor(() => expect(disconnected).toHaveBeenCalledTimes(1))
    offDisconnect()
    transport.close()
  })

  it('JSON-RPC 请求解析 result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { enabled: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const transport = createHttpTransport({ baseUrl: 'http://127.0.0.1:1' })
    const result = await transport.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'a2a.status',
    })
    expect(result).toEqual({ enabled: true })
    transport.close()
  })
})
