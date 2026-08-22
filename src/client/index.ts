// BaizClient 门面：7 个生产方法 + 事件订阅，全部基于 RpcClient。
import { RpcClient } from './rpc'
import type { RpcTransport } from './transport'
import type { SseFrame } from './sse'
import type {
  A2aStatusResult,
  AuthHandshakeParams,
  AuthHandshakeResult,
  ChatSendParams,
  ChatSendResult,
  EventSubscribeParams,
  EventSubscribeResult,
  PendingApproval,
  PermissionRespondParams,
} from './types'

export interface BaizClient {
  connect(): Promise<void>
  handshake(params: AuthHandshakeParams): Promise<AuthHandshakeResult>
  subscribe(params: EventSubscribeParams): Promise<EventSubscribeResult>
  provideKey(key: string): Promise<{ stored: boolean }>
  chatSend(params: ChatSendParams): Promise<ChatSendResult>
  permissionPending(): Promise<{ pending: PendingApproval[] }>
  permissionRespond(params: PermissionRespondParams): Promise<{ resolved: boolean; status: string }>
  a2aStatus(): Promise<A2aStatusResult>
  onEvent(handler: (frame: SseFrame) => void): () => void
  close(): void
}

export function createClient(transport: RpcTransport): BaizClient {
  const rpc = new RpcClient(transport)
  return {
    connect: () => transport.connect(),
    handshake: (params) => rpc.call('auth.handshake', params),
    // DEBT-277（裁1015①）：tauri 面走 proxy_subscribe 长连接（订阅先行
    // 口径）；http/mock 无此面回落 event.subscribe RPC
    subscribe: (params) => {
      if (transport.subscribe) {
        return transport
          .subscribe(params.task_id ?? '', params.last_event_id)
          .then(() => ({ subscribed: true, latest_seq: 0, oldest_seq: 0 }))
      }
      return rpc.call('event.subscribe', params)
    },
    provideKey: (key) => rpc.call('auth.provide_key', { key }),
    chatSend: (params) => rpc.call('chat.send', params),
    permissionPending: () => rpc.call('permission.pending'),
    permissionRespond: (params) => rpc.call('permission.respond', params),
    a2aStatus: () => rpc.call('a2a.status'),
    onEvent: (handler) => transport.onEvent(handler),
    close: () => transport.close(),
  }
}
