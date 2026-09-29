<script setup lang="ts">
// 待审批消息栏：SSE 推 approval.required 帧时往当前会话的 messages 流里写入
// 一条 kind: 'approval' 消息；这里直接从消息流读取「已决策（approved / denied）
// 」之外的所有 approval 消息，把它们挂在 ChatInput 顶部展示。
//
// 与 ApprovalCard 的关系：
//   · ApprovalCard 是消息流里的"出卡点"——只在你正滚到那一行时能看到；
//   · 本组件是"全局待办"视图——在任意位置都能直接处理审批，不必先滚到那张卡。
//
// 「默认隐藏已审核」的语义：
//   · 数据源是当前会话的 approval 消息而非 approvals.pending——
//     pending 数组虽然也会在 respond 成功后清空，但那是副作用；消息层
//     meta.approved 是"已决策"的权威字段（approval.resolved 帧落定后
//     会回写），filter meta?.approved === undefined 是显式语义、与 ApprovalCard
//     判定 resolved 完全一致。一旦 daemon 推回执，行立即从本栏消失。
//   · 与 ApprovalCard 的 working/disabled 行为对齐：行内按钮点击后调用
//     approvals.respond（IPC），不再额外做乐观本地写回——保持单一数据源
//     原则，等 daemon 推 approval.resolved 时 meta.approved 落定、filter
//     自然把它摘掉（窗口通常 < 1s，与 ApprovalCard 一致）。
//
// 视觉规则：
//   · 默认折叠态单行 40px（与 chat-input 顶部 8px 节奏吻合）；
//   · 多条 pending 时纵向堆叠，max-height 封顶 160px 避免压扁输入框；
//   · 点击行（除按钮外）展开 details；点 Approve/Deny 直接调用
//     approvals.respond，与 ApprovalCard.decide 共用 IPC 路径。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApprovalStore } from '../../stores/approval'
import { useMessageStore, isRunTerminal } from '../../stores/message'
import { useSessionStore } from '../../stores/session'
import type { ChatMessage } from '../../models'

const { t } = useI18n()
const approvals = useApprovalStore()
const messages = useMessageStore()
const session = useSessionStore()

/** 幽灵数据判定：approval 消息在 DB 里有残留（meta.approved undefined），
 *  但其所属 run 已经收束 / 被 trimRuns 清掉——意味着该次会话已结束，
 *  approval.resolved 永远不会再来了，这条审批是历史残留。
 *
 * 过滤策略：
 *   · run 在内存里 + status 是 running/queued → 活 run，显示
 *   · run 在内存里 + status 已收束（completed/cancelled/failed）→ 幽灵，隐藏
 *     （正常 daemon 推 done / error 后 run.status 会落定；如果 meta.approved
 *     仍是 undefined，说明 daemon 在推完 run 终态前/中挂掉了）
 *   · run 不在内存里（trimRuns 清掉 / 重启后历史会话）→ 幽灵，隐藏
 *   · 没 taskId（手工 / 测试数据）→ 保守按"不追踪得到"处理：隐藏
 *
 * 与 ApprovalCard 的关系：ApprovalCard 不做这层过滤——它只判定
 * meta.approved undefined（即"理论上还在审批"）；幽灵在消息流里仍会
 * 渲染为可点按钮但点了也无效。本组件作为"真正的活待办"，过滤掉这些死链
 * 让 list 永远反映"现在能批的"，不显示假按钮。 */
/** run 终态判定复用 store 导出的 isRunTerminal（黑名单：completed / failed
 *  / cancelled 才算收束；waiting_approval 等中间态都算活）。曾因白名单只认
 *  running/queued 把 waiting_approval 误判成幽灵，导致本栏不显示——与
 *  activeRuns / stopRun / isRunSettled 同源修复，统一走这一份定义。 */
function isLiveApproval(item: ChatMessage): boolean {
  const taskId = item.meta?.taskId
  if (!taskId) return false
  const run = messages.runs[taskId]
  if (!run) return false
  return !isRunTerminal(run.status)
}

/** 当前会话内未决策且 run 仍活跃的 approval 消息——这是 list 的唯一数据源。
 *  meta.approved === undefined 表示"还没决策"（包含：刚推送、IPC 已发送
 *  但 daemon 回执未到）；只要 daemon 推回 approval.resolved 帧，
 *  meta.approved 落定 → 该行从此计算结果里消失。 */
