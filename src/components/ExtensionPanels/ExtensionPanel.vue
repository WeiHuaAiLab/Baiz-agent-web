<script setup lang="ts">
// 聊天页右侧扩展面板（抽屉）容器：
// 是否打开与打开类型均由 ChatView 通过 props 配置（默认打开、内容为 FilesPanel）；
// 新增面板类型只需在 PANELS 映射中注册，并在 ChatView 的 type 配置处切换。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import FilesPanel from './FilesPanel.vue'

export type ExtensionPanelType = 'files'

// 抽屉类型 → 面板组件映射；后续新增记忆/任务等面板在此注册
const PANELS: Record<ExtensionPanelType, Component> = {
  files: FilesPanel,
}

const props = withDefaults(
  defineProps<{
    open?: boolean
    type?: ExtensionPanelType
  }>(),
  { open: true, type: 'files' },
)

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const width = ref(320)

function toggle() {
  emit('update:open', !props.open)
}

function onKeydown(event: KeyboardEvent) {
  // Ctrl+B：抽屉开关（规范 §九）
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    toggle()
  }
}

function startDrag(event: MouseEvent) {
  const startX = event.clientX
  const startWidth = width.value
  const onMove = (moveEvent: MouseEvent) => {
    width.value = Math.max(240, Math.min(560, startWidth - (moveEvent.clientX - startX)))
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <template v-if="open">
    <div class="divider" title="拖拽调整宽度" @mousedown="startDrag" />
    <aside class="files extension-panel" :style="{ width: width + 'px' }">
      <component :is="PANELS[type]" @close="toggle" />
    </aside>
  </template>
</template>
