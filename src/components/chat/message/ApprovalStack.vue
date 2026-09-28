<script setup lang="ts">
// 未决审批卡容器（尾流径）：pendingApprovals 迁入 RunBlocks「执行命令/执行结果」
// 之间统一呈现——一个容器、每条待审批权限一张卡，卡内**编号选项列表直点决策**
//（1 允许 / 2 本次会话内始终允许 / 3 拒绝），替代旧九态卡的双排按钮面。
// 稳定 id/data-*（UIA／自动化契约）原样保留：
//   卡：id=approval-<requestId> / data-approval-request-id / data-uia="pending-approval"
//   行：id=approval-<requestId>-approve|-deny / data-uia="approval-approve|approval-deny"
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApprovalStore } from '../../../stores/approval'
import { humanizeArgs } from '../../../utils/approvalText'
import type { ChatMessage } from '../../../models'
import type { ApprovalScope } from '../../../client/types'

const props = defineProps<{ messages: ChatMessage[] }>()
const { t } = useI18n()
const approval = useApprovalStore()

const workingId = ref('')
const submitError = ref('')

/** 三行选项（截图稿口径）：允许（一次）/ 本会话始终允许 / 拒绝 */
const optionRows = computed<Array<{
  key: string
  label: string
  approved: boolean
  scope: ApprovalScope
  uia: string
  domId: string
}>>(() => [
  {
    key: 'approve-once',
    label: t('approval.approve'),
    approved: true,
    scope: 'once',
    uia: 'approval-approve',
    domId: 'approve',
  },
  {
    key: 'approve-session',
    label: t('approval.scopeSession'),
    approved: true,
    scope: 'session',
    uia: 'approval-approve',
    domId: 'approve-session',
  },
  {
    key: 'deny',
    label: t('approval.deny'),
    approved: false,
    scope: 'once',
    uia: 'approval-deny',
    domId: 'deny',
  },
])

/** 卡面数据：标题＝理由（缺省可读兜底），命令＝argsPreview 原文（等宽截断） */
const cards = computed(() =>
  props.messages.map((message) => {
    const requestId = message.meta?.requestId ?? ''
    const toolName = message.meta?.toolName
    const argsPreview = message.meta?.argsPreview ?? ''
    const summary = argsPreview ? humanizeArgs(toolName, argsPreview) : ''
    const title =
      message.meta?.reason?.trim() ||
      (summary
        ? t('approval.reasonFallback', { tool: toolLabel(toolName), summary })
        : t('approval.noSummary'))
    return { message, requestId, title, command: argsPreview, hasCommand: !!argsPreview }
  }),
)

async function decide(card: (typeof cards.value)[number], row: (typeof optionRows.value)[number]) {
  if (!card.requestId || workingId.value) return
  workingId.value = card.requestId
  submitError.value = ''
  // 档位随行回填：允许（一次）＝不建规则；会话行＝session 档
  const result = await approval.respond(card.requestId, row.approved, row.scope)
  if (!result.ok) submitError.value = result.error ?? t('errors.unknown')
  workingId.value = ''
}
</script>

<template>
  <div class="approval-stack" data-uia="pending-approvals">
    <div
      v-for="card in cards"
      :key="card.message.id"
      class="approval-stack-card"
      :id="`approval-${card.requestId}`"
      :data-approval-request-id="card.requestId"
      data-uia="pending-approval"
    >
      <!-- 标题：理由／动作主级 -->
      <p class="stack-title">{{ card.title }}</p>

      <!-- 命令预览：等宽、单行截断（title 全文悬停可见） -->
      <div v-if="card.hasCommand" class="stack-command" :title="card.command">
        {{ card.command }}
      </div>

      <!-- 编号选项列表：1 允许 / 2 本会话始终允许 / 3 拒绝 -->
      <div class="stack-options">
        <button
          v-for="(row, i) in optionRows"
          :key="row.key"
          type="button"
          class="stack-option"
          :class="{ deny: !row.approved }"
          :id="`approval-${card.requestId}-${row.domId}`"
          name="approval-approve"
          :data-approval-request-id="card.requestId"
          :data-uia="row.uia"
          :disabled="workingId === card.requestId"
          @click="decide(card, row)"
        >
          <span class="stack-option-no">{{ i + 1 }}</span>
          <span class="stack-option-label">{{ row.label }}</span>
          <span class="stack-option-arrow" aria-hidden="true">→</span>
        </button>
      </div>

      <!-- 提交失败：卡内一行人话，可重试（不销卡） -->
      <p v-if="submitError && workingId === card.requestId" class="stack-error">
        {{ t('approval.submitFailed', { msg: submitError }) }}——{{ t('approval.retryHint') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 审批卡容器：纵向卡片列表（间距 4 倍数） */
.approval-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.approval-stack-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  box-sizing: border-box;
}

/* 标题（理由）主级 */
.stack-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
}

/* 命令预览：等宽、灰、单行截断 */
.stack-command {
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--code-bg);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 编号选项列表：整行可点（热区 ≥44：行 min-height 44），行间细分隔 */
.stack-options {
  display: flex;
  flex-direction: column;
}

.stack-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.stack-option + .stack-option {
  margin-top: 2px;
}

.stack-option:hover:not(:disabled) {
  background: var(--hover);
}

.stack-option:disabled {
  color: var(--text-disabled);
  cursor: default;
}

/* 编号徽章：小方块灰底 */
.stack-option-no {
  flex: none;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text-secondary);
  font-size: 12px;
}

/* 右置箭头：允许行常显（主行动作），其余 hover 现形 */
.stack-option-arrow {
  margin-left: auto;
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.stack-option:first-child .stack-option-arrow,
.stack-option:hover .stack-option-arrow {
  opacity: 1;
}

/* 提交失败一行 */
.stack-error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
  line-height: 1.5;
}
</style>
