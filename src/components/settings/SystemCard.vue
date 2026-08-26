<script setup lang="ts">
// 系统信息模块：连接状态与版本。
import { useI18n } from 'vue-i18n'
import { detectRuntime } from '../../bridge'
import { useSettingsStore } from '../../stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()
const runtime = detectRuntime()
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.system') }}</h2>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.connection') }}</span>
      <span class="conn-state">
        <span class="status-dot" :class="settings.connection" />
        {{ t('status.' + settings.connection) }}
      </span>
    </div>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.version') }}</span>
      <span class="muted-value">0.1.0 · {{ runtime }}</span>
    </div>
  </div>
</template>
