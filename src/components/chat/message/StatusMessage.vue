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

/** DEBT-742：会话失效 ⇒ 明确入口回到登录页（自愈已在 store 侧清 token） */
function goLogin() {
  void router.push('/login')
}

/** 标准 v1.0 §A3：队列单条取消（chat.queue_cancel） */
function cancelQueued() {
  void messages.cancelQueued(props.message.conversationId, props.message.id)
}
</script>

<template>
  <!-- 标准 v1.0 §A3／§C：队列条——「排队中·第 N 位」＋单条取消（我方口径，随 kind 分发迁入） -->
  <div
    v-if="message.meta?.queued || message.meta?.queueCancelled"
    class="status-text queued"
  >
    <template v-if="message.meta?.queueCancelled">
      {{ t('chat.queueCancelled') }}
    </template>
    <template v-else>
      <span class="queue-text">
        {{ t('chat.queuePosition', { n: message.meta?.queuePosition ?? 1 }) }}
      </span>
      <button type="button" class="queue-cancel" @click="cancelQueued">
        {{ t('chat.queueCancel') }}
      </button>
    </template>
  </div>
  <div v-else class="status-text" :class="message.meta?.status">
    <template v-if="message.meta?.statusKey">
      {{ t('status.' + message.meta.statusKey) }}
      <template v-if="message.meta?.errorKey">：{{ t('errors.' + message.meta.errorKey) }}</template>
      <span v-if="message.text">（{{ message.text }}）</span>
    </template>
    <template v-else>{{ message.text }}</template>
    <button
      v-if="
        message.meta?.statusKey === 'sendFailed' ||
        message.meta?.statusKey === 'taskError' ||
        // MSG-3266 ②：协议泄漏兜底后的**可见重试**入口（禁静默）
        message.meta?.statusKey === 'protocolLeak'
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
    <button
      v-if="message.meta?.errorKey === 'sessionExpired'"
      type="button"
      class="retry-btn"
      @click="goLogin"
    >
      {{ t('errors.relogin') }}
    </button>
  </div>
</template>
