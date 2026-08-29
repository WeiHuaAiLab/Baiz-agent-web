<script setup lang="ts">
// 关于模块：品牌信息（slogan / 版本 / 运行环境）与系统状态（连接状态）。
// 原侧栏「关于我们」弹窗内容已并入此处。
import { useI18n } from 'vue-i18n'
import { detectRuntime } from '../../bridge'
import { useSettingsStore } from '../../stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()
const runtime = detectRuntime()
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.about') }}</h2>
    <p class="section-desc">{{ t('settings.slogan') }}</p>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.version') }}</span>
      <span class="about-version">v0.1.0 · {{ runtime }}</span>
    </div>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.connection') }}</span>
      <span class="conn-state">
        <span class="status-dot" :class="settings.connection" />
        {{ t('status.' + settings.connection) }}
      </span>
    </div>
  </div>
</template>
