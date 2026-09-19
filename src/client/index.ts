// BaizClient 门面：7 个生产方法 + 事件订阅，全部基于 RpcClient。
import { RpcClient } from './rpc'
import type { RpcTransport } from './transport'
import type { SseFrame } from './sse'
import type {
  A2aStatusResult,
  ApprovalEscalateParams,
  ApprovalPolicyResult,
  ApprovalRevokeParams,
  ApprovalRule,
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
  TaskResumeParams,
  TaskResumeResult,
  PendingApproval,
  PermissionRespondParams,
  PreviewReadParams,
  PreviewReadResult,
  ScheduleCreateParams,
  ScheduleRun,
  ScheduleTask,
} from './types'

export interface BaizClient {
  connect(): Promise<void>
  handshake(params: AuthHandshakeParams): Promise<AuthHandshakeResult>
  subscribe(params: EventSubscribeParams): Promise<EventSubscribeResult>
  /**
   * F4 挡板（MSG-2322）：首连 handshake——短连接 event.subscribe（缺省分支
   * 返回 latest_seq 即断；tauri 面 proxy_rpc 读 result 行即关，http 面 /rpc），
   * 供 SseReconnect 取 daemon 当前最新事件 seq 作订阅基线（零重放）。
   */
  probeEventSeq(): Promise<number>
  provideKey(key: string): Promise<{ stored: boolean }>
  chatSend(params: ChatSendParams): Promise<ChatSendResult>
  /** 停止在途任务（task.cancel 语义，勿与队列单条取消混用） */
  chatQueueCancel(params: ChatQueueCancelParams): Promise<ChatQueueCancelResult>
  /** MSG-2722 L3 编程 UI：ToolLoop Blocked 人工回传续跑（daemon tool_loop.resume） */
  taskResume(params: TaskResumeParams): Promise<TaskResumeResult>
  /** 标准 §B：队列单条取消（chat.queue_cancel） */
  queueCancel(params: ChatQueueCancelParams): Promise<ChatQueueCancelResult>
  permissionPending(): Promise<{ pending: PendingApproval[] }>
  permissionRespond(params: PermissionRespondParams): Promise<{ resolved: boolean; status: string }>
  /** 标准 §B：规则管理页数据源（规则对象数组） */
  approvalRules(): Promise<ApprovalRule[]>
  /** 标准 §B：撤销规则——撤销后必重弹 */
  approvalRevoke(params: ApprovalRevokeParams): Promise<unknown>
  /** 标准 §B：可机判优先级表（设置页展示） */
  approvalPolicy(): Promise<ApprovalPolicyResult>
  /** 标准 §B：申请放行（升级≠免审——批准后仍走审批执行） */
  approvalEscalate(params: ApprovalEscalateParams): Promise<unknown>
  authLogin(params: AuthLoginParams): Promise<AuthLoginResult>
  a2aStatus(): Promise<A2aStatusResult>
  // DEBT-546 定时任务真链：schedule.* 五方法（daemon 侧调度注册表/RPC 在案）
  scheduleCreate(params: ScheduleCreateParams): Promise<{ id: string }>
  scheduleList(): Promise<ScheduleTask[]>
  scheduleToggle(taskId: string, enabled: boolean): Promise<{ ok: boolean }>
  scheduleDelete(taskId: string): Promise<{ ok: boolean }>
  scheduleListRuns(taskId: string, limit?: number): Promise<ScheduleRun[]>
  /** MSG-3014 包131：只读文件内容预览（daemon file.preview——授权目录钉死） */
  previewRead(params: PreviewReadParams): Promise<PreviewReadResult>
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
    // F4：短连接探测 event.subscribe（缺省分支）→ result.latest_seq；
    // 失败上抛由 SseReconnect.probeLatest 降级收口
    probeEventSeq: async () => {
      const result = await rpc.call<EventSubscribeResult>('event.subscribe', { task_id: '*' })
      return result?.latest_seq ?? 0
    },
    provideKey: (key) => rpc.call('auth.provide_key', { key }),
    authLogin: (params) => rpc.call('auth.login', params),
    chatSend: (params) => rpc.call('chat.send', params),
    // MSG-2311 映射修：daemon 路由表零 chat.queue_cancel、task.cancel
    // 在案（找茬/试刀双擒）——语义对卯（取消在途任务）改映射
    chatQueueCancel: (params) => rpc.call('task.cancel', { task_id: params.task_id }),
    // MSG-2722：Blocked 人工回传续跑（daemon handler tool_loop.resume——
    // task_id＋note——authorize 走 rpc 层统一 token 注入）
    taskResume: (params) => rpc.call('tool_loop.resume', { task_id: params.task_id, note: params.note }),
    // 标准 v1.0 §B：队列单条取消（1.0.16 起 daemon 侧有 chat.queue_cancel）
    queueCancel: (params) =>
      rpc.call('chat.queue_cancel', {
        conversation_id: params.conversation_id,
        task_id: params.task_id,
      }),
    permissionPending: () => rpc.call('permission.pending'),
    permissionRespond: (params) => rpc.call('permission.respond', params),
    approvalRules: async () => {
      const result = await rpc.call<ApprovalRule[] | { rules?: ApprovalRule[] }>('approval.rules')
      if (Array.isArray(result)) return result
      return Array.isArray(result?.rules) ? result.rules : []
    },
    approvalRevoke: (params) => rpc.call('approval.revoke', params),
    approvalPolicy: () => rpc.call('approval.policy'),
    approvalEscalate: (params) => rpc.call('approval.escalate', params),
    a2aStatus: () => rpc.call('a2a.status'),
    // DEBT-546：daemon schedule.* 五方法（对卯 handler dispatch 同名）
    scheduleCreate: (params) => rpc.call('schedule.create', params),
    scheduleList: () => rpc.call('schedule.list'),
    scheduleToggle: (taskId, enabled) => rpc.call('schedule.toggle', { task_id: taskId, enabled }),
    scheduleDelete: (taskId) => rpc.call('schedule.delete', { task_id: taskId }),
    scheduleListRuns: (taskId, limit) =>
      rpc.call('schedule.list_runs', { task_id: taskId, limit: limit ?? 20 }),
    // MSG-3014：daemon file.preview（对卯 handler dispatch 同名）
    previewRead: (params) =>
      rpc.call<PreviewReadResult>('file.preview', {
        path: params.path,
        ...(params.max_bytes !== undefined ? { max_bytes: params.max_bytes } : {}),
        ...(params.workspace ? { workspace: params.workspace } : {}),
      }),
    onEvent: (handler) => transport.onEvent(handler),
    close: () => transport.close(),
  }
}
