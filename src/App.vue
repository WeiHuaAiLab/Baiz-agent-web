<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import SidebarPanel from './components/SidebarPanel.vue'
import FilesPanel from './components/FilesPanel.vue'
import { useSessionStore } from './stores/session'
import { useSettingsStore } from './stores/settings'
import { seedDemoIfNeeded } from './demo/seed'
import { useUiStore } from './stores/ui'
import { useWorkingTreeStore } from './stores/workingTree'
import { useMemoryStore } from './stores/memory'
import CommandPalette from './components/CommandPalette.vue'
import OnboardingOverlay from './components/OnboardingOverlay.vue'

// 初始化workingTree的宽度
const filesWidth = ref(320)
const session = useSessionStore()
const settings = useSettingsStore()
const ui = useUiStore()
const working = useWorkingTreeStore()
const memory = useMemoryStore()

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme
}

onMounted(async () => {
  // 应用主题
  applyTheme()
  // 创建Demo会话
  await seedDemoIfNeeded()
  // 模拟工作树（编码版本管理）[初始化workingTree树结构到Store中]
  if (settings.demoMode) working.seedDemo()
  // 模拟记忆数据[初始化memory到Store中]
  if (settings.demoMode) memory.seedDemo()
  // 默认加载会话列表
  await session.load() 
  // 默认打开第一个会话列表
  if (!session.activeId) await session.create()
})

watch(() => settings.theme, applyTheme)

function startDrag(event: MouseEvent) {
  const startX = event.clientX
  const startWidth = filesWidth.value
  const onMove = (moveEvent: MouseEvent) => {
    filesWidth.value = Math.max(240, Math.min(560, startWidth - (moveEvent.clientX - startX)))
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<template>
  <div class="app-shell">
    <SidebarPanel class="sidebar" />
    <main class="chat-area">
      <router-view />
    </main>
    <div class="divider" title="拖拽调整宽度" @mousedown="startDrag" />
    <FilesPanel class="files" :style="{ width: filesWidth + 'px' }" />

    <div class="toast-container">
      <div v-for="toast in ui.toasts" :key="toast.id" class="toast" :class="toast.type">
        {{ toast.message }}
      </div>
    </div>

    <CommandPalette />
    <OnboardingOverlay />
  </div>
</template>
