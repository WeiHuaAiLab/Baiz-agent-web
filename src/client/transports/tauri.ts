// Tauri 传输：invoke proxy_rpc + 事件通道 daemon://frame（Rust 壳实现后启用）。
import { RpcError } from '../rpc'
import type { RpcRequest } from '../rpc'
import type { ResyncInfo, RpcTransport } from '../transport'
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
  const resyncHandlers = new Set<(info: ResyncInfo) => void>()
  let unlisten: (() => void) | null = null
  let unlistenDisconnect: (() => void) | null = null
  let unlistenResync: (() => void) | null = null

  // DEBT-549（MSG-2677）：connect 先清旧 listen——重连风暴中每次 connect
  // 均新 listen 而不 unlisten 旧（泄漏累积：帧/事件被 N 份 listen 重复分发
  // ——disconnect 竞态重复排程＋帧重复消费）。先清后建——零泄漏。
  function teardownListeners(): void {
    unlisten?.()
    unlisten = null
    unlistenDisconnect?.()
    unlistenDisconnect = null
    unlistenResync?.()
    unlistenResync = null
  }

  return {
    kind: 'tauri',
    async connect() {
      teardownListeners()
      const { listen } = await import('@tauri-apps/api/event')
      unlisten = await listen<SseFrame>('daemon://frame', (event) => {
        handlers.forEach((handler) => handler(event.payload))
      })
      // P2 修复（2026-08-22）：Rust 壳订阅循环退出时 emit daemon://disconnect，
      // 前端即时触发重连（SseReconnect.onDisconnect），不再等 90s 看门狗。
      unlistenDisconnect = await listen<void>('daemon://disconnect', () => {
        disconnectHandlers.forEach((handler) => handler())
      })
      // MSG-2604 修面一：订阅基线出窗（resync_required）——壳显式
      // daemon://resync 上达（oldest/latest）——前端自窗头续订勿丢在飞尾帧
      unlistenResync = await listen<ResyncInfo>('daemon://resync', (event) => {
        resyncHandlers.forEach((handler) => handler(event.payload))
      })
      // DEBT-277（裁1015①）：connect 不再空订阅（红1：空 task_id 订阅
      // 必败且败相静默）——订阅由 subscribe(taskId) 按发送轮先行建立
    },
    async subscribe(taskId: string, lastEventId?: number) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('proxy_subscribe', { taskId, lastEventId })
    },
    // MSG-2609 修面一：tauri 传输 abort 语义 no-op——壳 proxy_rpc 长 RPC
    // （chat.send 600s 窗）在途时 reconnect 清场若 invoke proxy_abort 会经
    // 壳单槽 rpc_abort 误杀长 RPC（假失败——用户见败实成：daemon 照跑至
    // done——chat-7/8 实证 10053）；真停 run 走 stopRun→task.cancel RPC
    // 径（勿经此处）；http 传输的 abort 清流语义由 http 实现自理。
    async abort() {},
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
    onResync(handler) {
      resyncHandlers.add(handler)
      return () => {
        resyncHandlers.delete(handler)
      }
    },
    close() {
      teardownListeners()
    },
  }
}

// 智能回退：Tauri proxy 桩未实现时自动切到 mock，保证安装包/开发态可完整演示。
export function createTauriTransport(): RpcTransport {
  const handlers = new Set<(frame: SseFrame) => void>()
  const disconnectHandlers = new Set<() => void>()
  const resyncHandlers = new Set<(info: ResyncInfo) => void>()
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
          tauri.onResync?.((info) => resyncHandlers.forEach((handler) => handler(info)))
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
    onResync(handler) {
      resyncHandlers.add(handler)
      return () => {
        resyncHandlers.delete(handler)
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
