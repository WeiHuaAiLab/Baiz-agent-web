// BaizClient 门面：7 个生产方法 + 事件订阅，全部基于 RpcClient。
import { RpcClient } from './rpc'
import type { RpcTransport } from './transport'
import type { SseFrame } from './sse'
import type {
  A2aStatusResult,
  AuthHandshakeParams,
  AuthLoginParams,
  AuthLoginResult,
  AuthHandshakeResult,
  ChatSendParams,
  ChatSendResult,
  ChatQueueCancelParams,
  ChatQueueCancelResult,
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
  chatQueueCancel(params: ChatQueueCancelParams): Promise<ChatQueueCancelResult>
  permissionPending(): Promise<{ pending: PendingApproval[] }>
  permissionRespond(params: PermissionRespondParams): Promise<{ resolved: boolean; status: string }>
  authLogin(params: AuthLoginParams): Promise<AuthLoginResult>
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
    authLogin: (params) => rpc.call('auth.login', params),
    chatSend: (params) => rpc.call('chat.send', params),
    // MSG-2311 映射修：daemon 路由表零 chat.queue_cancel、task.cancel
    // 在案（找茬/试刀双擒）——语义对卯（取消在途任务）改映射
    chatQueueCancel: (params) => rpc.call('task.cancel', { task_id: params.task_id }),
    permissionPending: () => rpc.call('permission.pending'),
    permissionRespond: (params) => rpc.call('permission.respond', params),
    a2aStatus: () => rpc.call('a2a.status'),
    onEvent: (handler) => transport.onEvent(handler),
    close: () => transport.close(),
  }
}
