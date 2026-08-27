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
}
