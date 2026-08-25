<script setup lang="ts">
// 左侧边栏主容器：品牌区 + Tab 切换（聊天/工作区）+ 用户区。
// 各模块已拆分：SidebarBrand（Logo）、ChatPanel / WorkspacePanel（Tab 内容）、SidebarUser（用户信息）。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '../common/Icon.vue'
import SidebarBrand from './SidebarBrand.vue'
import SidebarUser from './SidebarUser.vue'
import ChatPanel from './ChatPanel.vue'
import WorkspacePanel from './WorkspacePanel.vue'

const { t } = useI18n()

// 默认展示聊天模块
const activeSection = ref<'chat' | 'work'>('chat')
</script>

<template>
  <aside class="side-panel">
    <SidebarBrand />

    <nav class="side-tabs">
      <button
        type="button"
        :class="{ active: activeSection === 'chat' }"
        @click="activeSection = 'chat'"
      >
        <Icon name="chat" :size="15" />
        <span>{{ t('nav.chat') }}</span>
      </button>
      <button
        type="button"
        :class="{ active: activeSection === 'work' }"
        @click="activeSection = 'work'"
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
