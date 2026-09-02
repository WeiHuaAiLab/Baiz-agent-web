<script setup lang="ts">
// 模型选择模块：deepseek 系双模型偏好（MSG-2358 枚举换正——qwen 假面下架）。
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../../stores/settings'
import type { ModelPref } from '../../stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()

function setModel(value: ModelPref) {
  settings.setModel(value)
}
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.model') }}</h2>
    <p class="section-desc">{{ t('settings.modelHint') }}</p>
    <div class="model-options">
      <button
        type="button"
        class="model-option"
        :class="{ active: settings.model === 'deepseek-v4-pro' }"
        @click="setModel('deepseek-v4-pro')"
      >
        <span class="model-name">DeepSeek V4 Pro</span>
      </button>
      <button
        type="button"
        class="model-option"
        :class="{ active: settings.model === 'deepseek-v4-flash' }"
        @click="setModel('deepseek-v4-flash')"
      >
        <span class="model-name">DeepSeek V4 Flash</span>
      </button>
    </div>
  </div>
</template>
