import type { AttachmentItem } from './stores/files'

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  pinnedAt?: number
  projectId?: string
}

export type MessageKind = 'user' | 'assistant' | 'tool_call' | 'approval' | 'status'

export interface TraceItem {
  kind: 'tool.call' | 'tool.result' | 'reasoning'
  callId?: string
  toolName?: string
  argsPreview?: string
  success?: boolean
  preview?: string
  text?: string
  at: number
}

/** 批0 体验层：工具调用的人话字幕（小白也能看懂工具干了什么） */
export interface SubtitleItem {
  toolName: string
  text: string
  at: number
}

/** 批0 体验层：一次运行的成本账（来自 daemon done.usage） */
export interface UsageCost {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** 标准 v1.0 §A3：计费改读后端值（cost_usd）——前端自备单价表已删 */
  costUsd?: number
  /** 后端给出的每百万 token 单价（cost_per_mtok），展示口径同后端 */
  costPerMtok?: number
}

export interface MessageMeta {
  taskId?: string
  callId?: string
  toolName?: string
  argsPreview?: string
  success?: boolean
  requestId?: string
  action?: string
  risk?: string
  details?: string
  /** 标准 v1.0 §C B1：审批理由一句（人话·零术语）——卡头下第一行 */
  reason?: string
  /** 标准 v1.0 §C B5：全库挂起总数 ⇒「另有 N 张卡」角标 */
  pendingTotal?: number
  /** 标准 v1.0 §C B5：无会话来源（`__inbox__`）⇒ 落全局收件箱 */
  inbox?: boolean
  /** 最近一次所选档位（once／session／project／forever） */
  scope?: string
  /** 已申请放行（§B approval.escalate——升级≠免审） */
  escalated?: boolean
  /** 队列排队中（§A3 chat.send 回执 queued／position） */
  queued?: boolean
  queuePosition?: number
  /** 排队条目已取消 */
  queueCancelled?: boolean
  approved?: boolean
  /** MSG-3225 ②：按 daemon 权威挂起清单判定的**已终态**（未决超期／已被服务端销卡）
   *  ——与「用户拒绝」区分（不是 denied），只在服务端已无该 request 时置位 */
  expired?: boolean
  elapsedMs?: number
  status?: string
  statusKey?: string
  errorKey?: string
  streaming?: boolean
  /** 用户消息随消息携带的附件（图片缩略图 / 文件概要），随消息持久化到 DB */
  attachments?: AttachmentItem[]
}

export interface ChatMessage {
  id: string
  conversationId: string
  kind: MessageKind
  text: string
  createdAt: number
  meta?: MessageMeta
}

export interface RunState {
  taskId: string
  conversationId: string
  status: string
  startedAt: number
  finishedAt?: number
  elapsedMs?: number
  reasoning: string
  text: string
  trace: TraceItem[]
  /** 批0：工具调用人话字幕（按调用顺序） */
  subtitles?: SubtitleItem[]
  /** 批0：done 帧回填的真实 usage/成本 */
  usage?: UsageCost
}
