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
  costUsd: number
}

/** 批0 消息排队：会话内待执行 FIFO 条目（Codex 双输入模式——Tab 排队 / 运行中自动入队） */
export interface PendingQueueItem {
  taskId: string
  text: string
  position: number
  queuedAt: number
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
  approved?: boolean
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
