<script setup lang="ts">
// DEBT-738（MSG-3148）：生产禁兜底 mock ⇒ 取不到传输时**只挂本页**——
// 「无法连接本地服务」＋重试；**不挂主应用**（绝不假登录）。
import { useI18n } from 'vue-i18n'

defineProps<{ detail?: string }>()
const { t } = useI18n()

function retry() {
  window.location.reload()
}
</script>

<template>
  <div class="offline">
    <div class="offline-card">
      <h1 class="offline-title">{{ t('offline.title') }}</h1>
      <p class="offline-desc">{{ t('offline.desc') }}</p>
      <p v-if="detail" class="offline-detail">{{ detail }}</p>
      <p class="offline-hint">{{ t('offline.hint') }}</p>
      <button type="button" class="offline-retry" @click="retry">{{ t('offline.retry') }}</button>
    </div>
  </div>
</template>

<style scoped>
/* 全 token（DESIGN.md §2/§4/§5/§8）：圆角 16（大卡）·按钮 8·间距 4 倍数 */
.offline {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--bg);
  color: var(--text-primary);
}

.offline-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 440px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
  box-sizing: border-box;
}

.offline-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.3;
}

.offline-desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.6;
}

.offline-detail {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.offline-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.offline-retry {
  align-self: flex-start;
  min-height: 36px;
  padding: 8px 16px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 13px;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.offline-retry:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.offline-retry:active {
  filter: brightness(0.95);
}

.offline-retry:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
</style>
