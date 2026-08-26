<script setup lang="ts">
// 外观模块：语言与主题切换。
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../../stores/settings'
import type { Locale, Theme } from '../../stores/settings'

const { t, locale } = useI18n()
const settings = useSettingsStore()

function setLocale(value: Locale) {
  locale.value = value
  settings.setLocale(value)
}

function setTheme(value: Theme) {
  settings.setTheme(value)
}
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.appearance') }}</h2>
    <p class="section-desc">{{ t('settings.appearanceHint') }}</p>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.language') }}</span>
      <div class="seg">
        <button
          type="button"
          :class="{ active: String(locale) === 'zh-CN' }"
          @click="setLocale('zh-CN')"
        >
          中文
        </button>
        <button
          type="button"
          :class="{ active: String(locale) === 'en-US' }"
          @click="setLocale('en-US')"
        >
          English
        </button>
      </div>
    </div>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.theme') }}</span>
      <div class="seg">
        <button
          type="button"
          :class="{ active: settings.theme === 'light' }"
          @click="setTheme('light')"
        >
          ☀ {{ t('settings.themeLight') }}
        </button>
        <button
          type="button"
          :class="{ active: settings.theme === 'dark' }"
          @click="setTheme('dark')"
        >
          ☾ {{ t('settings.themeDark') }}
        </button>
      </div>
    </div>
  </div>
</template>
