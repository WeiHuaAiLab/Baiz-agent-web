// Mock 传输：脚本化响应 + 帧回放（demoHandle），测试与演示共用。
import { RpcError } from '../rpc'
import type { RpcRequest } from '../rpc'
import type { RpcTransport } from '../transport'
import type { SseFrame } from '../sse'

export interface MockTransportOptions {
  results?: Record<string, unknown>
  frames?: SseFrame[]
  frameDelayMs?: number
  handle?: (req: RpcRequest) => { result?: unknown; frames?: SseFrame[] } | null | undefined
}

export interface MockTransport extends RpcTransport {
  requests: RpcRequest[]
  emit(frame: SseFrame): void
}

export function createMockTransport(options: MockTransportOptions = {}): MockTransport {
  const handlers = new Set<(frame: SseFrame) => void>()
  const requests: RpcRequest[] = []
  const results = options.results ?? {}
  const frames = [...(options.frames ?? [])]

  const transport: MockTransport = {
    kind: 'mock',
    requests,
    async connect() {
      for (const frame of frames) {
        handlers.forEach((handler) => handler(frame))
      }
    },
    async request(req) {
      requests.push(req)
      const handled = options.handle?.(req)
      if (handled) {
        if (handled.frames?.length) {
          const delay = options.frameDelayMs ?? 0
          handled.frames.forEach((frame, index) => {
            const emit = () => {
              handlers.forEach((handler) => handler(frame))
            }
            if (delay > 0) setTimeout(emit, delay * (index + 1))
            else queueMicrotask(emit)
          })
        }
        if (handled.result !== undefined) return handled.result
        throw new RpcError({ code: -32601, message: `no mock result for ${req.method}` })
      }
      if (req.method in results) return results[req.method]
      throw new RpcError({ code: -32601, message: `no mock result for ${req.method}` })
    },
    onEvent(handler) {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    close() {
      handlers.clear()
    },
    emit(frame) {
      handlers.forEach((handler) => handler(frame))
    },
  }

  return transport
}
