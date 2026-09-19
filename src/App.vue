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
import { useApprovalStore } from './stores/approval'
import CommandPalette from './components/CommandPalette.vue'
import OnboardingOverlay from './components/OnboardingOverlay.vue'
import StatusBar from './components/StatusBar.vue'
import ToastContainer from './components/ToastContainer.vue'
import CreateProject from './components/chat/CreateProject.vue'
import CreateTask from './components/chat/CreateTask.vue'
import ApprovalInbox from './components/ApprovalInbox.vue'

const { t } = useI18n()
const session = useSessionStore()
const ui = useUiStore()
const settings = useSettingsStore()
const working = useWorkingTreeStore()
const memory = useMemoryStore()
const approvals = useApprovalStore()

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
      <button
        type="button"
        class="sidebar-toggle-fab"
        :title="t('chat.toggleSidebar')"
        @click="ui.toggleSidebar()"
      >
        <Icon name="menuFold" :size="15" :class="{ flip: ui.sidebarCollapsed }" />
      </button>
      <!-- 标准 v1.0 §C B5：待办收件箱**常驻**入口＋`pending_total` 角标。
           置于 main 左上（z-index 30，高于右侧扩展面板的 20）——右侧面板展开时
           状态栏那条会被面板盖住，故常驻入口放这里，两个入口开同一个面板。 -->
      <button
        type="button"
        class="inbox-fab"
        :class="{ 'has-items': approvals.badgeCount > 0 }"
        :title="t('approval.inboxTitle')"
        @click="ui.toggleInbox()"
      >
        <Icon name="inbox" :size="15" />
        <span v-if="approvals.badgeCount > 0" class="inbox-badge">{{ approvals.badgeCount }}</span>
      </button>
      <div class="chat-router">
        <router-view />
      </div>
    </main>

    <StatusBar />
    <ToastContainer />
    <CommandPalette />
    <ApprovalInbox />
    <CreateProject v-if="ui.createMode === 'project'" />
    <CreateTask v-if="ui.createMode === 'scheduled'" />
    <OnboardingOverlay />
  </div>
</template>
