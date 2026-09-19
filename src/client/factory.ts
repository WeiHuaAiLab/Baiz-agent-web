// 传输工厂：tauri → Tauri invoke；VITE_BAIZ_GATEWAY → HTTP 网关；
// 演示（mock）**必须显式开启**（`VITE_BAIZ_DEMO=1` 或 dev 构建）；否则**显式失败**。
//
// DEBT-738（MSG-3148）：旧版结尾是「否则 return createMockTransport(...)」——
// **生产里静默兜底演示传输**，于是任意账号密码都能"登进去"（假登录，测试员实测）。
// 现口径：生产禁兜底；取不到传输 ⇒ 抛 NoDaemonTransportError ⇒ 界面挂
// 「无法连接本地服务」页，**绝不进主应用**。
import { getBridge } from '../bridge'
import { demoHandle } from '../demo/script'
import { createClient } from './index'
import type { BaizClient } from './index'
import type { RpcTransport } from './transport'
import type { Runtime } from '../bridge'
import { createHttpTransport } from './transports/http'
import { createMockTransport } from './transports/mock'
import { createTauriTransport } from './transports/tauri'

/** 传输选择：`none` ＝ 生产且既未配网关、也未开演示 ⇒ 必须显式失败 */
export type TransportChoice = 'tauri' | 'http' | 'mock' | 'none'

export interface TransportEnv {
  runtime: Runtime
  gateway?: string
  /** `VITE_BAIZ_DEMO`（字符串；`'1'` 才开） */
  demo?: string
  /** Vite `import.meta.env.DEV` */
  dev?: boolean
}

/**
 * 纯函数（可机判/可测）：**生产（dev=false）下绝不回落 mock**——
 * 只认 tauri 运行时、显式网关、或显式演示开关。
 */
export function resolveTransportChoice(env: TransportEnv): TransportChoice {
  if (env.runtime === 'tauri') return 'tauri'
  if (env.gateway && env.gateway.trim()) return 'http'
  if (String(env.demo ?? '') === '1' || env.dev === true) return 'mock'
  return 'none'
}

/** 无可用传输（生产禁兜底）：供入口层挂「无法连接本地服务」页 */
export class NoDaemonTransportError extends Error {
  constructor(detail = '未配置本地服务（daemon）连接方式') {
    super(detail)
    this.name = 'NoDaemonTransportError'
  }
}

export function createDefaultTransport(): RpcTransport {
  const bridge = getBridge()
  const env: TransportEnv = {
    runtime: bridge.runtime,
    gateway: import.meta.env.VITE_BAIZ_GATEWAY as string | undefined,
    demo: import.meta.env.VITE_BAIZ_DEMO as string | undefined,
    dev: import.meta.env.DEV,
  }
  switch (resolveTransportChoice(env)) {
    case 'tauri':
      return createTauriTransport()
    case 'http':
      return createHttpTransport({ baseUrl: env.gateway as string })
    case 'mock':
      return createMockTransport({ handle: demoHandle, frameDelayMs: 50 })
    default:
      // DEBT-738：生产禁静默兜底——显式失败（绝不"随便登进去"）
      throw new NoDaemonTransportError(
        '未连接本地服务：本构建未配置网关（VITE_BAIZ_GATEWAY），也未开启演示模式（VITE_BAIZ_DEMO=1）',
      )
  }
}

export function createDefaultClient(): BaizClient {
  return createClient(createDefaultTransport())
}
