<script setup lang="ts">
// 审批卡（DESIGN.md §8 专件 ⇒《审批卡设计规格 v1.0》）：重心＝「动作摘要 ＋ 理由」；
// 拒绝＝中性描边（**不得用红**）；九态齐；`__inbox__` 标「来自后台任务」；窄屏换行；热区 ≥44×44。
// 契约面（《前端协作标准 v1.0》§A1／§B／§C）不动：requestId／scope／escalate／已决态。
// **令·补24 片 A/E**：高危卡不渲染档位区＋默认焦点＝拒绝＋Esc＝拒绝＋「同意」不得 accent 实心；
// 复用可见（免卡执行 M 次）＋可逆性三径徽章＋已执行动作撤销。判据一律在 utils/approvalCard.ts。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApprovalStore } from '../../../stores/approval'
import DiffView from './DiffView.vue'
import { humanizeArgs, normalizeRisk, toolLabel } from '../../../utils/approvalText'
import { approvalCardFace, reversibilityText } from '../../../utils/approvalCard'
import { parsePatch, type DiffLine } from '../../../utils/diff'
import type { ChatMessage } from '../../../models'
import type { ApprovalScope } from '../../../client/types'

const props = defineProps<{ message: ChatMessage }>()
const { t } = useI18n()
const approval = useApprovalStore()
const working = ref(false)
const showDiff = ref(false)
const escalated = ref(false)
/** 动作摘要展开（超长命令单行截断 → 展开） */
const expanded = ref(false)
/** error 态：提交失败人话（不销卡，可重试） */
const submitError = ref('')
const submittedScope = ref<ApprovalScope | null>(null)
/** 档位：默认「一次」（不建规则）——契约 §C B3 */
const scope = ref<ApprovalScope>('once')

// —— 档位（§C B8：取不到＝「档位未知」，禁伪装 medium）——
const riskLevel = computed(() => normalizeRisk(props.message.meta?.risk))
const RISK_KEY: Record<string, string> = { high: 'approval.highRisk', medium: 'approval.mediumRisk', low: 'approval.lowRisk' }
const riskText = computed(() => t(RISK_KEY[riskLevel.value] ?? 'approval.unknownRisk'))
const resolved = computed(() => props.message.meta?.approved !== undefined)
/** MSG-3225 ②：服务端权威清单判定为已终态（未决超期／已被销卡）——非「用户拒绝」 */
const expired = computed(() => props.message.meta?.expired === true)
const requestId = computed(() => props.message.meta?.requestId ?? '')
const toolName = computed(() => props.message.meta?.toolName)
const toolText = computed(() => toolLabel(toolName.value))
/** C 动作摘要：人话（禁裸 JSON）；缺字段＝显式空态文案（不留白） */
const summary = computed(() =>
  props.message.meta?.argsPreview
    ? humanizeArgs(toolName.value, props.message.meta.argsPreview)
    : t('approval.noSummary'),
)
/**
 * B 理由（主级 15px）——MSG-3231 ③（对卯 daemon 侧 MSG-3230 的 `reason` 字段）：
 * 有 `reason` ⇒ **原样显示**；缺 `reason` ⇒ **可读兜底**「需要你确认：<工具> 对 <摘要>」。
 * 旧口径「（未提供理由）」已废——对用户零信息，令明令该呈现必须消失。
 */
const reasonText = computed(
  () => props.message.meta?.reason?.trim() || t('approval.reasonFallback', { tool: toolText.value, summary: summary.value }),
)
/** 命令类走等宽块（DESIGN.md §3：等宽仅用于代码／命令／数据） */
const isCommand = computed(() =>
  ['shell_exec', 'run_command', 'exec'].includes(toolName.value ?? ''),
)
const canExpand = computed(() => isCommand.value || summary.value.length > 48)

/** 已决态后缀：· 本次／本会话／本项目／永久（规格 §三 success）；未知档位沿用原「永久」兜底 */
const SCOPE_KEY: Record<string, string> = { once: 'approval.scopeThisTime', session: 'approval.scopeSession', project: 'approval.scopeProject', forever: 'approval.scopeForever' }
const scopeSuffix = computed(() => {
  const used = (props.message.meta?.scope as ApprovalScope | undefined) ?? submittedScope.value
  return used ? ` · ${t(SCOPE_KEY[used] ?? 'approval.scopeForever')}` : ''
})

