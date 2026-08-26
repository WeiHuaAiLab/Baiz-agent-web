<script setup lang="ts">
// 模型选择模块：云/本地模型切换。
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
        :class="{ active: settings.model === 'deepseek' }"
        @click="setModel('deepseek')"
      >
        <span class="model-name">DeepSeek 满血</span>
        <span class="model-tag">{{ t('settings.modelCloud') }}</span>
      </button>
      <button
        type="button"
        class="model-option"
        :class="{ active: settings.model === 'qwen' }"
        @click="setModel('qwen')"
      >
        <span class="model-name">Qwen 3.8-27B</span>
        <span class="model-tag">{{ t('settings.modelLocal') }}</span>
      </button>
    </div>
  </div>
</template>
