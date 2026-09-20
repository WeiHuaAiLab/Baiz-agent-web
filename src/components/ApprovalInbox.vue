<script setup lang="ts">
// 全局收件箱（前端协作标准 v1.0 §C B5／§B）：
// - 常驻入口的落点：`conversation_id === '__inbox__'`（无会话来源：RPC／CLI／
//   定时／探针触发）的审批卡在此**可见可点**——不丢、不埋（治 668/689）；
// - 会话内的卡一键跳回原会话（卡本身仍在消息流里）；
// - 角标「另有 N 张卡」＝ daemon 帧 `pending_total` 与本地可见数之差；
// - 「已记住的规则」区可撤销（`approval.revoke`）——撤销后必重弹。
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApprovalStore } from '../stores/approval'
import { useMessageStore } from '../stores/message'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import { INBOX_CONVERSATION_ID } from '../client/types'
import { normalizeRisk, toolLabel } from '../utils/approvalText'
import ApprovalCard from './chat/ApprovalCard.vue'
import Icon from './common/Icon.vue'
import type { PendingApprovalItem } from '../stores/approval'

const { t } = useI18n()
const approvals = useApprovalStore()
const messages = useMessageStore()
const session = useSessionStore()
const ui = useUiStore()

/** 收件箱内的卡（`__inbox__` 会话里未决的审批消息） */
const inboxCards = computed(() =>
  messages
    .list(INBOX_CONVERSATION_ID)
    .filter((item) => item.kind === 'approval' && item.meta?.approved === undefined),
)
const hiddenCount = computed(() => approvals.hiddenCount)
const sessionItems = computed(() => approvals.sessionItems)
const rules = computed(() => approvals.rules)
/** 面板表头计数：daemon 全库数与本机可见卡数取大（两处都不虚报） */
const visibleCount = computed(() =>
  Math.max(approvals.badgeCount, inboxCards.value.length + sessionItems.value.length),
)

function riskText(risk?: string): string {
  switch (normalizeRisk(risk)) {
    case 'high':
      return t('approval.highRisk')
    case 'medium':
      return t('approval.mediumRisk')
    case 'low':
      return t('approval.lowRisk')
    default:
      return t('approval.unknownRisk')
  }
}

function conversationTitle(item: PendingApprovalItem): string {
  const found = session.conversations.find((entry) => entry.id === item.conversationId)
  return found?.title ?? item.conversationId ?? ''
}

const SCOPE_KEYS: Record<string, string> = {
  once: 'approval.scopeOnce',
  session: 'approval.scopeSession',
  project: 'approval.scopeProject',
  forever: 'approval.scopeForever',
}

function scopeLabel(scope?: string): string {
  return scope ? t(SCOPE_KEYS[scope] ?? 'approval.scopeOnce') : ''
}

/** 会话内的卡：跳回原会话（卡在消息流里，就地审批） */
/**
 * MSG-3231 ③：理由行——有 `reason`（daemon MSG-3230）⇒ 原样显示；
 * 缺 ⇒ 可读兜底「需要你确认：<工具> 对 <摘要>」（「未提供理由」已废）。
 */
function reasonText(item: PendingApprovalItem): string {
  const reason = item.reason?.trim()
  if (reason) return reason
  return t('approval.reasonFallback', {
    tool: toolLabel(item.action),
    summary: item.details?.trim() || t('approval.noSummary'),
  })
}

function openConversation(item: PendingApprovalItem) {
  if (item.conversationId) session.select(item.conversationId)
  ui.closeInbox()
}

async function loadInbox() {
  await messages.load(INBOX_CONVERSATION_ID)
  await approvals.loadRules()
}

onMounted(() => {
  void loadInbox()
})

// 打开面板即补拉一次（收信不靠猜；断线期间的卡照到）
watch(
  () => ui.inboxOpen,
  (open) => {
    if (open) void approvals.syncPending()
  },
)
</script>

<template>
  <div v-if="ui.inboxOpen" class="inbox-mask" @click.self="ui.closeInbox()">
    <aside class="inbox-panel">
      <header class="inbox-head">
        <span class="inbox-title">
          <Icon name="inbox" :size="15" />
          {{ t('approval.inboxTitle') }}
        </span>
        <span class="inbox-count">{{ visibleCount }}</span>
        <button type="button" class="inbox-close" :title="t('common.close')" @click="ui.closeInbox()">
          <Icon name="x" :size="14" />
        </button>
      </header>

      <p v-if="hiddenCount > 0" class="inbox-more">
        {{ t('approval.inboxMore', { n: hiddenCount }) }}
      </p>

      <div class="inbox-body">
        <section class="inbox-section">
          <h4 class="inbox-section-title">{{ t('approval.inboxNoSource') }}</h4>
          <p v-if="inboxCards.length === 0" class="inbox-empty">{{ t('approval.inboxEmpty') }}</p>
          <div v-for="card in inboxCards" :key="card.id" class="inbox-card">
            <ApprovalCard :message="card" />
          </div>
        </section>

        <section class="inbox-section">
          <h4 class="inbox-section-title">{{ t('approval.inboxFromSessions') }}</h4>
          <p v-if="sessionItems.length === 0" class="inbox-empty">{{ t('approval.inboxEmpty') }}</p>
          <button
            v-for="item in sessionItems"
            :key="item.request_id"
            type="button"
            class="inbox-row"
            @click="openConversation(item)"
          >
            <span class="inbox-row-title">{{ conversationTitle(item) }}</span>
            <span class="inbox-row-action">{{ toolLabel(item.action) }}</span>
            <span class="inbox-row-reason">{{ reasonText(item) }}</span>
            <span class="risk small" :class="normalizeRisk(item.risk)">{{ riskText(item.risk) }}</span>
          </button>
        </section>

        <section v-if="rules.length > 0" class="inbox-section">
          <h4 class="inbox-section-title">{{ t('approval.rulesTitle') }}</h4>
          <div v-for="rule in rules" :key="rule.rule_id" class="inbox-rule">
            <span class="inbox-rule-text">{{ toolLabel(rule.rule_content) }}</span>
            <span v-if="rule.scope" class="inbox-rule-scope">{{ scopeLabel(rule.scope) }}</span>
            <button
              type="button"
              class="inbox-rule-revoke"
              :title="t('approval.revokeHint')"
              @click="approvals.revokeRule(rule.rule_id)"
            >
              {{ t('approval.revoke') }}
            </button>
          </div>
        </section>
      </div>
    </aside>
  </div>
</template>
