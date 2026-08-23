<script setup lang="ts">
// Diff 渲染：行号 + 红绿 + 语法高亮 + 折叠（件 2，对照 codex diff_render.rs）
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import hljs from 'highlight.js/lib/common'
import { computeLineDiff } from '../../utils/diff'
import type { DiffLine } from '../../utils/diff'

const { t } = useI18n()

const props = defineProps<{
  original?: string
  current?: string
  lines?: DiffLine[]
  language?: string
  // 超过该行数默认折叠（0 = 永不折叠）
  collapseThreshold?: number
}>()

const unfolded = ref(false)
const threshold = computed(() => props.collapseThreshold ?? 100)

const diffLines = computed<DiffLine[]>(() => {
  if (props.lines) return props.lines
  if (props.original !== undefined && props.current !== undefined) {
    return computeLineDiff(props.original, props.current)
  }
  return []
})

const stats = computed(() => {
  let added = 0
  let removed = 0
  for (const line of diffLines.value) {
    if (line.type === 'added') added += 1
    if (line.type === 'removed') removed += 1
  }
  return { added, removed }
})

const collapsed = computed(() => {
  if (threshold.value === 0) return false
  return diffLines.value.length > threshold.value && !unfolded.value
})

const shown = computed(() => (collapsed.value ? diffLines.value.slice(0, threshold.value) : diffLines.value))
const hiddenCount = computed(() => Math.max(0, diffLines.value.length - shown.value.length))

function highlight(text: string): string {
  if (!props.language || !hljs.getLanguage(props.language)) {
    return escapeHtml(text)
  }
  try {
    return hljs.highlight(text, { language: props.language }).value
  } catch {
    return escapeHtml(text)
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function lineClass(type: DiffLine['type']): string {
  return type === 'added' ? 'diff-add' : type === 'removed' ? 'diff-del' : 'diff-ctx'
}
</script>

<template>
  <div class="diff-view">
    <div class="diff-head">
      <span class="diff-stats">
        <span class="diff-add-num">+{{ stats.added }}</span>
        <span class="diff-del-num">−{{ stats.removed }}</span>
      </span>
      <button
        v-if="diffLines.length > threshold && threshold > 0"
        type="button"
        class="diff-toggle"
        @click="unfolded = !unfolded"
      >
        {{ collapsed ? t('diff.expandAll', { n: hiddenCount }) : t('diff.collapse') }}
      </button>
    </div>
    <div class="diff-body">
      <div v-for="(line, i) in shown" :key="i" :class="['diff-line', lineClass(line.type)]">
        <span class="diff-old-no">{{ line.oldNo ?? '' }}</span>
        <span class="diff-new-no">{{ line.newNo ?? '' }}</span>
        <span class="diff-sign">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' ' }}</span>
        <span class="diff-text" v-html="highlight(line.text)" />
      </div>
      <div v-if="hiddenCount > 0" class="diff-more">{{ t('diff.more', { n: hiddenCount }) }}</div>
    </div>
  </div>
</template>
