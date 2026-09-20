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
import { useExecModeStore } from './stores/execMode'
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
const execMode = useExecModeStore()

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme
}

onMounted(async () => {
  // 应用主题
  applyTheme()
  // MSG-3189 E2③：介入方式**启动加载**——fail-closed：盘上"完全执行"一律回落「每次确认」
  execMode.hydrate()
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
      <!-- MSG-3172：待办收件箱入口统一收口到左侧栏（SidebarPanel，Tab 行之下）——
           此处原为"状态栏被面板遮挡时"的兜底悬浮钮，与侧栏入口同角色 ⇒ 按令
           「避免两处重复入口」一并撤除（会话内 banner 仍保留）。 -->
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
