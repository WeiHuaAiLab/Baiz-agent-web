import { createDefaultTransport } from './factory'
import { createClient } from './index'
import type { BaizClient } from './index'
import type { RpcTransport } from './transport'

// 客户端单例：启动时创建一次，暴露 client + transport 供重连管理器使用。
export interface ClientSetup {
  client: BaizClient
  transport: RpcTransport
}

let setup: ClientSetup | null = null

export function getClientSetup(): ClientSetup {
  if (!setup) {
    const transport = createDefaultTransport()
    setup = { client: createClient(transport), transport }
  }
  return setup
}

export function getClient(): BaizClient {
  return getClientSetup().client
}

/**
 * **MSG-3573 · P1丙**：**换新 client／新会话**（登录成功后同进程重载不得沿用旧会话）。
 *
 * **`令-SSE1` 甲案（2026-09-25）**：**只换 client 门面·不换传输**——旧口径
 * `previous?.transport.close?.()` 会把壳侧 `daemon://frame` 的 listen 一并 teardown
 * （`transports/tauri.ts:200-203` ⇒ `teardownListeners()`），而 `SseReconnect` 在 boot 时
 * **只把帧/断线/resync 回调注册在那一枚传输上**（`main.ts:94-99`／`reconnect.ts:68-73`）
 * ⇒ **同进程登录后帧不再路由**（＝「回复已落库·界面一直生成中…」的成因）。
 *
 * 现口径：**同一 transport** ⇒ 该传输的 `handlers` 集**保留** ⇒ **SSE 链不断**；
 * 仍新建 `client` 门面并 `connect()` 重连（**新客户面＋重连会话**之令面要求不受损·令牌随每调用入参）。
 * 失败**上抛**（由调用方显式处置，禁静默）。
 */
export async function reconnectClient(): Promise<ClientSetup> {
  const current = getClientSetup()
  const client = createClient(current.transport)
  setup = { client, transport: current.transport }
  await client.connect()
  return setup
}

export function resetClientForTests(): void {
  setup = null
}

/** **SSE1 红证**：测试用——注入自定义 setup（**假传输**），以复现「登录后换传输 ⇒ 帧回调断」链。 */
export function setClientSetupForTests(next: ClientSetup): void {
  setup = next
}
