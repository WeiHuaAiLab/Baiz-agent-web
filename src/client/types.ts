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

// MSG-2287 备胎计划：登录对接（auth.login——daemon 侧 DEBT-398 已落库）
export interface AuthLoginParams {
  email: string
  password: string
}

export interface AuthLoginResult {
  session_token: string
  user_id: string
  provider: string
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

// MSG-2722 L3 编程 UI：ToolLoop Blocked 人工回传续跑（桥 daemon
// tool_loop.resume——task_id＋note 人工回传文本）
export interface TaskResumeParams {
  task_id: string
  note: string
}

export interface TaskResumeResult {
  resumed: boolean
  detail?: string
}

export interface ChatSendParams {
  message: string
  workspace?: string
  conversation_id?: string
  client_task_id?: string
  mode?: string
  /** MSG-2341（A-4 升格）：设置面所选模型透传——daemon DEBT-229 件1 已落
   * （Option<String> 直进 build_chat_request 真消费；None 兜底 default_model） */
  model?: string
  /** MSG-2893 DEBT-597 目①：图片附件直送——image dataUrl 入 daemon
   *  image_data_url（图文混合轮 user_with_image——视觉档模型可读——
   *  勿只本地缩略图） */
  image_data_url?: string
}

export interface ChatSendResult {
  task_id: string
  status: string
  model: string
}

export interface ChatQueueCancelParams {
  conversation_id: string
  task_id: string
}

export interface ChatQueueCancelResult {
  cancelled: boolean
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

// ── DEBT-546 schedule.* 契约（daemon ScheduleSpec/RunRecord 全字段形）──

/** 调度任务（daemon tasks 行 ↔ schedule.list 回显） */
export interface ScheduleTask {
  id: string
  title: string
  instruction: string
  /** 'cloud' | 'local' */
  mode: string
  /** 'monthly'|'weekly'|'daily'|'hourly'|'interval'|'once' */
  cycle: string
  day: number
  weekday: number
  timeSecs: number
  everySecs: number
  runAtSecs: number
  enabled: boolean
  createdAt: number
  updatedAt: number
}

/** schedule.create 入参（前端 draft 转换后——id 可省——daemon 生成） */
export interface ScheduleCreateParams {
  id?: string
  title: string
  instruction: string
  mode: string
  cycle: string
  day: number
  weekday: number
  timeSecs: number
  everySecs: number
  runAtSecs: number
  enabled?: boolean
}

/** 执行记录（runs 行 ↔ schedule.list_runs 回显） */
export interface ScheduleRun {
  id: number
  task_id: string
  triggered_at: number
  /** 'success'|'error'|'skipped'|'once_done' */
  status: string
  summary: string
  error: string
}

// MSG-3014 包131：只读文件内容预览（daemon file.preview——授权目录钉死／
// 服务端截断／原始字节零转码／二进制标记）
export interface PreviewReadParams {
  path: string
  /** 单次读取上限（服务端取 min 硬上限——缺省 256KiB） */
  max_bytes?: number
  /** 授权根解析用工作区（缺省走 daemon config） */
  workspace?: string
}

export interface PreviewReadResult {
  /** 原始字节（base64 承载——编码判定在前端） */
  bytes_b64: string
  /** 全件字节数（截断明示真值） */
  size: number
  /** 服务端已按 max_bytes 截断 */
  truncated: boolean
  /** 二进制判别标记（界面据以示「不可预览」） */
  binary: boolean
}
