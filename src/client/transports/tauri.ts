// Tauri 传输：invoke proxy_rpc + 事件通道 daemon://frame（Rust 壳实现后启用）。
import { RpcError } from '../rpc'
import type { RpcRequest } from '../rpc'
import type { RpcTransport } from '../transport'
import type { SseFrame } from '../sse'
import { createMockTransport } from './mock'
import { demoHandle } from '../../demo/script'
import { useUiStore } from '../../stores/ui'
import { useSettingsStore } from '../../stores/settings'

interface TauriInvokeError {
  code: number
  message: string
  data?: unknown
}

function createRealTauriTransport(): RpcTransport {
  const handlers = new Set<(frame: SseFrame) => void>()
  const disconnectHandlers = new Set<() => void>()
  let unlisten: (() => void) | null = null
  let unlistenDisconnect: (() => void) | null = null

  return {
    kind: 'tauri',
    async connect() {
      const { listen } = await import('@tauri-apps/api/event')
      unlisten = await listen<SseFrame>('daemon://frame', (event) => {
        handlers.forEach((handler) => handler(event.payload))
      })
      // P2 修复（2026-08-22）：Rust 壳订阅循环退出时 emit daemon://disconnect，
      // 前端即时触发重连（SseReconnect.onDisconnect），不再等 90s 看门狗。
      unlistenDisconnect = await listen<void>('daemon://disconnect', () => {
        disconnectHandlers.forEach((handler) => handler())
      })
      // DEBT-277（裁1015①）：connect 不再空订阅（红1：空 task_id 订阅
      // 必败且败相静默）——订阅由 subscribe(taskId) 按发送轮先行建立
    },
    async subscribe(taskId: string, lastEventId?: number) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('proxy_subscribe', { taskId, lastEventId })
    },
    async abort() {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('proxy_abort').catch(() => undefined)
    },
    async request(req: RpcRequest) {
      const { invoke } = await import('@tauri-apps/api/core')
      try {
        return await invoke<unknown>('proxy_rpc', { request: req })
      } catch (error) {
        throw new RpcError(error as TauriInvokeError)
      }
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
      unlisten?.()
      unlisten = null
      unlistenDisconnect?.()
      unlistenDisconnect = null
    },
  }
}

// 智能回退：Tauri proxy 桩未实现时自动切到 mock，保证安装包/开发态可完整演示。
export function createTauriTransport(): RpcTransport {
  const handlers = new Set<(frame: SseFrame) => void>()
  const disconnectHandlers = new Set<() => void>()
  let real: RpcTransport | null = null
  let mode: 'tauri' | 'mock' = 'tauri'
  const mock = createMockTransport({ handle: demoHandle, frameDelayMs: 50 })
  mock.onEvent((frame) => handlers.forEach((handler) => handler(frame)))

  function useMock() {
    if (mode === 'mock') return
    mode = 'mock'
    useSettingsStore().setDemoMode(true)
    useUiStore().toast('未连接 daemon，已切换演示模式', 'info')
  }

  return {
    kind: 'tauri',
    async connect() {
      if (mode === 'mock') {
        await mock.connect()
        return
      }
      try {
        if (!real) {
          // 实例缓存复用：避免每次 connect() 重复注册 handler 造成事件重复投递
          const tauri = createRealTauriTransport()
          tauri.onEvent((frame) => handlers.forEach((handler) => handler(frame)))
          tauri.onDisconnect?.(() => disconnectHandlers.forEach((handler) => handler()))
          real = tauri
        }
        await real.connect()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/not implemented/i.test(message)) {
          // 仅"后端未实现"才降级演示模式；网络抖动等真实错误继续走重连
          useMock()
          await mock.connect()
        } else {
          throw error
        }
      }
    },
    async subscribe(taskId: string, lastEventId?: number) {
      if (mode === 'mock') return
      if (!real) throw new RpcError({ code: -32603, message: 'transport not connected' })
      await real.subscribe?.(taskId, lastEventId)
    },
    async request(req: RpcRequest) {
      if (mode === 'mock') return mock.request(req)
      if (!real) throw new RpcError({ code: -32603, message: 'transport not connected' })
      return real.request(req)
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
      mock.close()
      real?.close()
      real = null
    },
    abort() {
      real?.abort?.()
    },
  }
}
