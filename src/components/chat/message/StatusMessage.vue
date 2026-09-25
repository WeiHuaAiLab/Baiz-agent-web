<script setup lang="ts">
// 状态消息：状态文案（优先 i18n 键，回退原文）+ 重试 / 去设置操作。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessageStore } from '../../../stores/message'
import { runtimeFailureI18nKey } from '../../../utils/failureText'
import type { ChatMessage } from '../../../models'

const props = withDefaults(defineProps<{ message: ChatMessage; repeat?: number }>(), {
  repeat: 1,
})
const { t } = useI18n()
const router = useRouter()
const messages = useMessageStore()

/**
 * **MSG-3575 · P5 前端面**：外网取件／知识库不可用 ⇒ **只显一句人话**（降噪）。
 * 命中本件分型（`failureText.ts`——只认分型词，禁猜）时：
 *   · **不渲染原文**（`-32xxx`／方法名／URL／base_url 等内部号与术语一律不上屏）；
 *   · 同类**连续重复**已由 `ChatContent` 合并 ⇒ 此处只补「同类失败 ×N」尾标。
 */
const failureKey = computed(() => runtimeFailureI18nKey(props.message.text))

function retry() {
  void messages.retryFrom(props.message.conversationId, props.message.id)
}

function goSettings() {
  void router.push('/settings')
}

/** MSG-3340 A3-②：走**未登录也可达**的「连接知识库」独立页——会话刚失效（-32002 邻域）
 *  时 `/settings` 会被登录闸弹回，而该页恒可达 ⇒ 错误入口在任何登录态下都真的能到。 */
function goKbSetup() {
  void router.push({ name: 'kb-setup' })
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
    <!-- **MSG-3575 · P5**：外网取件／知识库不可用 ⇒ **一句人话**（内部号/术语零上屏）；
         同类连续失败已由 `ChatContent` 合并 ⇒ 此处补「同类失败 ×N」 -->
    <template v-if="failureKey">
      {{ t('errors.' + failureKey) }}
      <span v-if="repeat > 1" class="status-repeat" data-repeat="1">
        {{ t('status.repeatMerged', { n: repeat }) }}
      </span>
    </template>
    <template v-else-if="message.meta?.statusKey">
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
    <!-- MSG-3340（1.0.20 批 A · A3-②）：-32010（知识库未配置）**不再只报不说去哪**——
         与 unauthorized 同律给可点入口（设置页「通用」内含连接知识库卡）。 -->
    <button
      v-if="message.meta?.errorKey === 'kbNotConfigured'"
      type="button"
      class="retry-btn status-kb-entry"
      @click="goKbSetup"
    >
      {{ t('errors.goKbSetup') }}
    </button>
    <button
      v-if="message.meta?.errorKey === 'sessionExpired'"
      type="button"
      class="retry-btn"
      @click="goLogin"
    >
      {{ t('errors.relogin') }}
    </button>

    <!-- **令·补24 P0-5**（`-32002` 带回登录出口）：错误帧带 `login_hint` ⇒ 本条错＝身份/会话面。
         「只报不说去哪」已废——**就在该条消息处**给可点「去登录」。
         三条口径：①复用既有 `identity.notEstablished`／`identity.goLogin`（不另造文案）；
         ②daemon 的 `login_hint` **原文不上屏**（只当存在性判据，防内部号/URL 漏到界面）；
         ③字段缺失（旧 daemon）⇒ 整块不渲染，既有文案零变。 -->
    <div v-if="message.meta?.loginHint" class="identity-notice" role="status" data-login-hint="1">
      <span class="identity-notice-text">{{ t('identity.notEstablished') }}</span>
      <button type="button" class="identity-login" @click="goLogin">
        {{ t('identity.goLogin') }}
      </button>
    </div>
  </div>
</template>
