import type { SseFrame } from './sse'
import type { RpcRequest } from './rpc'

// 传输抽象：JSON-RPC 请求 + SSE 事件流 + 断连通知；tauri/http/mock 三实现。
export type TransportKind = 'tauri' | 'http' | 'mock'

export interface RpcTransport {
  readonly kind: TransportKind
  connect(): Promise<void>
  /**
   * DEBT-277（裁1015①）：订阅先行口——前端自报 client_task_id 建订阅；
   * tauri 实现走 proxy_subscribe 长连接，http/mock 无此面（可选）。
   */
  subscribe?(taskId: string, lastEventId?: number): Promise<void>
  /** 中止在途连接/流（供重连前清理），不改变连接的永久状态。 */
  abort?(): void
  request(req: RpcRequest): Promise<unknown>
  onEvent(handler: (frame: SseFrame) => void): () => void
  onDisconnect?(handler: () => void): () => void
  close(): void
}
