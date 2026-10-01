export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_approval'

// —— 前端协作标准 v1.0（审批／队列／状态对接规范）字段与枚举 ——

/**
 * 无会话来源（RPC／CLI／定时／探针触发）的审批卡，daemon 以本常量作
 * `conversation_id`（标准 §A1）——前端必须落到「全局收件箱」，不得丢弃。
 */
export const INBOX_CONVERSATION_ID = '__inbox__'

/** 审批档位（标准 §B `permission.respond.scope`）：缺省 `once` ⇒ 不建规则 */
export type ApprovalScope = 'once' | 'session' | 'project' | 'forever'

export function isInboxConversation(conversationId?: string | null): boolean {
  return !conversationId || conversationId === INBOX_CONVERSATION_ID
}

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
  /**
   * MSG-3270 P0：**结构化附件**（正本 §1.3.1）——name/kind/mimeType/size/sha256；
   * 文本带 `content`、图片带 `dataUrl`。daemon 侧落地前为未知字段（默认忽略）。
   */
  attachments?: Array<{
    name: string
    kind: 'image' | 'file'
    mimeType: string
    size: number
    sha256: string
    content?: string
    dataUrl?: string
  }>
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
  /** 标准 §A3：入队回执——`queued:true` ＋ `position` ⇒ 队列条「排队中·第 N 位」 */
  queued?: boolean
  position?: number
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
  reason?: string
  conversation_id?: string
  status?: string
  created_at?: string
}

export interface PermissionRespondParams {
  request_id: string
  approved: boolean
  /** 标准 §B：缺省＝once（不建规则）；session／project／forever 才落规则 */
  scope?: ApprovalScope
}

/** 标准 §B `approval.rules`：规则对象数组 */
export interface ApprovalRule {
  rule_id: string
  rule_content: string
  authorized_root?: string
  scope?: ApprovalScope
  revision?: number
  created?: string
}

/** 标准 §B `approval.policy`：可机判优先级表 deny(1) > mode_baseline(2) > auto(3) > ask(4) */
export interface ApprovalPolicyLevel {
  name: string
  priority: number
}

export interface ApprovalPolicyResult {
  levels?: ApprovalPolicyLevel[]
  [key: string]: unknown
}

export interface ApprovalRevokeParams {
  rule_id: string
}

/**
 * **令·补24 P1-8**：撤销**已执行**的动作（与「撤销规则」是两件事——`approval.revoke` 撤规则，
 * 本件撤动作）。**契约先行**：daemon 回滚面属另片，未实装 ⇒ 回 `-32601` ⇒ 调用方人话降级
 * （照 `schedule.run_detail`／`audit.execModeChanged` 同法，**禁假装成功**）。
 */
export interface ApprovalUndoParams {
  request_id: string
}

export interface ApprovalEscalateParams {
  request_id: string
  [key: string]: unknown
}

export interface A2aStatusResult {
  enabled: boolean
  bind_address?: string
  tasks: number
}

// —— DEBT-743（MSG-3168）：WeKnora（知识库）连接配置 ——
// 契约预填源＝MSG-3165 §三（daemon 侧 `weknora.get_config`／`set_config`）。
// 钉：**API key 永不回显**（读接口至多给 `key_set`／`key_fp`）。

export type WeknoraConfigSource = 'env' | 'file' | 'none'

export interface WeknoraConfigResult {
  base_url: string
  configured: boolean
  /** 来源：env（既有部署）／file（DPAPI 加密件）／none */
  source?: WeknoraConfigSource
  /** 至多"是否已设"＋指纹——**零明文** */
  key_set?: boolean
  key_fp?: string
}

export interface WeknoraSetConfigParams {
  base_url: string
  api_key: string
  /** 会话令牌（与 chat.send 的 session_token 同法；无则不键） */
  token?: string
}

