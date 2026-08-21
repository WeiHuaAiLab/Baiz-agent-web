// HTTP 传输：/rpc 走 JSON-RPC，/stream 走 SSE；流结束触发 onDisconnect。
import { RpcError, isRpcFailure } from '../rpc'
import type { RpcRequest } from '../rpc'
import type { RpcTransport } from '../transport'
import { SseParser } from '../sse'
import type { SseFrame } from '../sse'

export interface HttpTransportOptions {
  baseUrl: string
  token?: string
}

export function createHttpTransport(options: HttpTransportOptions): RpcTransport {
  const { baseUrl, token } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let abort: AbortController | null = null
  let closed = false
  let generation = 0
  const handlers = new Set<(frame: SseFrame) => void>()
  const disconnectHandlers = new Set<() => void>()
  const parser = new SseParser((frame) => {
    handlers.forEach((handler) => handler(frame))
  })

  async function readLoop(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    gen: number,
  ): Promise<void> {
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
      }
    } finally {
      // 代际不符 = 主动 abort（重连前清理），不触发断连回调
      if (!closed && gen === generation) disconnectHandlers.forEach((handler) => handler())
    }
  }

  return {
    kind: 'http',
    async connect() {
      generation += 1
      const controller = new AbortController()
      abort = controller
      const response = await fetch(`${baseUrl}/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ op: 'subscribe' }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error(`http stream failed: ${response.status}`)
      }
      void readLoop(response.body.getReader(), generation)
    },
    abort() {
      generation += 1
      abort?.abort()
      abort = null
    },
    async request(req) {
      const response = await fetch(`${baseUrl}/rpc`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
      })
      const payload = (await response.json()) as unknown
      if (isRpcFailure(payload)) throw new RpcError(payload.error)
      if (payload && typeof payload === 'object' && 'result' in payload) {
        return (payload as { result: unknown }).result
      }
      throw new Error(`malformed rpc response for ${req.method}`)
    },
    onEvent(handler) {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    onDisconnect(handler) {
      disconnectHandlers.add(handler)
      return () => {
        disconnectHandlers.delete(handler)
      }
    },
    close() {
      closed = true
      abort?.abort()
      abort = null
    },
  }
}