const pendingApprovals = computed<ChatMessage[]>(() =>
  messages.list(session.activeId).filter((item) => {
    if (item.kind !== 'approval') return false
    if (item.meta?.approved !== undefined) return false
    return isLiveApproval(item)
  }),
)

/** 行内展开态：一次只看一条详情——多 pending 时只展开当前点的那条，
 * 展开其他条会收起上一条，避免 details 反复跳变让列表"呼吸"。 */
const expandedId = ref<string | null>(null)

/** 行内 working 态：以消息 id 为键（不是 request_id）——行一旦从消息流消失，
 * 该 working 项就成了死键；finally 块兜底清理，无需多管。 */
const working = ref<Record<string, boolean>>({})

const visible = computed(() => pendingApprovals.value.length > 0)

function riskClass(risk: string | undefined): 'high' | 'medium' | 'low' {
  if (risk === 'high' || risk === 'low') return risk
  return 'medium'
}

async function decide(item: ChatMessage, approved: boolean) {
  const requestId = item.meta?.requestId
  if (!requestId || working.value[item.id]) return
  working.value = { ...working.value, [item.id]: true }
  try {
    await approvals.respond(requestId, approved)
  } finally {
    // approvals.respond 成功后会从 approvals.pending 摘除该 item，
    // 但本组件的数据源是 messages 流——approve.respond 完成后本行的生命周期
    // 仍由 meta.approved 决定（daemon 推 approval.resolved 后才真正消失）。
    // 这里的清理是 fail-closed 路径的兜底（IPC 失败时 pending 仍在，
    // 但 working 仍需复位，否则按钮永久禁用）。
    const next = { ...working.value }
    delete next[item.id]
    working.value = next
  }
}

function toggle(item: ChatMessage) {
  expandedId.value = expandedId.value === item.id ? null : item.id
}

/** details 形参是 args_preview 的原文（daemon 原样推），优先按 JSON 漂亮化；
 *   非 JSON（如 diff patch 文本）按 pre-wrap 原文展示，与 ApprovalCard 同源。 */
function prettyDetails(details?: string): string {
  if (!details) return ''
  try {
    const parsed = JSON.parse(details)
    if (parsed && typeof parsed === 'object') return JSON.stringify(parsed, null, 2)
  } catch {
    /* fallthrough */
  }
  return details
}
</script>

<template>
  <div v-if="visible" class="approval-confirm">
    <div class="approval-confirm-head">
      <span class="approval-confirm-title">{{ t('approval.pendingTitle') }}</span>
      <span class="approval-confirm-count" aria-label="pending count">
        {{ pendingApprovals.length }}
      </span>
    </div>
    <ul class="approval-confirm-list">
      <li
        v-for="item in pendingApprovals"
        :key="item.id"
        class="needApprovalListItem"
        :data-expanded="expandedId === item.id ? '1' : undefined"
      >
        <div class="approval-confirm-row" @click="toggle(item)">
          <span class="approval-confirm-tool" :title="item.meta?.toolName">{{
            item.meta?.toolName
          }}</span>
          <span class="risk" :class="riskClass(item.meta?.risk)">
            {{
              riskClass(item.meta?.risk) === 'high'
                ? t('approval.highRisk')
                : riskClass(item.meta?.risk) === 'low'
                  ? t('approval.lowRisk')
                  : t('approval.mediumRisk')
            }}
          </span>
          <span class="approval-confirm-toggle" aria-hidden="true">
            {{ expandedId === item.id ? '▾' : '▸' }}
          </span>
          <!-- @click.stop 让按钮不被外层 row 的 toggle 吞掉——否则点 Approve
   会在审批的同时展开/收起 details，造成视觉跳变。 -->
          <div class="approval-confirm-actions" @click.stop>
            <button
              type="button"
              class="deny"
              :disabled="!!working[item.id]"
              @click="decide(item, false)"
            >
              {{ t('approval.deny') }}
            </button>
            <button
              type="button"
              class="approve"
              :disabled="!!working[item.id]"
              @click="decide(item, true)"
            >
              {{ t('approval.approve') }}
            </button>
          </div>
        </div>
        <pre
          v-if="expandedId === item.id"
          class="approval-confirm-details"
        >{{ prettyDetails(item.meta?.argsPreview) }}</pre>
      </li>
    </ul>
  </div>
</template>