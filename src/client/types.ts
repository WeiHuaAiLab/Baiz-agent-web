export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_approval'

export interface AuthHandshakeParams {
  client_type: 'gui' | 'cli' | 'tui'
  client_version: string
  capability_token?: string
}

export interface AuthHandshakeResult {
  auth_token: string
  daemon_version: string
  server_time: string
}

export interface EventSubscribeParams {
  task_id: string
  last_event_id?: number
}

export interface EventSubscribeResult {
  subscribed: boolean
  latest_seq: number
  oldest_seq: number
}

export interface ChatSendParams {
  message: string
  workspace?: string
  conversation_id?: string
  client_task_id?: string
  mode?: string
  /** 批0 消息排队：显式「排队」语义（Tab 触发）；缺省=Enter 发送/注入语义。
   * 后端 busy 时一律 FIFO 入队（单活跃轮次绝不并发），该字段 1.0 仅做语义标记，
   * 2.0 供 Enter 注入（steer）与 Tab 排队分流。 */
  queue?: boolean
}

export interface ChatSendResult {
  task_id: string
  status: string
  model: string
  /** 批0 消息排队：true = 本轮已入队（后端忙），position 为队列位置（1 起） */
  queued?: boolean
  position?: number
}

export interface ChatQueueCancelParams {
  conversation_id: string
  task_id: string
}

export interface ChatQueueCancelResult {
  cancelled: boolean
  position?: number
}

export interface PendingApproval {
  request_id: string
  action: string
  risk: string
  details?: string
}

export interface PermissionRespondParams {
  request_id: string
  approved: boolean
}

export interface A2aStatusResult {
  enabled: boolean
  bind_address?: string
  tasks: number
}

export interface TokenData {
  task_id: string
  token: string
}

export interface ReasoningData {
  task_id: string
  reasoning: string
}

export interface ToolCallData {
  task_id: string
  call_id: string
  tool_name: string
  args_preview: string
}

export interface ToolResultData {
  task_id: string
  call_id: string
  success: boolean
  preview: string
}

export interface ApprovalRequiredData {
  request_id: string
  task_id: string
  tool_name: string
  args_preview: string
}

export interface PermissionRequestData {
  request_id: string
  action: string
  risk: string
  details?: string
}

export interface DoneData {
  task_id: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ErrorData {
  task_id: string
  message: string
}

export interface DaemonNotifyData {
  level: string
  message: string
}

export interface BriefReadyData {
  brief_id: string
}

export interface MessageEventData {
  kind: string
  payload: unknown
  timestamp: string
}
