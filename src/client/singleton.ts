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
 * **MSG-3573 · P1丙**：**换新连接**（登录成功后同进程重载必须走**新 client**／新会话，
 * 不得沿用登录前的旧连接——旧连接上的会话面可能仍绑着上一枚令牌）。
 *
 * 做法：先 `close()` 旧传输（释放 listen／在途订阅），再建**全新** client＋transport 并
 * `connect()` ⇒ 返回新 setup。失败**上抛**（由调用方显式处置，禁静默）。
 */
export async function reconnectClient(): Promise<ClientSetup> {
  const previous = setup
  setup = null
  try {
    previous?.transport.close?.()
  } catch {
    /* 旧连接 close 失败不阻断换新（内存引用已弃） */
  }
  const next = getClientSetup()
  await next.client.connect()
  return next
}

export function resetClientForTests(): void {
  setup = null
}
