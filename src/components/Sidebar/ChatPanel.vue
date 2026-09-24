<script setup lang="ts">
// 侧栏「聊天」Tab：新建会话入口 + 项目列表 + 最近会话（搜索/折叠/列表）。
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/session'
import { useAuthStore } from '../../stores/auth'
import { isIdentityMissing } from '../../utils/authFailure'
import { useUiStore } from '../../stores/ui'
import Icon from '../common/Icon.vue'
import ProjectList from './chat/ProjectList.vue'
import SessionList from './chat/SessionList.vue'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const auth = useAuthStore()
const ui = useUiStore()

/** MSG-3558 ③：未登录面（空 uid）——侧栏会话列表须显式提示，不得以空态呈现 */
/** 口径同 ScheduledView：**已持令牌但身份未建立**（空 uid）才提示，纯未登录由登录闸处理 */
const identityMissing = computed(() => auth.loggedIn && isIdentityMissing(auth.userId))

function goLogin() {
  void router.push('/login')
}

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
    <!-- MSG-3529 A3：**旧版（无账号段）会话的显式提示**——旧库 `baiz` 只读清点、
         本版不显示（零删零改）；有则上屏（非静默），无则空串不占位。
         口径：换账号后=**各账号只看本账号库**；旧库会话**不归任何账号** ⇒ 一律不显示。 -->
    <p v-if="session.legacyNotice" class="legacy-notice" role="status">
      {{ session.legacyNotice }}
    </p>
    <!-- MSG-3558 ③（老板 2026-09-24）：未登录／身份未建立 ⇒ **显式提示条**；
         历史／会话列表**不得**以「暂无」空态呈现（空 uid 下"没有会话"其实是"没有身份"）。 -->
    <div v-if="identityMissing" class="identity-notice" role="status" data-identity-notice="1">
      <span class="identity-notice-text">{{ t('identity.notEstablished') }}</span>
      <button type="button" class="identity-login" @click="goLogin">
        {{ t('identity.goLogin') }}
      </button>
    </div>
    <!-- MSG-2581 修④：新建钮 aria-label 显式化（可及/自动化定位面） -->
    <button type="button" class="menu-item" :aria-label="t('chat.newSession')" @click="newSession">
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

<style scoped>
/* MSG-3529 A3：旧版会话提示条（全 token 走既有 DESIGN 变量·常显可辨·非阻断） */
.legacy-notice {
  margin: 6px 8px 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
