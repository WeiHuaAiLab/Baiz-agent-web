<script setup lang="ts">
// 关于模块：品牌信息（slogan / 版本 / 运行环境）与系统状态（连接状态）。
// 原侧栏「关于我们」弹窗内容已并入此处。
import { useI18n } from 'vue-i18n'
import { detectRuntime, detectVersion } from '../../bridge'
import { useSettingsStore } from '../../stores/settings'
import { onMounted, ref } from 'vue'

const { t } = useI18n()
const settings = useSettingsStore()
const runtime = detectRuntime()
// MSG-2805 DEBT-569：版本显动态化——tauri 径 getVersion（壳 conf 同源）；
// null（web 径/桥未通）→ 诚实文案勿假值（勿 v0.1.0 硬编漂移）
const version = ref<string | null>(null)
onMounted(async () => {
  version.value = await detectVersion()
})
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.about') }}</h2>
    <p class="section-desc">{{ t('settings.slogan') }}</p>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.version') }}</span>
      <span v-if="version" class="about-version">v{{ version }} · {{ runtime }}</span>
      <span v-else class="about-version">{{ runtime === 'tauri' ? '版本未取到 · tauri' : '本地预览' }}</span>
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
