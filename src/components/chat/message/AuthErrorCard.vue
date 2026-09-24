<script setup lang="ts">
// **MSG-3558**（老板 2026-09-24 亲提）：模型鉴权失败的**就地人话错误卡**。
// 六件套：标题／**已掩码**原因片段／**当前模型名**／处置指引／直达设置页／重试上一条。
// 红线：**禁静默转圈**；**禁上屏密钥原文**（原因片段已由 `maskedReason()` 过一道）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessageStore } from '../../../stores/message'
import { useSettingsStore } from '../../../stores/settings'
import { maskedReason, modelDisplayName } from '../../../utils/authFailure'
import type { ChatMessage } from '../../../models'

const props = defineProps<{ message: ChatMessage }>()
const { t } = useI18n()
const router = useRouter()
const messages = useMessageStore()
const settings = useSettingsStore()

/** 原因片段：取服务端原文并**就地掩码**（禁上屏密钥原文） */
const reason = computed(() => maskedReason(props.message.text))
const modelName = computed(() => modelDisplayName(settings.model))

function goSettings() {
  void router.push('/settings')
}

/** 「重试上一条」：复用既有 retryFrom（回放到最近一条用户消息） */
function retry() {
  void messages.retryFrom(props.message.conversationId, props.message.id)
}
</script>

<template>
  <div class="auth-error-card" role="alert" data-auth-error="model">
    <div class="auth-error-title">{{ t('chat.modelAuthTitle') }}</div>
    <p v-if="reason" class="auth-error-reason">
      {{ t('chat.modelAuthReason', { reason }) }}
    </p>
    <p class="auth-error-model">{{ t('chat.modelAuthModel', { model: modelName }) }}</p>
    <p class="auth-error-guide">{{ t('chat.modelAuthGuide') }}</p>
    <div class="auth-error-actions">
      <button type="button" class="auth-error-settings" @click="goSettings">
        {{ t('chat.modelAuthGoSettings') }}
      </button>
      <button type="button" class="auth-error-retry" @click="retry">
        {{ t('chat.modelAuthRetry') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.auth-error-card {
  margin: 8px 0;
  padding: 12px 14px;
  border: 1px solid #f0b4a8;
  border-left: 3px solid #d4380d;
  border-radius: 8px;
  background: #fff2ef;
  color: #612500;
}
.auth-error-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.auth-error-reason,
.auth-error-model,
.auth-error-guide {
  margin: 2px 0;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}
.auth-error-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.auth-error-settings,
.auth-error-retry {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #d4380d;
  background: #fff;
  color: #d4380d;
  cursor: pointer;
}
</style>
