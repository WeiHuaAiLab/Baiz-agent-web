<script setup lang="ts">
// 审批卡（DESIGN.md §8 专件 ⇒《审批卡设计规格 v1.0》）：
// 重心＝「动作摘要 ＋ 理由」；头部工具名降 13px 次级；同意＝--accent 实心、
// 拒绝＝中性描边（**不得用红**）；九态齐（重点 loading／error）；档位未知不伪装；
// `__inbox__` 标「来自后台任务」；窄屏按钮换行；交互热区 ≥44×44（伪元素扩，不撑视觉高）。
// 契约面（《前端协作标准 v1.0》§A1／§B／§C）不动：requestId／scope／escalate／已决态。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApprovalStore } from '../../stores/approval'
import DiffView from './DiffView.vue'
import { humanizeArgs, normalizeRisk, toolLabel } from '../../utils/approvalText'
import type { ChatMessage } from '../../models'
import type { DiffLine } from '../../utils/diff'
import type { ApprovalScope } from '../../client/types'

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
const riskText = computed(() => {
  switch (riskLevel.value) {
    case 'high':
      return t('approval.highRisk')
    case 'medium':
      return t('approval.mediumRisk')
    case 'low':
      return t('approval.lowRisk')
    default:
      return t('approval.unknownRisk')
  }
})
const resolved = computed(() => props.message.meta?.approved !== undefined)
const requestId = computed(() => props.message.meta?.requestId ?? '')
const toolName = computed(() => props.message.meta?.toolName)
const toolText = computed(() => toolLabel(toolName.value))
/** B 理由：主级 15px；缺字段＝显式空态文案（不留白） */
const reasonText = computed(() => props.message.meta?.reason?.trim() || t('approval.noReason'))
/** C 动作摘要：人话（禁裸 JSON）；缺字段＝显式空态文案 */
const summary = computed(() =>
  props.message.meta?.argsPreview
    ? humanizeArgs(toolName.value, props.message.meta.argsPreview)
    : t('approval.noSummary'),
)
/** 命令类走等宽块（DESIGN.md §3：等宽仅用于代码／命令／数据） */
const isCommand = computed(() =>
  ['shell_exec', 'run_command', 'exec'].includes(toolName.value ?? ''),
)
const canExpand = computed(() => isCommand.value || summary.value.length > 48)

/** 已决态后缀：· 本次／本会话／本项目／永久（规格 §三 success） */
const scopeSuffix = computed(() => {
  const used = (props.message.meta?.scope as ApprovalScope | undefined) ?? submittedScope.value
  if (!used) return ''
  const key =
    used === 'once'
      ? 'approval.scopeThisTime'
      : used === 'session'
        ? 'approval.scopeSession'
        : used === 'project'
          ? 'approval.scopeProject'
          : 'approval.scopeForever'
  return ` · ${t(key)}`
})

/** 九态（规格 §三）：default／hover／active／focus／disabled（CSS）＋ 下四态显式落 data-state */
const state = computed(() =>
  resolved.value
    ? 'success'
    : submitError.value
      ? 'error'
      : working.value
        ? 'loading'
        : 'default',
)

const scopeOptions = computed<Array<{ value: ApprovalScope; label: string }>>(() => [
  { value: 'once', label: t('approval.scopeOnce') },
  { value: 'session', label: t('approval.scopeSession') },
  { value: 'project', label: t('approval.scopeProject') },
  { value: 'forever', label: t('approval.scopeForever') },
])
const rememberHint = computed(() =>
  scope.value === 'once' ? t('approval.rememberNeedsScope') : t('approval.rememberHint'),
)

