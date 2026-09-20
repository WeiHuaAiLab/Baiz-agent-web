<script setup lang="ts">
// 状态消息：状态文案（优先 i18n 键，回退原文）+ 重试 / 去设置操作。
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessageStore } from '../../../stores/message'
import type { ChatMessage } from '../../../models'

const props = defineProps<{ message: ChatMessage }>()
const { t } = useI18n()
const router = useRouter()
const messages = useMessageStore()

function retry() {
  void messages.retryFrom(props.message.conversationId, props.message.id)
}

function goSettings() {
  void router.push('/settings')
}
</script>

<template>
  <div class="status-text" :class="message.meta?.status">
    <template v-if="message.meta?.statusKey">
      {{ t('status.' + message.meta.statusKey) }}
      <template v-if="message.meta?.errorKey">：{{ t('errors.' + message.meta.errorKey) }}</template>
      <span v-if="message.text">（{{ message.text }}）</span>
    </template>
    <template v-else>{{ message.text }}</template>
    <button
      v-if="
        message.meta?.statusKey === 'sendFailed' || message.meta?.statusKey === 'taskError'
      "
      type="button"
      class="retry-btn"
      @click="retry"
    >
      {{ t('common.retry') }}
    </button>
    <button
      v-if="message.meta?.errorKey === 'unauthorized'"
      type="button"
      class="retry-btn"
      @click="goSettings"
    >
      {{ t('errors.goSettings') }}
    </button>
  </div>
</template>
