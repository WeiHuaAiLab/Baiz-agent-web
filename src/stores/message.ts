// 消息流 store：SSE 事件组装（token/工具/审批/完成）、run 轨迹、本地持久化。
import { defineStore } from 'pinia'
import { db } from '../db'
import { getClient } from '../client/singleton'
import type { AttachmentItem } from './files'
import { mapRpcError } from '../utils/errors'
import { useUiStore } from './ui'
import { useWorkingTreeStore } from './workingTree'
import type { ChatMessage, MessageMeta, RunState } from '../models'
import type {
  ApprovalRequiredData,
  DaemonNotifyData,
  DoneData,
  ErrorData,
  ReasoningData,
  TokenData,
  ToolCallData,
  ToolResultData,
} from '../client/types'

// 流式节流：首个 token 即时生效，后续 token 累积到 100ms 窗口统一刷新 UI。
const tokenBuffers = new Map<string, string>()
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>()
// 持久化节流：流式期间消息文本 500ms 防抖写库，done 时一次性写最终稿。
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
const RUNS_LIMIT = 50

let messageSeq = 0

function cloneForDb<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function parsePathFromArgs(argsPreview?: string): string {
  if (!argsPreview) return ''
  try {
    const parsed = JSON.parse(argsPreview) as { path?: string }
    return typeof parsed.path === 'string' ? parsed.path : ''
  } catch {
    return ''
  }
}

function makeMessage(
  conversationId: string,
  kind: ChatMessage['kind'],
  text: string,
  meta?: MessageMeta,
): ChatMessage {
  messageSeq += 1
  return {
    id: `${kind}-${Date.now().toString(36)}-${messageSeq}`,
    conversationId,
    kind,
    text,
    createdAt: Date.now(),
    ...(meta ? { meta } : {}),
  }
}

export type MessageStore = ReturnType<typeof useMessageStore>

