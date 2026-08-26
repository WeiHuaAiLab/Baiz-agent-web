<script setup lang="ts">
// 演示数据模块：重置本地数据库与 baiz.* 存储并刷新。
import { useI18n } from 'vue-i18n'
import { db } from '../../db'

const { t } = useI18n()

async function resetDemo() {
  if (!window.confirm(t('settings.resetConfirm'))) return
  await db.delete()
  const keys = Object.keys(localStorage).filter((key) => key.startsWith('baiz.'))
  keys.forEach((key) => localStorage.removeItem(key))
  location.reload()
}
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.demo') }}</h2>
    <p class="section-desc">{{ t('settings.demoHint') }}</p>
    <button type="button" class="btn-ghost danger" @click="resetDemo">
      {{ t('settings.resetDemo') }}
    </button>
  </div>
</template>
