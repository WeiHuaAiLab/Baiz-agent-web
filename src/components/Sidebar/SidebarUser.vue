<script setup lang="ts">
// 侧栏底部用户区：头像 + 用户名 + 悬浮菜单（设置/反馈），以及反馈弹窗。
// 「关于」已并入设置页「关于」Tab（见 SystemCard.vue）。
// MSG-2670：微信消息入口全件删（按钮/路由/视图/utils/locales——本地 HTML 径替代）。
import { ref } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../../stores/settings'
import { useAuthStore } from '../../stores/auth'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const router = useRouter()
const settings = useSettingsStore()
const auth = useAuthStore()

// 登录态下的头像/用户名（邮箱派生）：
//   头像字＝邮箱首字母大写；颜色＝按邮箱哈希取色板（同一账号每次同色——
//   若真随机，每次刷新/重渲染换色会闪跳，观感像 bug）。
//   用户名源＝auth.email（登录时落的邮箱；user_id 是随机数不做用户名）；
//   兜底 userId（邮箱缺储时仍显示出可辨识的账号键）。
// 未登录（或两者皆空）⇒ 回落旧行为：user 图标＋settings.username。
const authEmail = computed(() =>
  auth.loggedIn ? (auth.email || auth.userId).trim() : '',
)
const authInitial = computed(() => {
  const first = authEmail.value.charAt(0)
  return first ? first.toUpperCase() : ''
})
const authName = computed(() => {
  const email = authEmail.value
  if (!email) return ''
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
})

// 头像色板（柔和深浅适中，深浅两套文字色都可读；浅色文字配深底）
const AVATAR_PALETTE = ['#e05263', '#d97706', '#16a34a', '#0891b2', '#7c3aed', '#db2777', '#4f46e5', '#059669']

/** 邮箱 → 稳定色（FNV-1a 32 位哈希入色板索引；同邮箱恒同色） */
function avatarColor(email: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < email.length; i += 1) {
    hash ^= email.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}
const avatarStyle = computed(() =>
  authInitial.value ? { background: avatarColor(authEmail.value) } : undefined,
)

const showFeedback = ref(false)
const feedbackText = ref('')
const feedbackSent = ref(false)

function goSettings() {
  void router.push('/settings')
}

// MSG-3509 P2：**显式退出登录**——清壳侧系统凭据库条目＋清本机会话态，
// 然后回登录页（**清后必须重登**，不得残留自动复登痕迹）。
async function doLogout() {
  await auth.logout()
  void router.push('/login')
}

function openFeedback() {
  showFeedback.value = true
  feedbackSent.value = false
  feedbackText.value = ''
}

function sendFeedback() {
  feedbackSent.value = true
  setTimeout(() => {
    showFeedback.value = false
  }, 1200)
}
</script>

<template>
  <div class="user-area">
    <!-- 已登录：邮箱首字母＋派生色；未登录：回落 user 图标 -->
    <span v-if="authInitial" class="avatar avatar-letter" :style="avatarStyle">{{ authInitial }}</span>
    <span v-else class="avatar"><Icon name="user" :size="16" /></span>
    <span class="username">{{ authName || settings.username }}</span>
    <div class="user-pop">
      <button type="button" @click="goSettings">
        <Icon name="settings" :size="14" />
        <span>{{ t('nav.settings') }}</span>
      </button>
      <button type="button" @click="openFeedback">
        <Icon name="feedback" :size="14" />
        <span>{{ t('sidebar.feedback') }}</span>
      </button>
      <button type="button" class="logout" @click="doLogout">
        <Icon name="logout" :size="14" />
        <span>{{ t('sidebar.logout') }}</span>
      </button>
    </div>
  </div>

  <div v-if="showFeedback" class="modal-mask" @click.self="showFeedback = false">
    <div class="modal-card">
      <h3>{{ t('sidebar.feedbackTitle') }}</h3>
      <p v-if="feedbackSent" class="feedback-sent">{{ t('sidebar.feedbackSent') }}</p>
      <textarea
        v-else
        v-model="feedbackText"
        class="feedback-input"
        :placeholder="t('sidebar.feedbackPlaceholder')"
        rows="4"
      />
      <div v-if="!feedbackSent" class="modal-actions">
        <button type="button" class="btn-ghost" @click="showFeedback = false">
          {{ t('common.back') }}
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!feedbackText.trim()"
          @click="sendFeedback"
        >
          {{ t('sidebar.feedbackSend') }}
        </button>
      </div>
    </div>
  </div>
</template>