export const useMessageStore = defineStore('message', {
  state: () => ({
    byConversation: {} as Record<string, ChatMessage[]>,
    runs: {} as Record<string, RunState>,
    callToMessage: {} as Record<string, string>,
    requestToMessage: {} as Record<string, string>,
  }),
  actions: {
    list(conversationId: string): ChatMessage[] {
      return this.byConversation[conversationId] ?? []
    },
    async load(conversationId: string) {
      if (this.byConversation[conversationId]) return
      const rows = await db.messages.where('conversationId').equals(conversationId).sortBy('createdAt')
      this.byConversation[conversationId] = rows
    },
    async push(conversationId: string, message: ChatMessage) {
      if (!this.byConversation[conversationId]) this.byConversation[conversationId] = []
      this.byConversation[conversationId].push(message)
      await db.messages.add(cloneForDb(message))
    },
    activeRuns(conversationId: string): RunState[] {
      return Object.values(this.runs).filter(
        (run) => run.conversationId === conversationId && run.status === 'running',
      )
    },
    async sendUserMessage(
      conversationId: string,
      text: string,
      workspace?: string,
      attachments?: AttachmentItem[],
    ) {
      let effective = text
      if (attachments && attachments.length > 0) {
        const blocks = attachments.map(
          (attachment) =>
            `\n\n\`\`\`\n[附件：${attachment.name}]\n${attachment.content.slice(0, 4000)}\n\`\`\``,
        )
        effective = `${text}${blocks.join('')}`
      }
      await this.push(conversationId, makeMessage(conversationId, 'user', text))
      const clientTaskId = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      this.ensureRun(clientTaskId, conversationId)
      try {
        const result = await getClient().chatSend({
          message: effective,
          conversation_id: conversationId,
          client_task_id: clientTaskId,
          ...(workspace ? { workspace } : {}),
        })
        if (result.task_id && result.task_id !== clientTaskId) {
          const run = this.runs[clientTaskId]
          if (run) {
            delete this.runs[clientTaskId]
            run.taskId = result.task_id
            this.runs[result.task_id] = run
          }
        }
      } catch (error) {
        const run = this.runs[clientTaskId]
        const mapped = mapRpcError(error)
        if (run) {
          run.status = 'failed'
          run.finishedAt = Date.now()
          run.elapsedMs = run.finishedAt - run.startedAt
        }
        await this.push(
          conversationId,
          makeMessage(conversationId, 'status', mapped.detail, {
            status: 'error',
            statusKey: 'sendFailed',
            errorKey: mapped.key,
          }),
        )
      }
    },
    async removeMessage(conversationId: string, messageId: string) {
      const list = this.byConversation[conversationId]
      if (!list) return
      this.byConversation[conversationId] = list.filter((item) => item.id !== messageId)
      await db.messages.delete(messageId)
    },
    async regenerate(conversationId: string, beforeMessageId?: string) {
      const list = this.list(conversationId)
      const index = beforeMessageId
        ? list.findIndex((item) => item.id === beforeMessageId)
        : list.length
      for (let i = index - 1; i >= 0; i -= 1) {
        if (list[i].kind === 'user') {
          await this.sendUserMessage(conversationId, list[i].text)
          return
        }
      }
    },
    async retryFrom(conversationId: string, fromMessageId: string) {
      const list = this.list(conversationId)
      const index = list.findIndex((item) => item.id === fromMessageId)
      for (let i = index - 1; i >= 0; i -= 1) {
        if (list[i].kind === 'user') {
          await this.sendUserMessage(conversationId, list[i].text)
          return
        }
      }
    },
    stopRun(taskId: string) {
      this.flushRun(taskId)
      const run = this.runs[taskId]
      if (!run || run.status !== 'running') return
      run.status = 'cancelled'
      run.finishedAt = Date.now()
      run.elapsedMs = run.finishedAt - run.startedAt
      if (!run.conversationId) return
      const msg = this.byConversation[run.conversationId]?.find(
        (item) => item.meta?.taskId === taskId && item.kind === 'assistant',
      )
      if (msg) {
        msg.text = `${run.text}\n\n（已停止）`
        msg.meta = { ...msg.meta, elapsedMs: run.elapsedMs, streaming: false, status: 'cancelled' }
        const timer = persistTimers.get(msg.id)
        if (timer) clearTimeout(timer)
        persistTimers.delete(msg.id)
        void db.messages.put(cloneForDb(msg))
      } else {
        const stopped = makeMessage(run.conversationId, 'assistant', `${run.text}\n\n（已停止）`, {
          taskId,
          elapsedMs: run.elapsedMs,
          streaming: false,
          status: 'cancelled',
        })
        void this.push(run.conversationId, stopped)
      }
      this.trimRuns()
    },
    flushRun(taskId: string) {
      const timer = flushTimers.get(taskId)
      if (timer) {
        clearTimeout(timer)
        flushTimers.delete(taskId)
      }
      const delta = tokenBuffers.get(taskId)
      tokenBuffers.delete(taskId)
      const run = this.runs[taskId]
      if (!run) return
      if (delta) run.text += delta
      if (!run.conversationId) return
      // 流式期间不创建持久化消息（由 streaming-tail 独占渲染），done/stop 才落地
      const existing = this.byConversation[run.conversationId]?.find(
        (item) => item.meta?.taskId === taskId && item.kind === 'assistant',
      )
      if (existing) {
        existing.text = run.text
        this.persistSoon(existing)
      }
    },
    persistSoon(message: ChatMessage) {
      const existing = persistTimers.get(message.id)
      if (existing) clearTimeout(existing)
      persistTimers.set(
        message.id,
        setTimeout(() => {
          persistTimers.delete(message.id)
          void db.messages.put(cloneForDb(message))
        }, 500),
      )
    },
    trimRuns() {
      const entries = Object.values(this.runs).sort((a, b) => b.startedAt - a.startedAt)
      if (entries.length <= RUNS_LIMIT) return
      for (const run of entries.slice(RUNS_LIMIT)) {
        if (run.status !== 'running') delete this.runs[run.taskId]
      }
    },
    ensureRun(taskId: string, conversationId: string): RunState {
      let run = this.runs[taskId]
      if (!run) {
        run = {
          taskId,
          conversationId,
          status: 'running',
          startedAt: Date.now(),
          reasoning: '',
          text: '',
          trace: [],
        }
        this.runs[taskId] = run
      }
      return run
    },
    conversationOf(taskId: string): string | null {
      return this.runs[taskId]?.conversationId ?? null
    },
    onTaskUpdated(data: { task_id: string; status: string; progress?: number }) {
      const run = this.ensureRun(data.task_id, this.conversationOf(data.task_id) ?? '')
      if (run.status === 'cancelled') return
      run.status = data.status
      if (['completed', 'failed', 'cancelled'].includes(data.status) && !run.finishedAt) {
        run.finishedAt = Date.now()
        run.elapsedMs = run.finishedAt - run.startedAt
      }
    },
    onToken(data: TokenData) {
      const run = this.ensureRun(data.task_id, this.conversationOf(data.task_id) ?? '')
      if (run.status === 'cancelled') return
      if (!run.conversationId) return
      const buffered = tokenBuffers.get(data.task_id)
      if (buffered === undefined) {
        // 首个 token 即时生效，保证首字立刻可见
        run.text += data.token
        tokenBuffers.set(data.task_id, '')
        flushTimers.set(
          data.task_id,
          setTimeout(() => this.flushRun(data.task_id), 100),
        )
      } else {
        tokenBuffers.set(data.task_id, buffered + data.token)
      }
    },
    onReasoning(data: ReasoningData) {
      const run = this.ensureRun(data.task_id, this.conversationOf(data.task_id) ?? '')
      if (run.status === 'cancelled') return
      run.reasoning += data.reasoning
      run.trace.push({ kind: 'reasoning', text: data.reasoning, at: Date.now() })
    },
    onToolCall(data: ToolCallData) {
      const run = this.ensureRun(data.task_id, this.conversationOf(data.task_id) ?? '')
      if (run.status === 'cancelled') return
      run.trace.push({
        kind: 'tool.call',
        callId: data.call_id,
        toolName: data.tool_name,
        argsPreview: data.args_preview,
        at: Date.now(),
      })
      if (!run.conversationId) return
      const msg = makeMessage(run.conversationId, 'tool_call', '', {
        taskId: data.task_id,
        callId: data.call_id,
        toolName: data.tool_name,
        argsPreview: data.args_preview,
      })
      this.callToMessage[`${data.task_id}:${data.call_id}`] = msg.id
      void this.push(run.conversationId, msg)
    },
    onToolResult(data: ToolResultData) {
      if (this.runs[data.task_id]?.status === 'cancelled') return
      const conversationId = this.conversationOf(data.task_id)
      const messageId = this.callToMessage[`${data.task_id}:${data.call_id}`]
      if (conversationId && messageId) {
        const msg = this.byConversation[conversationId]?.find((item) => item.id === messageId)
        if (msg) {
          msg.meta = { ...msg.meta, success: data.success, preview: data.preview }
          msg.text = data.preview
          void db.messages.put(cloneForDb(msg))
          const filePath = parsePathFromArgs(msg.meta?.argsPreview)
          if (filePath && /^(fs\.|code\.)/.test(msg.meta?.toolName ?? '')) {
            useWorkingTreeStore().noteChange(filePath)
          }
        }
        delete this.callToMessage[`${data.task_id}:${data.call_id}`]
      }
      const run = this.runs[data.task_id]
      if (run) {
        run.trace.push({
          kind: 'tool.result',
          callId: data.call_id,
          success: data.success,
          preview: data.preview,
          at: Date.now(),
        })
      }
    },
    onApprovalRequired(data: ApprovalRequiredData) {
      const run = this.ensureRun(data.task_id, this.conversationOf(data.task_id) ?? '')
      if (run.status === 'cancelled') return
      if (!run.conversationId) return
      const msg = makeMessage(run.conversationId, 'approval', '', {
        taskId: data.task_id,
        requestId: data.request_id,
        toolName: data.tool_name,
        argsPreview: data.args_preview,
        action: data.tool_name,
        risk: 'high',
        details: data.args_preview,
      })
      this.requestToMessage[data.request_id] = msg.id
      void this.push(run.conversationId, msg)
    },
    onApprovalResolved(data: { request_id: string; approved: boolean }) {
      const messageId = this.requestToMessage[data.request_id]
      if (messageId) {
        const list = Object.values(this.byConversation).find((items) =>
          items.some((item) => item.id === messageId),
        )
        const msg = list?.find((item) => item.id === messageId)
        if (msg) {
          msg.meta = { ...msg.meta, approved: data.approved }
          msg.text = data.approved ? '已批准' : '已拒绝'
          void db.messages.put(cloneForDb(msg))
        }
        delete this.requestToMessage[data.request_id]
      }
    },
    onDone(data: DoneData) {
      const run = this.runs[data.task_id]
      if (!run || run.status === 'cancelled') return
      this.flushRun(data.task_id)
      run.status = 'completed'
      run.finishedAt = Date.now()
      run.elapsedMs = run.finishedAt - run.startedAt
      if (!run.conversationId) return
      const msg = this.byConversation[run.conversationId]?.find(
        (item) => item.meta?.taskId === data.task_id && item.kind === 'assistant',
      )
      if (msg) {
        msg.text = run.text
        msg.meta = {
          ...msg.meta,
          elapsedMs: run.elapsedMs,
          streaming: false,
          status: 'completed',
        }
        const timer = persistTimers.get(msg.id)
        if (timer) clearTimeout(timer)
        persistTimers.delete(msg.id)
        void db.messages.put(cloneForDb(msg))
      } else {
        void this.push(
          run.conversationId,
          makeMessage(run.conversationId, 'assistant', run.text, {
            taskId: data.task_id,
            elapsedMs: run.elapsedMs,
          }),
        )
      }
      this.trimRuns()
    },
    onError(data: ErrorData) {
      this.flushRun(data.task_id)
      const run = this.runs[data.task_id]
      if (run) {
        run.status = 'failed'
        run.finishedAt = Date.now()
        run.elapsedMs = run.finishedAt - run.startedAt
      }
      const conversationId = this.conversationOf(data.task_id)
      if (conversationId) {
        void this.push(
          conversationId,
          makeMessage(conversationId, 'status', data.message, {
            status: 'error',
            statusKey: 'taskError',
            errorKey: 'unknown',
            taskId: data.task_id,
          }),
        )
      }
      this.trimRuns()
    },
    onNotify(data: DaemonNotifyData) {
      console.info('[baiz] daemon.notify', data.level, data.message)
      useUiStore().toast(data.message, data.level === 'error' ? 'error' : 'info')
    },
    onRawMessage(data: { kind: string; payload: unknown; timestamp: string }) {
      console.debug('[baiz] message event', data.kind, data.timestamp)
    },
  },
})
