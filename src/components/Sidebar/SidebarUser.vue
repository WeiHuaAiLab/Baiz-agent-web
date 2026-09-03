<script setup lang="ts">
// 侧栏底部用户区：头像 + 用户名 + 悬浮菜单（设置/反馈），以及反馈弹窗。
// 「关于」已并入设置页「关于」Tab（见 SystemCard.vue）。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../../stores/settings'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const router = useRouter()
const settings = useSettingsStore()

const showFeedback = ref(false)
const feedbackText = ref('')
const feedbackSent = ref(false)

function goSettings() {
  void router.push('/settings')
}

// MSG-2418 甲：微信归档消息展示页入口
function goWechat() {
  void router.push('/wechat')
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
    <span class="avatar"><Icon name="user" :size="16" /></span>
    <span class="username">{{ settings.username }}</span>
    <div class="user-pop">
      <button type="button" @click="goSettings">
        <Icon name="settings" :size="14" />
        <span>{{ t('nav.settings') }}</span>
      </button>
      <button type="button" @click="goWechat">
        <Icon name="chat" :size="14" />
        <span>{{ t('nav.wechat') }}</span>
      </button>
      <button type="button" @click="openFeedback">
        <Icon name="feedback" :size="14" />
        <span>{{ t('sidebar.feedback') }}</span>
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
