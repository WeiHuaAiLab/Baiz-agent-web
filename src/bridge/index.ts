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
