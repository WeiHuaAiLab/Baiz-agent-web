import type { SseFrame } from './sse'
import type { RpcRequest } from './rpc'

// 传输抽象：JSON-RPC 请求 + SSE 事件流 + 断连通知；tauri/http/mock 三实现。
export type TransportKind = 'tauri' | 'http' | 'mock'

export interface RpcTransport {
  readonly kind: TransportKind
  connect(): Promise<void>
  /** 中止在途连接/流（供重连前清理），不改变连接的永久状态。 */
  abort?(): void
  request(req: RpcRequest): Promise<unknown>
  onEvent(handler: (frame: SseFrame) => void): () => void
  onDisconnect?(handler: () => void): () => void
  close(): void
}
