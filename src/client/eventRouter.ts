// 事件路由：SSE 帧 → 消息/审批 store 的动作分发，未知事件仅 debug 日志。
import type { SseFrame } from './sse'
import type { ApprovalRequiredData } from './types'
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
      // 标准 v1.0 §A1：帧字段收全——`risk` 直接采信（旧「默认 medium 占位
      // ＋ 无条件 refreshRisk」已删，回退径永不触发）；`conversation_id`
      // 无来源＝`__inbox__`（落全局收件箱，不丢）；`reason`／`pending_total`
      // 一并入列（§C B1／B5）。
      const approval = data as unknown as ApprovalRequiredData
      messages.onApprovalRequired(approval)
      // 会话归属回退：帧缺 `conversation_id` 时用 run 已知会话兜底；
      // 两者皆无 ⇒ `__inbox__`（无会话来源的卡不得丢弃）
      const fallbackConversation = messages.conversationOf(approval.task_id) || undefined
      approvals.upsert({
        request_id: approval.request_id,
        action: approval.tool_name,
        risk: approval.risk,
        details: approval.args_preview,
        reason: approval.reason,
        conversationId: approval.conversation_id ?? fallbackConversation,
      })
      approvals.notePendingTotal(approval.pending_total)
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
    // MSG-2318 A-1：brief.ready 补 case（daemon 13 变体之缺路由——
    // 载荷 brief_id；store 读面无专 handler 且 on* 族零动，落留痕径
    // 零丢帧，语义消费候二期）
    case 'brief.ready':
      console.debug('[baiz] brief.ready', data)
      break
    default:
      console.debug('[baiz] unhandled event', frame.event)
  }
}
