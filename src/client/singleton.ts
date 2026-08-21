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

export function resetClientForTests(): void {
  setup = null
}