export interface WeknoraSetConfigResult {
  ok: boolean
  /** 服务端 `normalize_base_url` 归一后回填（去尾斜杠／剥尾段 /api/v1） */
  normalized_base_url?: string
}

// —— MSG-3189 `E2②`：切档审计（**契约先行**·daemon 面待落地）——
// 口径建议：`audit.execModeChanged`；字段 mode／previous／at／account（见讫报字段表）。

export type ExecModeWire = 'plan' | 'confirm' | 'auto'

export interface AuditExecModeChangedParams {
  /** 调**到**哪一档 */
  mode: ExecModeWire
  /** 调**自**哪一档 */
  previous: ExecModeWire
  /** 切档时刻（ISO-8601·前端时钟） */
  at: string
  /** 账号（daemon user_id；未登录＝'local'） */
  account: string
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
  /** 参数预览 ≤200 字（卡面走人话渲染，禁裸 JSON——标准 §A1/§C B2） */
  args_preview: string
  /** 有会话归属＝会话 id；无来源＝`__inbox__`（标准 §A1） */
  conversation_id?: string
  /** 全库挂起总数（含积压）⇒ 角标「另有 N 张卡」 */
  pending_total?: number
  /** 理由一句（人话·零术语）——卡上必须显示（§C B1） */
  reason?: string
  /** `high`／`medium`（`safe` 不弹卡故不上帧）——直接采信，禁默认 medium */
  risk?: string
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
    /** 标准 §A3：计费改读后端值（前端自备单价表已删） */
    cost_usd?: number
    cost_per_mtok?: number
  }
  /**
   * **REQ-1045-37 刀②**：终帧**协议泄漏事实**（合同：`{stripped_bytes,salvaged,executed}`）。
   * 前端据此定两态文案（不再自数自报）；**字段缺失（旧 daemon）⇒ 回落前端自数**（前向兼容）。
   * `salvaged`＝是否解析成真调用；`executed`＝是否真跑。
   */
  protocol_leak?: {
    stripped_bytes?: number
    salvaged?: boolean
    executed?: boolean
  }
}

export interface ErrorData {
  task_id: string
  message: string
  /**
   * **令·补24 P0-5**（`-32002` 带回登录出口）：daemon 明示「这条错＝身份/会话面，去登录」。
   * 前端**只当存在性判据**用（非空串／true ⇒ 置位），**不把原文上屏**——上屏文案一律走
   * 既有 `identity.notEstablished`／`identity.goLogin`（禁内部号与 daemon 原文糊到用户脸上）。
   * 字段缺失（旧 daemon）⇒ 前端零行为变化，走既有文案。
   */
  login_hint?: string
}

export interface DaemonNotifyData {
  level: string
  message: string
  /**
   * **1.0.42 补刀A-web**：**归属会话 id**（daemon 侧可选下发）。
   *
   * 口径：**有该字段且 ≠ 当前会话** ⇒ 前端**不弹**（按归属过滤）；
   * **字段缺失**（旧 daemon）⇒ **照旧弹**（**向后兼容·不得因缺字段丢通知**）。
   * 判据单源＝`session.activeId`（与 `src/client/eventRouter.ts` 同源）。
   */
  conversation_id?: string
}

export interface BriefReadyData {
  brief_id: string
}

export interface MessageEventData {
  kind: string
  payload: unknown
  timestamp: string
}

/** 调度任务（daemon `scheduled_store::TaskSpec` 行 ↔ `schedule.list` 回显）。
 * ⚠ **MSG-3511 勘误**：本两型旧注释自称"daemon 全字段形"，字段却写成 camelCase
 * （`timeSecs`…）——daemon 侧 `TaskSpec` 是 `#[derive(serde::Serialize,
 * Deserialize)]` 且**无 rename**，线上键只能是 **snake_case**（`time_secs`…）；
 * 照旧声明发包会被 `#[serde(default)]` **静默置零**（09:00 变 00:00）。故于接线刀纠回。 */
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
  time_secs: number
  every_secs: number
  run_at_secs: number
  enabled: boolean
  created_at: number
  updated_at: number
  /** MSG-3142：账号归属（服务端覆写；空串＝未登录面·对任何账号零可见） */
  user_id?: string
}