/** 九态（规格 §三）：default／hover／active／focus／disabled（CSS）＋ 下四态显式落 data-state */
const state = computed(() =>
  resolved.value ? 'success' : submitError.value ? 'error' : working.value ? 'loading' : 'default',
)

const SCOPE_LABEL_KEY: Record<ApprovalScope, string> = { once: 'approval.scopeOnce', session: 'approval.scopeSession', project: 'approval.scopeProject', forever: 'approval.scopeForever' }
const scopeOptions = computed<Array<{ value: ApprovalScope; label: string }>>(() =>
  (Object.keys(SCOPE_LABEL_KEY) as ApprovalScope[]).map((value) => ({ value, label: t(SCOPE_LABEL_KEY[value]) })),
)
const rememberHint = computed(() => (scope.value === 'once' ? t('approval.rememberNeedsScope') : t('approval.rememberHint')))

const args = computed<Record<string, unknown> | null>(() => {
  const preview = props.message.meta?.argsPreview
  if (!preview) return null
  try {
    const parsed: unknown = JSON.parse(preview)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch { return null }
})

const patchText = computed(() => (typeof args.value?.patch === 'string' ? args.value.patch : ''))
const patchLines = computed<DiffLine[]>(() => parsePatch(patchText.value))
const isPatch = computed(() => patchLines.value.length > 0)

async function decide(approved: boolean) {
  if (!requestId.value || working.value) return
  working.value = true
  submitError.value = ''
  // B3：档位随提交回填 scope——「一次」＝不建规则（store 侧省略入参）
  const result = await approval.respond(requestId.value, approved, scope.value)
  if (result.ok) submittedScope.value = scope.value
  // error 态：保留卡面可重试（fail-closed，不销卡）
  else submitError.value = result.error ?? t('errors.unknown')
  working.value = false
}

/** B4：被沙箱拒绝时的「申请放行」——升级≠免审（批准后仍走审批执行） */
async function requestEscalation() {
  if (!requestId.value || working.value || escalated.value) return
  working.value = true
  await approval.escalate(requestId.value)
  escalated.value = true
  working.value = false
}

/** **令·补24**：卡面判据（高危／复用可见／可逆性三径）——一律取自 utils/approvalCard.ts */
const face = computed(() => approvalCardFace(props.message.meta))
/** 可逆性标签文案（**组件面取词**）：`{paths}` 须真插值；**未接通 ⇒ 空串**（令·补25 §一：卡面不渲染徽章 ∧ 不得出现「可撤销」字样） */
const revText = computed(() => (face.value.revState === 'unwired' ? '' : reversibilityText(face.value.revPaths, t)))
/** 默认焦点＝「拒绝」（只在高危卡夺焦——先想清楚再点；常态卡不扰）＋ 撤销失败人话（禁假装成功） */
const denyRef = ref<HTMLButtonElement | null>(null)
const undoError = ref('')
onMounted(() => { if (face.value.highRisk && !resolved.value) denyRef.value?.focus() })
/** 复用面「撤销」：撤的是**那条免卡规则**（撤后同类操作重新弹卡）——复用既有 revokeRule */
function revokeReuse() { void approval.revokeRule(face.value.reuseRuleId) }
/** 已执行动作「撤销」：走后端回滚面（契约先行；daemon 未实装 ⇒ -32601 ⇒ 人话上屏，不假装成功） */
async function undoAction() {
  if (working.value) return
  const result = await approval.undoAction(requestId.value)
  undoError.value = result.ok ? '' : (result.error ?? t('errors.unknown'))
}
</script>

<template>
  <!-- success（已决）：✓/✗ 一行缩起，留在输出区可回看；**令·补24 P1-8** 可逆性徽章＋撤销入口就在本行 -->
  <div v-if="resolved" class="approval-card resolved" data-state="success">
    <span class="approval-check" :class="{ denied: !message.meta?.approved && !expired }">
      {{ expired ? '—' : message.meta?.approved ? '✓' : '✗' }}
    </span>
    <span class="approval-resolved-text">
      {{ expired ? t('approval.expired') : message.meta?.approved ? t('approval.approved') : t('approval.denied') }}{{ scopeSuffix }}
    </span>
    <span class="approval-resolved-tool">{{ toolText }}</span>
    <span v-if="face.revState !== 'unwired'" class="rev" :class="face.revTone" :data-reversibility="face.revTone === 'low' ? '1' : '0'">{{ revText }}</span>
    <!-- 撤销入口就在该条消息下方（**不藏设置页**）；借 `.approval-actions button` 既有样式与 ≥44 热区 -->
    <div v-if="face.canUndo" class="approval-actions">
      <button type="button" class="approval-undo" :data-undo-request-id="requestId" :disabled="working"
        :title="t('approval.undoHint')" @click="undoAction">
        {{ t('approval.revoke') }}
      </button>
    </div>
    <span v-if="undoError" class="approval-error" data-undo-error="1">{{ t('approval.undoFailed', { msg: undoError }) }}</span>
  </div>

  <div v-else class="approval-card" :data-state="state" @keydown.esc.prevent="decide(false)">
    <!-- A 头部：工具名（13px 次级）＋ 风险徽章（11px）＋ **令·补24 P1-8** 可逆性徽章 -->
    <div class="approval-head">
      <span class="approval-tool">{{ toolText }}</span>
      <span v-if="face.revState !== 'unwired'" class="rev" :class="face.revTone" :data-reversibility="face.revTone === 'low' ? '1' : '0'">{{ revText }}</span>
      <!-- MSG-3263 ④（P2-6）：档位取不到时**不再显「档位未知」**（对用户零信息，
          与 MSG-3231 理由位同源口径）——只在拿到真实档位时显徽章 -->
      <span v-if="riskLevel !== 'unknown'" class="risk" :class="riskLevel">{{ riskText }}</span>
    </div>

    <div class="approval-body">
      <!-- B 理由（主级 15px·卡头下第一行） -->
      <p class="approval-reason">{{ reasonText }}</p>

      <!-- C 动作摘要（最重）：人话；命令走等宽，单行截断 ＋「展开」 -->
      <div class="approval-action-block">
        <div
          class="approval-summary"
          :class="{ 'is-command': isCommand, clamped: isCommand && !expanded, expanded }"
        >
          {{ summary }}
        </div>
        <button
          v-if="canExpand"
          type="button"
          class="approval-expand"
          @click="expanded = !expanded"
        >
          {{ expanded ? t('approval.collapse') : t('approval.expand') }}
        </button>
      </div>

      <!-- D 改动预览（已有面·勿重做） -->
      <div v-if="isPatch" class="approval-patch">
        <button type="button" class="approval-diff-toggle" @click="showDiff = !showDiff">
          {{ showDiff ? t('approval.hideChanges') : t('approval.viewChanges') }}
        </button>
        <DiffView v-if="showDiff" :lines="patchLines" :collapse-threshold="60" />
      </div>

      <!-- 极端情况 3：无会话来源（__inbox__）标「来自后台任务」 -->
      <p v-if="message.meta?.inbox" class="approval-from-inbox">{{ t('approval.fromInbox') }}</p>

      <!-- E 档位（13px·行高 36·右对齐）；**令·补24 A-1**：高危卡整块不渲染（四档一律不出现） -->
      <div v-if="!face.highRisk" class="approval-scope">
        <span class="approval-scope-label">{{ t('approval.scopeLabel') }}</span>
        <div class="approval-scope-options">
          <button
            v-for="option in scopeOptions"
            :key="option.value"
            type="button"
            class="scope-option"
            :class="{ active: scope === option.value }"
            :disabled="working"
            @click="scope = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- **令·补24 P0-1 ④** 复用可见：daemon 下发「本动作已免卡执行 M 次」⇒ 显式写一行＋「撤销」（**禁静默**）；数值取不到 ⇒ 整块不渲染（禁伪造次数）；有次数无规则 id ⇒ 事实照说、不给假钮 -->
      <p v-if="face.reuseCount > 0" class="approval-reuse">
        {{ t('approval.reuseNotice', { n: face.reuseCount }) }}
        <button v-if="face.reuseRuleId" type="button" class="approval-reuse-undo" :title="t('approval.revokeHint')" @click="revokeReuse">
          {{ t('approval.revoke') }}
        </button>
      </p>
    </div>

    <!-- error 态：卡内一行「提交失败：<人话>」＋ 保留可重试（不销卡） -->
    <p v-if="submitError" class="approval-error">
      {{ t('approval.submitFailed', { msg: submitError }) }}——{{ t('approval.retryHint') }}
    </p>

    <!-- F 按钮区：同意（--accent 实心）／拒绝（中性描边·**非红**） -->
    <div class="approval-actions">
      <!-- MSG-3236 ①：稳定 id/name/data-*——UIA／自动化可直接定位「同意/拒绝」 -->
      <button
        type="button"
        :class="['approve', { plain: face.highRisk }]"
        :id="`approval-${requestId}-approve`"
        name="approval-approve"
        :data-approval-request-id="requestId"
        :data-uia="'approval-approve'"
        :disabled="working"
        @click="decide(true)"
      >
        <span v-if="working" class="approval-spinner" aria-hidden="true" />
        {{ working ? t('approval.submitting') : t('approval.approve') }}
      </button>
      <button
        ref="denyRef"
        type="button"
        :class="['deny', { strong: face.highRisk }]"
        :id="`approval-${requestId}-deny`"
        name="approval-deny"
        :data-approval-request-id="requestId"
        :data-uia="'approval-deny'"
        :disabled="working"
        @click="decide(false)"
      >
        {{ t('approval.deny') }}
      </button>
    </div>
    <!-- B4：两行按钮——记住这条（会话/项目/永久档）＋ 申请放行（被沙箱拒时）。
         **令·补24 A-1**：高危卡档位区已不渲染 ⇒ 档位恒为「一次」⇒ 本钮恒禁用——
         留个按不动的死钮是新问题，故与档位区**同闭**。 -->
    <div class="approval-actions approval-actions-secondary">
      <button
        v-if="!face.highRisk"
        type="button"
        class="remember"
        :disabled="working || scope === 'once'"
        :title="rememberHint"
        @click="decide(true)"
      >
        {{ t('approval.remember') }}
      </button>
      <button
        type="button"
        class="escalate"
        :disabled="working || escalated"
        :title="t('approval.escalateHint')"
        @click="requestEscalation"
      >
        {{ escalated ? t('approval.escalateSent') : t('approval.escalate') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 审批卡样式（《审批卡设计规格 v1.0》§二 具体数值）：全 token、零裸 hex；圆角 ⊆ {4,8,12,16,9999}；
   间距全 4 倍数；交互热区一律 ≥44×44（用 ::after 扩热区，不撑视觉高度）。 */
.approval-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  box-sizing: border-box;
}

/* —— success：已决一行 —— */
.approval-card.resolved {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
}

.approval-check {
  color: var(--success-text);
  font-weight: 600;
}

.approval-check.denied {
  color: var(--text-secondary);
}

.approval-resolved-text {
  color: var(--text-primary);
}

.approval-resolved-tool {
  margin-left: auto;
  color: var(--text-secondary);
}

/* —— A 头部 —— */
.approval-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.approval-tool {
  font-size: 13px;
  color: var(--text-secondary);
}

.risk, .rev {
  /* 规格 §二 写「徽章内边距 2×8」，但 §五#1 机判要求间距全 4 倍数——两处冲突取可机判项 ⇒ 4×8（差 2px；见 DESIGN.md 附一#8） */
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

/* **令·补24 P1-8** 可逆性徽章（与 risk 徽章同族 token：有据＝绿档／无据＝红档）；类名**不复用 `.risk`**——
   既有红证 `approval-card-design.test.ts` 以 `.risk` 存在性判「档位徽章是否渲染」，混用会让那条判据失真。 */
.approval-head .rev { margin-left: auto; }

.rev.high, .risk.high {
  background: var(--danger-soft);
  color: var(--risk-high-text);
}

.risk.medium {
  background: var(--warning-soft);
  color: var(--risk-medium-text);
}

.rev.low, .risk.low {
  background: var(--success-soft);
  color: var(--success-text);
}

.risk.unknown {
  background: var(--surface-2);
  color: var(--risk-unknown-text);
}

/* —— B 理由（主级） —— */
.approval-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.approval-reason {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.6;
}

/* —— C 动作摘要（最重） —— */
.approval-action-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.approval-summary {
  width: 100%;
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.approval-summary.is-command {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--code-bg);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
}

.approval-summary.is-command.clamped {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.approval-summary.is-command.expanded {
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
}

.approval-expand {
  position: relative;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.approval-expand::after {
  content: '';
  position: absolute;
  inset: -12px;
}

.approval-expand:hover {
  background: var(--hover);
  color: var(--text-primary);
}

/* —— D 改动预览 —— */
.approval-patch {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.approval-diff-toggle {
  position: relative;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.approval-diff-toggle::after {
  content: '';
  position: absolute;
  inset: -6px;
}

.approval-diff-toggle:hover {
  background: var(--hover);
  color: var(--text-primary);
}

/* —— 来自后台任务（__inbox__）／**令·补24 A-4** 复用可见（同属「卡内附注」一行式） —— */
.approval-from-inbox, .approval-reuse {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

/* 复用面「撤销」（撤那条免卡规则）：accent 文字描边钮；热区 ≥44（视觉高 25 ＋ 伪元素上下各扩 12） */
.approval-reuse-undo { position: relative; margin-left: 8px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--accent); font-size: 13px; }
.approval-reuse-undo::after { content: ''; position: absolute; inset: -12px; }

/* —— E 档位 —— */
.approval-scope {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-height: 36px;
}

.approval-scope-label {
  color: var(--text-secondary);
  font-size: 13px;
}

.approval-scope-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.scope-option {
  position: relative;
  /* 小号按钮取 8×12（DESIGN.md §4 原文「小号 6×12」与 §10#4 四倍数铁律冲突，取可机判项；附一#8） */
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* 热区 ≥44×44（视觉高 32，伪元素上下各扩 6） */
.scope-option::after {
  content: '';
  position: absolute;
  inset: -6px -4px;
}

.scope-option:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.scope-option.active {
  /* 选中＝accent 实心（软底 + accent 文字在暗色下仅 4.40:1，不达 ≥4.5；实心 + --accent-contrast 两模皆 ≥6.29:1） */
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

/* —— error 态 —— */
.approval-error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
  line-height: 1.5;
}

/* —— F 按钮区 —— */
.approval-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.approval-actions button {
  position: relative;
  min-height: 36px;
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* 热区 ≥44×44（视觉高 36，伪元素上下各扩 4） */
.approval-actions button::after {
  content: '';
  position: absolute;
  inset: -4px;
}

.approval-actions button:active:not(:disabled) {
  filter: brightness(0.95);
}

.approval-actions button:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.approval-actions button:disabled {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text-disabled);
  cursor: default;
}

/* 同意＝唯一强调色实心 */
.approval-actions .approve {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.approval-actions .approve:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.approval-actions .approve:disabled {
  background: var(--accent-soft);
  border-color: var(--accent-soft);
  color: var(--text-secondary);
}

/* **令·补24 A-3**：高危卡「同意」**不得为 accent 实心**（降为中性描边——同意/拒绝权重反转）；
   `:hover` 同写：否则既有 `.approve:hover` 的 accent-hover 会盖回强调色。 */
.approval-actions .approve.plain, .approval-actions .approve.plain:hover:not(:disabled) {
  background: transparent;
  border-color: var(--border-strong);
  color: var(--text-primary);
}

/* 拒绝＝中性描边（**不得用红**——红只留给 error/danger） */
.approval-actions .deny {
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

/* 权重反转的另一半：高危卡的**安全选项**（拒绝）夺回强调色实心——仍**不用红**（红只留给 error/danger）。 */
.approval-actions .deny.strong, .approval-actions .deny.strong:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.approval-actions .deny.strong:disabled { background: var(--surface-2); border-color: var(--border); color: var(--text-disabled); }

.approval-actions .deny:hover:not(:disabled) {
  background: var(--hover);
}

.approval-actions .remember:disabled {
  color: var(--text-disabled);
}

.approval-actions .remember:hover:not(:disabled) {
  background: var(--hover);
}

.approval-actions .escalate {
  color: var(--text-secondary);
}

.approval-actions .escalate:hover:not(:disabled) {
  color: var(--text-primary);
}

/* loading：按钮内转圈（规格 §三 loading —— 转圈为通知性动效，400ms 走 DESIGN.md §7 档） */
.approval-spinner {
  width: 12px;
  height: 12px;
  margin-right: 8px;
  border: 2px solid var(--accent-contrast);
  border-top-color: transparent;
  border-radius: 9999px;
  animation: approval-spin 400ms linear infinite;
}

@keyframes approval-spin {
  to {
    transform: rotate(360deg);
  }
}

/* —— 极端情况 5：窄屏（<640）按钮换行成上下两钮，各 100%、高 40 —— */
@media (max-width: 640px) {
  .approval-actions {
    flex-direction: column;
  }

  .approval-actions button {
    width: 100%;
    min-height: 40px;
  }

  .approval-scope {
    justify-content: flex-start;
  }
}
</style>
