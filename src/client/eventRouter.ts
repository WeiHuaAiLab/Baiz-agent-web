// 事件路由：SSE 帧 → 消息/审批 store 的动作分发，未知事件仅 debug 日志。
import type { SseFrame } from './sse'
import type { useApprovalStore } from '../stores/approval'
import type { useMessageStore } from '../stores/message'

type MessageStore = ReturnType<typeof useMessageStore>
type ApprovalStore = ReturnType<typeof useApprovalStore>

export function routeFrame(frame: SseFrame, messages: MessageStore, approvals: ApprovalStore): void {
  const data = frame.data as Record<string, unknown> | undefined
  if (data === undefined || data === null) return
  switch (frame.event) {
    case 'task.updated':
      messages.onTaskUpdated(data as never)
      break
    case 'token':
      messages.onToken(data as never)
      break
    case 'reasoning':
      messages.onReasoning(data as never)
      break
    case 'tool.call':
      messages.onToolCall(data as never)
      break
    case 'tool.result':
      messages.onToolResult(data as never)
      break
    case 'approval.required': {
      messages.onApprovalRequired(data as never)
      const approval = data as { request_id: string; tool_name: string; args_preview: string }
      approvals.upsert({
        request_id: approval.request_id,
        action: approval.tool_name,
        risk: 'high',
        details: approval.args_preview,
      })
      break
    }
    case 'approval.resolved':
      messages.onApprovalResolved(data as never)
      approvals.resolve((data as { request_id: string }).request_id)
      break
    case 'permission.request':
      approvals.upsert(data as never)
      break
    case 'done':
      messages.onDone(data as never)
      break
    case 'error':
      messages.onError(data as never)
      break
    case 'daemon.notify':
      messages.onNotify(data as never)
      break
    case 'message':
      messages.onRawMessage(data as never)
      break
    default:
      console.debug('[baiz] unhandled event', frame.event)
  }
}
