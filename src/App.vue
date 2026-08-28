<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarPanel from './components/Sidebar/SidebarPanel.vue'
import Icon from './components/common/Icon.vue'
import { useSessionStore } from './stores/session'
import { useSettingsStore } from './stores/settings'
import { useUiStore } from './stores/ui'
import { seedDemoIfNeeded } from './demo/seed'
import { useWorkingTreeStore } from './stores/workingTree'
import { useMemoryStore } from './stores/memory'
import CommandPalette from './components/CommandPalette.vue'
import OnboardingOverlay from './components/OnboardingOverlay.vue'
import StatusBar from './components/StatusBar.vue'
import ToastContainer from './components/ToastContainer.vue'
import CreateProject from './components/chat/CreateProject.vue'
import CreateTask from './components/chat/CreateTask.vue'

const { t } = useI18n()
const session = useSessionStore()
const ui = useUiStore()
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
  <div class="app-shell" :class="{ 'sidebar-collapsed': ui.sidebarCollapsed }">
    <SidebarPanel class="sidebar" />
    <main class="chat-area">
      <!-- 侧栏展开/收缩：悬浮于 main 容器左上角，全局控制左侧 sidebar 的显示与展开 -->
      <button
        type="button"
        class="sidebar-toggle-fab"
        :title="t('chat.toggleSidebar')"
        @click="ui.toggleSidebar()"
      >
        <Icon name="menuFold" :size="15" :class="{ flip: ui.sidebarCollapsed }" />
      </button>
      <div class="chat-router">
        <router-view />
      </div>
    </main>

    <!-- 状态栏：悬浮窗模式，fixed 定位右下角 -->
    <StatusBar />
    <!-- 处理弹窗内容 -->
    <ToastContainer />
    <!-- 命令行控制面板 -->
    <CommandPalette />
    <!-- 新建项目弹窗：挂在 App 顶层而非 ChatView，让 modal-mask 覆盖任意路由，
         避免整页切换；ui.createMode 由 ProjectList「+」/CreateChat 工具条触发 -->
    <CreateProject v-if="ui.createMode === 'project'" />
    <!-- 创建自动化任务弹窗（定时任务）：挂在 App 顶层，遮罩覆盖任意路由；
         由侧栏工作区「创建任务」入口触发（ui.createMode === 'scheduled'） -->
    <CreateTask v-if="ui.createMode === 'scheduled'" />
    <!-- 新手指引 -->
    <OnboardingOverlay />
  </div>
</template>