/** schedule.create 入参（前端 draft 转换后——id 可省——daemon 生成；键名同 daemon） */
export interface ScheduleCreateParams {
  id?: string
  title: string
  instruction: string
  mode: string
  cycle: string
  day: number
  weekday: number
  time_secs: number
  every_secs: number
  run_at_secs: number
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
  /** **MSG-3561 C3**：结果面**全文**（daemon 结果表落地后回填；缺省＝只有 `summary` 截断面） */
  full_text?: string
}

/** **MSG-3561 C3**：单次执行的结果面（懒加载·契约先行——daemon 未实装时回 -32601） */
export interface ScheduleRunDetailParams {
  task_id: string
  run_id: number
}
export interface ScheduleRunDetailResult {
  run_id: number
  task_id: string
  /** 与模型输出**逐字一致**的全文（不截断） */
  full_text?: string
  created_at?: number
}

// MSG-3014 包131：只读文件内容预览（daemon file.preview——授权目录钉死／
// 服务端截断／原始字节零转码／二进制标记）
export interface PreviewReadParams {
  path: string
  /** 单次读取上限（服务端取 min 硬上限——缺省 256KiB） */
  max_bytes?: number
  /** 授权根解析用工作区（缺省走 daemon config） */
  workspace?: string
  /**
   * MSG-3231 ①：**面板已授权目录**（绝对路径数组）。
   * daemon `file.preview` 侧（MSG-3228）与配置面**取并集**后逐项 canonicalize——
   * 即"面板里已授权"的目录对 daemon 也可见；**安全未放宽**（仍逐项校验）。
   * 缺省 ⇒ 不传该字段（旧行为零变）；**不得**塞入未经用户授权的前缀。
   */
  authorized_roots?: string[]
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

// MSG-3503 A9（DEBT-876／测试员 T8）：**记忆只读面**（daemon `memory.list`）。
// 口径＝**只回本人**（归属由 daemon 侧以会话令牌经 `SessionStore::verified_uid`
// 查证，勿信前端自报）；零令牌 ⇒ `items` 空 ＋ `note` 人话（界面据此渲染空态，
// **不得**假装有数据）。
export interface MemoryListParams {
  /** 会话令牌（随行——daemon 以它查证归属；缺 ⇒ 未登录面空表） */
  token?: string
}

export interface MemoryListItem {
  id: string
  text: string
  /** 来源显示串（daemon 侧按 source_sessions 合成；缺 ⇒「（未标注来源）」） */
  source: string
  /** RFC3339 时间串 */
  created_at: string
  owner: string
}

export interface MemoryListResult {
  owner: string
  count: number
  items: MemoryListItem[]
  /** 零令牌面的人话说明（未登录 ⇒ 记忆不可见） */
  note?: string
}

// 刀 D2（2026-09-29）：**技能面接线**（daemon `skills.list`——磁盘真技能目录）。
// 契约（D1 题包同字）：出参**裸数组** `[{ name, description, path, source }]`；
// `description` 可空（界面显「（无描述）」，勿以 labelKey 假造）；
// `source` ∈ account／global／workspace（来源层级，仅作展示标签）。
// 取数失败由调用方（`stores/tools.ts`）显式降级——**不得回落写死假清单**。
export interface SkillEntry {
  /** 技能目录名（即磁盘上的技能 id，如 `ui-designer`） */
  name: string
  /** 技能描述（可空——空 ⇒ 界面显「（无描述）」） */
  description?: string | null
  /** 技能目录路径（展示用；可空） */
  path?: string | null
  /** 来源层级：account／global／workspace（可空——未知源照原文展示） */
  source?: string | null
}