const args = computed<Record<string, unknown> | null>(() => {
  const preview = props.message.meta?.argsPreview
  if (!preview) return null
  try {
    const parsed = JSON.parse(preview)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
})

const patchText = computed(() => {
  const raw = args.value?.patch
  return typeof raw === 'string' ? raw : ''
})

const patchLines = computed<DiffLine[]>(() => parsePatch(patchText.value))
const isPatch = computed(() => patchLines.value.length > 0)

/** 解析 apply_patch 统一补丁文本 → DiffLine 数组（零后端改动） */
function parsePatch(patch: string): DiffLine[] {
  if (!patch.trim()) return []
  const lines: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      newNo += 1
      lines.push({ type: 'added', text: raw.slice(1), newNo })
    } else if (raw.startsWith('-') && !raw.startsWith('---')) {
      oldNo += 1
      lines.push({ type: 'removed', text: raw.slice(1), oldNo })
    } else {
      oldNo += 1
      newNo += 1
      lines.push({ type: 'unchanged', text: raw, oldNo, newNo })
    }
  }
  return lines
}

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
</script>

<template>
  <!-- success（已决）：✓/✗ 一行缩起，留在输出区可回看 -->
  <div v-if="resolved" class="approval-card resolved" data-state="success">
    <span class="approval-check" :class="{ denied: !message.meta?.approved }">
      {{ message.meta?.approved ? '✓' : '✗' }}
    </span>
    <span class="approval-resolved-text">
      {{ message.meta?.approved ? t('approval.approved') : t('approval.denied') }}{{ scopeSuffix }}
    </span>
    <span class="approval-resolved-tool">{{ toolText }}</span>
  </div>

  <div v-else class="approval-card" :data-state="state">
    <!-- A 头部：工具名（13px 次级）＋ 风险徽章（11px） -->
    <div class="approval-head">
      <span class="approval-tool">{{ toolText }}</span>
      <span class="risk" :class="riskLevel">{{ riskText }}</span>
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

      <!-- E 档位（13px·行高 36·右对齐） -->
      <div class="approval-scope">
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
    </div>

    <!-- error 态：卡内一行「提交失败：<人话>」＋ 保留可重试（不销卡） -->
    <p v-if="submitError" class="approval-error">
      {{ t('approval.submitFailed', { msg: submitError }) }}——{{ t('approval.retryHint') }}
    </p>

    <!-- F 按钮区：同意（--accent 实心）／拒绝（中性描边·**非红**） -->
    <div class="approval-actions">
      <button type="button" class="approve" :disabled="working" @click="decide(true)">
        <span v-if="working" class="approval-spinner" aria-hidden="true" />
        {{ working ? t('approval.submitting') : t('approval.approve') }}
      </button>
      <button type="button" class="deny" :disabled="working" @click="decide(false)">
        {{ t('approval.deny') }}
      </button>
    </div>
    <!-- B4：两行按钮——记住这条（会话/项目/永久档）＋ 申请放行（被沙箱拒时） -->
    <div class="approval-actions approval-actions-secondary">
      <button
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
/* ============================================================================
   审批卡样式（《审批卡设计规格 v1.0》§二 具体数值）
   —— 全 token，零裸 hex；圆角 ⊆ {4,8,12,16,9999}；间距全 4 倍数
   —— 交互热区一律 ≥44×44：用 ::after 扩热区，不撑视觉高度
   ============================================================================ */
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

.risk {
  /* 规格 §二 写「徽章内边距 2×8」，但 §五#1 机判要求间距全 4 倍数——
     两处冲突取可机判项 ⇒ 4×8（视觉差 2px；见 DESIGN.md 附一#9） */
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

.risk.high {
  background: var(--danger-soft);
  color: var(--risk-high-text);
}

.risk.medium {
  background: var(--warning-soft);
  color: var(--risk-medium-text);
}

.risk.low {
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

/* —— 来自后台任务（__inbox__） —— */
.approval-from-inbox {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

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
  /* 小号按钮取 8×12（DESIGN.md §4 原文写「小号 6×12」，与 §10#4 四倍数铁律冲突，
     取可机判项；见 DESIGN.md 附一#9） */
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
  /* 选中＝accent 实心（软底 + accent 文字在暗色下仅 4.40:1，不达 ≥4.5；
     实心 + --accent-contrast 两模皆 ≥6.29:1 —— 见讫报对比度实测表） */
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

/* 拒绝＝中性描边（**不得用红**——红只留给 error/danger） */
.approval-actions .deny {
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

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
