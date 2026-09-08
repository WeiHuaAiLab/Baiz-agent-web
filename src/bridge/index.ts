// 环境检测与桥接注入：web/tauri 按运行时选择能力实现。
import type { Bridge, Runtime } from './types'
import { createTauriBridge } from './tauri'
import { createWebBridge } from './web'

export * from './types'

export function detectRuntime(): Runtime {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'tauri' : 'web'
}

let instance: Bridge | null = null

export function getBridge(): Bridge {
  if (!instance) {
    instance = detectRuntime() === 'tauri' ? createTauriBridge() : createWebBridge()
  }
  return instance
}

export function resetBridgeForTests(bridge: Bridge): void {
  instance = bridge
}

/// MSG-2805 DEBT-569 版本显面：应用版本（tauri 径读壳 conf version——
/// @tauri-apps/api/app getVersion 同源；web 径无壳——诚实 null 勿假值；
/// 桥未通（getVersion 失败）亦 null——UI 侧诚实文案兜底）
export async function detectVersion(): Promise<string | null> {
  if (detectRuntime() !== 'tauri') {
    return null
  }
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    return await getVersion()
  } catch {
    return null
  }
}
