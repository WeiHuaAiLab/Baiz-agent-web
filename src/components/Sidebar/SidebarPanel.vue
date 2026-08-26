<script setup lang="ts">
// 左侧边栏主容器：品牌区 + Tab 切换（聊天/工作区）+ 用户区。
// 各模块已拆分：SidebarBrand（Logo）、ChatPanel / WorkspacePanel（Tab 内容）、SidebarUser（用户信息）。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '../common/Icon.vue'
import SidebarBrand from './SidebarBrand.vue'
import SidebarUser from './SidebarUser.vue'
import ChatPanel from './ChatPanel.vue'
import WorkspacePanel from './WorkspacePanel.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 侧边栏模块由当前路由驱动：/working 开头的路由显示工作区模块，其余（/、/settings…）显示聊天模块
const activeSection = computed<'chat' | 'work'>(() =>
  route.path.startsWith('/working') ? 'work' : 'chat',
)

/** 切换模块：聊天 → 跳回 /（chatView）；工作区 → 跳 /working */
function switchSection(section: 'chat' | 'work') {
  if (section === 'chat') {
    if (route.path !== '/') void router.push('/')
  } else if (!route.path.startsWith('/working')) {
    void router.push('/working')
  }
}
</script>

<template>
  <aside class="side-panel">
    <SidebarBrand />

    <nav class="side-tabs">
      <button
        type="button"
        :class="{ active: activeSection === 'chat' }"
        @click="switchSection('chat')"
      >
        <Icon name="chat" :size="15" />
        <span>{{ t('nav.chat') }}</span>
      </button>
      <button
        type="button"
        :class="{ active: activeSection === 'work' }"
        @click="switchSection('work')"
      >
        <Icon name="workspace" :size="15" />
        <span>{{ t('nav.workspace') }}</span>
      </button>
    </nav>

    <div class="side-scroll">
      <ChatPanel v-if="activeSection === 'chat'" />
      <WorkspacePanel v-else />
    </div>

    <SidebarUser />
  </aside>
</template>
