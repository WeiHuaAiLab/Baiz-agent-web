<script setup lang="ts">
// 侧栏「聊天」Tab：新建会话入口 + 项目列表 + 最近会话（搜索/折叠/列表）。
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/session'
import { useUiStore } from '../../stores/ui'
import Icon from '../common/Icon.vue'
import ProjectList from './chat/ProjectList.vue'
import SessionList from './chat/SessionList.vue'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()

const recentOpen = ref(true)
const searchOpen = ref(false)
const searchQuery = ref('')

/** 最近会话：排除已置顶项（置顶项在「置顶」栏单独展示） */
const filteredSessions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const list = session.conversations.filter((item) => !item.pinnedAt)
  if (!query) return list
  return list.filter((item) => item.title.toLowerCase().includes(query))
})

/** 置顶会话：无置顶项时栏目整体不显示 */
const pinnedSessions = computed(() =>
  session.conversations.filter((item) => item.pinnedAt),
)

/** 新建会话：若当前不在 / 聊天路由（如设置页），先跳回 / 再打开创建流程 */
function newSession() {
  if (router.currentRoute.value.path !== '/') {
    void router.push('/')
  }
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

    <div v-if="pinnedSessions.length" class="section-block">
      <div class="section-head">
        <span>{{ t('sidebar.pinned') }}</span>
      </div>
      <SessionList :items="pinnedSessions" />
    </div>

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
