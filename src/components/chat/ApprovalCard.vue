<script setup lang="ts">
// 审批卡增强（件 3）：JSON 友好展示 + apply_patch 改动预览（DiffView）
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApprovalStore } from '../../stores/approval'
import DiffView from './DiffView.vue'
import type { ChatMessage } from '../../models'
import type { DiffLine } from '../../utils/diff'

const props = defineProps<{ message: ChatMessage }>()
const { t } = useI18n()
const approval = useApprovalStore()
const working = ref(false)
const showDiff = ref(false)

const risk = computed(() => props.message.meta?.risk ?? 'medium')
const resolved = computed(() => props.message.meta?.approved !== undefined)

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

const prettyArgs = computed(() => {
  if (args.value) {
    try {
      return JSON.stringify(args.value, null, 2)
    } catch {
      /* fallthrough */
    }
  }
  return props.message.meta?.argsPreview ?? ''
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
  await approval.respond(props.message.meta.requestId, approved)
  working.value = false
}
</script>

<template>
  <!-- 决议后立即收起为一行（不残留占位，老壳最大痛点回归项） -->
  <div v-if="resolved" class="approval-card resolved">
    <span class="approval-check" :class="{ denied: !message.meta?.approved }">
      {{ message.meta?.approved ? '✓' : '✗' }}
    </span>
    <span class="approval-action">{{ message.meta?.toolName }}</span>
    <span class="approval-result" :class="{ denied: !message.meta?.approved }">
      {{ message.meta?.approved ? t('approval.approved') : t('approval.denied') }}
    </span>
  </div>
  <div v-else class="approval-card">
    <div class="approval-head">
      <span class="approval-title">{{ t('approval.title') }}</span>
      <span class="risk" :class="risk">
        {{ risk === 'high' ? t('approval.highRisk') : risk === 'low' ? t('approval.lowRisk') : t('approval.mediumRisk') }}
      </span>
    </div>
    <div class="approval-body">
      <div class="approval-action">{{ message.meta?.toolName }}</div>
      <pre v-if="prettyArgs" class="approval-args">{{ prettyArgs }}</pre>
      <div v-if="isPatch" class="approval-patch">
        <button type="button" class="approval-diff-toggle" @click="showDiff = !showDiff">
          {{ showDiff ? t('approval.hideChanges') : t('approval.viewChanges') }}
        </button>
        <DiffView v-if="showDiff" :lines="patchLines" :collapse-threshold="60" />
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
  </div>
</template>
