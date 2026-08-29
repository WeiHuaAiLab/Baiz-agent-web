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
  const delay = options.frameDelayMs ?? 0

  // 串行任务队列：chat.send 的事件流按序播放（模拟后端单会话排队）——
  // 前一个任务播完（含 done 帧）后下一个才开始，否则排队的任务首帧立即到来
  // 会把队列镜像摘除，前端「排队中」面板一闪而过。
  const taskQueue: SseFrame[][] = []
  let playing = false

  const emitFrame = (frame: SseFrame) => {
    handlers.forEach((handler) => handler(frame))
  }

  const pump = () => {
    if (playing) return
    const fs = taskQueue.shift()
    if (!fs) return
    playing = true
    let index = 0
    const step = () => {
      if (index >= fs.length) {
        playing = false
        pump()
        return
      }
      emitFrame(fs[index])
      index += 1
      if (delay > 0) setTimeout(step, delay)
      else queueMicrotask(step)
    }
    if (delay > 0) setTimeout(step, delay)
    else queueMicrotask(step)
  }

  const playFrames = (fs: SseFrame[], serial: boolean) => {
    if (serial) {
      taskQueue.push(fs)
      pump()
    } else if (delay > 0) {
      fs.forEach((frame, index) => {
        setTimeout(() => emitFrame(frame), delay * (index + 1))
      })
    } else {
      fs.forEach((frame) => {
        queueMicrotask(() => emitFrame(frame))
      })
    }
  }

  const transport: MockTransport = {
    kind: 'mock',
    requests,
    async connect() {
      for (const frame of frames) {
        emitFrame(frame)
      }
    },
    async request(req) {
      requests.push(req)
      const handled = options.handle?.(req)
      if (handled) {
        if (handled.frames?.length) {
          // chat.send 串行播放（模拟排队）；其余（如审批响应）立即播放
          playFrames(handled.frames, req.method === 'chat.send')
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
      emitFrame(frame)
    },
  }

  return transport
}
