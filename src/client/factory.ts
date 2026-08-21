// 传输工厂：tauri → Tauri invoke；VITE_BAIZ_GATEWAY → HTTP 网关；否则 mock 演示。
import { getBridge } from '../bridge'
import { demoHandle } from '../demo/script'
import { createClient } from './index'
import type { BaizClient } from './index'
import type { RpcTransport } from './transport'
import { createHttpTransport } from './transports/http'
import { createMockTransport } from './transports/mock'
import { createTauriTransport } from './transports/tauri'

export function createDefaultTransport(): RpcTransport {
  const bridge = getBridge()
  if (bridge.runtime === 'tauri') {
    return createTauriTransport()
  }
  const gateway = import.meta.env.VITE_BAIZ_GATEWAY as string | undefined
  if (gateway) {
    return createHttpTransport({ baseUrl: gateway })
  }
  return createMockTransport({ handle: demoHandle, frameDelayMs: 50 })
}

export function createDefaultClient(): BaizClient {
  return createClient(createDefaultTransport())
}
