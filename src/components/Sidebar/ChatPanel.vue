<script setup lang="ts">
// 侧栏「聊天」Tab：新建会话入口 + 项目列表 + 最近会话（搜索/折叠/列表）。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/session'
import { useUiStore } from '../../stores/ui'
import Icon from '../common/Icon.vue'
import ProjectList from './chat/ProjectList.vue'
import SessionList from './chat/SessionList.vue'

const { t } = useI18n()
const session = useSessionStore()
const ui = useUiStore()

const recentOpen = ref(true)
const searchOpen = ref(false)
const searchQuery = ref('')

const filteredSessions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return session.conversations
  return session.conversations.filter((item) => item.title.toLowerCase().includes(query))
})

function newSession() {
  ui.openCreate('session')
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) {
    recentOpen.value = true
  } else {
    searchQuery.value = ''
  }
}
</script>

<template>
  <section class="side-section">
    <button type="button" class="menu-item" @click="newSession">
      <Icon name="chat" :size="15" />
      <span>{{ t('chat.newSession') }}</span>
    </button>

    <ProjectList />

    <div class="section-block">
      <div class="section-head clickable" @click="recentOpen = !recentOpen">
        <span>{{ t('sidebar.recent') }}</span>
        <span class="head-icons">
          <button
            type="button"
            class="mini-add"
            :title="t('sidebar.searchSessions')"
            @click.stop="toggleSearch"
          >
            <Icon name="search" :size="13" />
          </button>
          <Icon name="chevron" :size="14" :class="{ open: recentOpen }" />
        </span>
      </div>
      <input
        v-if="searchOpen"
        v-model="searchQuery"
        class="session-search"
        :placeholder="t('sidebar.searchPlaceholder')"
      />
      <SessionList v-if="recentOpen || searchOpen" :items="filteredSessions" />
    </div>
  </section>
</template>
