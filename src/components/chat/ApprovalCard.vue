<script setup lang="ts">
// 审批卡（前端协作标准 v1.0 §C 逐条）：
// B1 理由一句置顶（`reason`）｜B2 人话摘要（禁裸 JSON／禁内部术语）｜
// B3 档位下拉（默认「一次」高亮）｜B4 两行按钮：记住这条 ＋ 申请放行｜
// B8 档位未知不得伪装（禁默认 medium）。
// 已有面（勿重做）：内联卡壳、apply_patch 改动预览（DiffView）折叠、已决态。
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
/** 档位：默认「一次」（不建规则）——B3 */
const scope = ref<ApprovalScope>('once')

// B8：档位未知不得伪装——取不到 risk 就是「未知」，不再默认 medium
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
/** B1：理由一句（daemon 保证必有；缺字段时留空，不编造） */
const reasonText = computed(() => props.message.meta?.reason ?? '')
const toolText = computed(() => toolLabel(props.message.meta?.toolName))
/** B2：人话摘要——命令／路径／改动要点，禁 `{...}` 原始 JSON */
const summary = computed(() =>
  humanizeArgs(props.message.meta?.toolName, props.message.meta?.argsPreview),
)
const rememberHint = computed(() =>
  scope.value === 'once' ? t('approval.rememberNeedsScope') : t('approval.rememberHint'),
)
const scopeOptions = computed<Array<{ value: ApprovalScope; label: string }>>(() => [
  { value: 'once', label: t('approval.scopeOnce') },
  { value: 'session', label: t('approval.scopeSession') },
  { value: 'project', label: t('approval.scopeProject') },
  { value: 'forever', label: t('approval.scopeForever') },
])

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
  if (!props.message.meta?.requestId || working.value) return
  working.value = true
  // B3：档位随提交回填 scope——「一次」＝不建规则（store 侧省略入参）
  await approval.respond(props.message.meta.requestId, approved, scope.value)
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
  <div v-if="resolved" class="approval-card resolved">
    <span class="approval-check" :class="{ denied: !message.meta?.approved }">
      {{ message.meta?.approved ? '✓' : '✗' }}
    </span>
    <span class="approval-action">{{ toolText }}</span>
    <span class="approval-result" :class="{ denied: !message.meta?.approved }">
      {{ message.meta?.approved ? t('approval.approved') : t('approval.denied') }}
    </span>
  </div>
  <div v-else class="approval-card">
    <div class="approval-head">
      <span class="approval-title">{{ t('approval.title') }}</span>
      <span class="risk" :class="riskLevel">{{ riskText }}</span>
    </div>
    <div class="approval-body">
      <!-- B1：理由一句置顶（卡头下第一行） -->
      <div v-if="reasonText" class="approval-reason">{{ reasonText }}</div>
      <div class="approval-action">{{ toolText }}</div>
      <!-- B2：人话摘要（禁裸 JSON、禁内部术语） -->
      <p class="approval-summary">{{ summary }}</p>
      <div v-if="isPatch" class="approval-patch">
        <button type="button" class="approval-diff-toggle" @click="showDiff = !showDiff">
          {{ showDiff ? t('approval.hideChanges') : t('approval.viewChanges') }}
        </button>
        <DiffView v-if="showDiff" :lines="patchLines" :collapse-threshold="60" />
      </div>
      <!-- B3：档位下拉——默认「一次」高亮（选「本会话」后同类第二次不弹） -->
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
    <div class="approval-actions">
      <button type="button" class="approve" :disabled="working" @click="decide(true)">
        {{ t('approval.approve') }}
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
