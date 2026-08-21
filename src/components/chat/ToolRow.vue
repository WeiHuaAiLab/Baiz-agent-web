<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChatMessage } from '../../models'
import { useWorkingTreeStore } from '../../stores/workingTree'
import { diffStats } from '../../utils/diff'
import Icon from '../common/Icon.vue'

const props = defineProps<{ message: ChatMessage }>()
const working = useWorkingTreeStore()
const open = ref(false)
const running = computed(() => props.message.meta?.success === undefined)

const filePath = computed(() => {
  const args = props.message.meta?.argsPreview
  if (!args) return ''
  try {
    const parsed = JSON.parse(args) as { path?: string }
    return typeof parsed.path === 'string' ? parsed.path : ''
  } catch {
    return ''
  }
})
const isFileTool = computed(() => /^(fs\.|code\.)/.test(props.message.meta?.toolName ?? ''))
const refStats = computed(() => {
  const file = working.files[filePath.value]
  if (!file) return null
  return diffStats(file.original, file.current)
})

function openFile() {
  if (filePath.value) working.selectFile(filePath.value)
}
</script>

<template>
  <div class="tool-row" :class="{ running, failed: message.meta?.success === false }">
    <div class="tool-main" @click="open = !open">
      <span class="tool-status">{{ running ? '⟳' : message.meta?.success ? '✓' : '✗' }}</span>
      <span class="tool-name">{{ message.meta?.toolName }}</span>
      <span v-if="message.text" class="tool-preview">{{ message.text }}</span>
      <span class="tool-toggle">{{ open ? '▾' : '▸' }}</span>
    </div>
    <div v-if="isFileTool && filePath" class="file-ref" @click.stop="openFile">
      <Icon name="copy" :size="12" />
      <span class="file-ref-path">{{ filePath }}</span>
      <span v-if="refStats" class="file-ref-stats">
        +{{ refStats.added }} −{{ refStats.removed }}
      </span>
    </div>
    <pre v-if="open && message.meta?.argsPreview" class="tool-args">{{
      message.meta.argsPreview
    }}</pre>
  </div>
</template>
