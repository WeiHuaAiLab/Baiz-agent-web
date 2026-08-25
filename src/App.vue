<script setup lang="ts">
import { onMounted, watch } from 'vue'
import SidebarPanel from './components/SidebarPanel.vue'
import { useSessionStore } from './stores/session'
import { useSettingsStore } from './stores/settings'
import { seedDemoIfNeeded } from './demo/seed'
import { useWorkingTreeStore } from './stores/workingTree'
import { useMemoryStore } from './stores/memory'
import CommandPalette from './components/CommandPalette.vue'
import OnboardingOverlay from './components/OnboardingOverlay.vue'
import StatusBar from './components/StatusBar.vue'
import ToastContainer from './components/ToastContainer.vue'

const session = useSessionStore()
const settings = useSettingsStore()
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
</script>

<template>
  <div class="app-shell">
    <SidebarPanel class="sidebar" />
    <main class="chat-area">
      <div class="chat-router">
        <router-view />
      </div>
      <StatusBar />
    </main>

    <!-- 处理弹窗内容 -->
    <ToastContainer />
    <!-- 命令行控制面板 -->
    <CommandPalette />
    <!-- 新手指引 -->
    <OnboardingOverlay />
  </div>
</template>
