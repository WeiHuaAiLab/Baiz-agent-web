<script setup lang="ts">
// W2：模型服务三档 UI（免费默认／WeLinkOS／DeepSeek 原双名·不删不改）。
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../../stores/settings'
import type { ModelPref, ModelProvider } from '../../stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()

function setProvider(value: ModelProvider) {
  settings.setProvider(value)
}

function setModel(value: ModelPref) {
  settings.setModel(value)
}
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.model') }}</h2>
    <p class="section-desc">{{ t('settings.modelHint') }}</p>
    <div class="model-options">
      <label class="model-option" :class="{ active: settings.provider === 'free' }">
        <input type="radio" value="free" :checked="settings.provider === 'free'" @change="setProvider('free')" />
        <span class="model-name">{{ t('settings.modelFree') }}</span>
        <span v-if="settings.provider === 'free'" class="model-check">✓ {{ t('settings.modelConfigured') }}</span>
      </label>

      <label class="model-option" :class="{ active: settings.provider === 'welink' }">
        <input type="radio" value="welink" :checked="settings.provider === 'welink'" @change="setProvider('welink')" />
        <span class="model-name">WeLinkOS</span>
      </label>
      <div v-if="settings.provider === 'welink'" class="welink-fields">
        <label class="field">
          <span>{{ t('settings.weLinkBase') }}</span>
          <input v-model="settings.weLinkBase" type="text" />
        </label>
        <label class="field">
          <span>{{ t('settings.weLinkKey') }}</span>
          <input v-model="settings.weLinkKey" type="password" autocomplete="off" />
        </label>
        <label class="field">
          <span>{{ t('settings.weLinkModel') }}</span>
          <input v-model="settings.weLinkModel" type="text" />
        </label>
      </div>

      <label class="model-option" :class="{ active: settings.provider === 'deepseek' }">
        <input type="radio" value="deepseek" :checked="settings.provider === 'deepseek'" @change="setProvider('deepseek')" />
        <span class="model-name">DeepSeek</span>
      </label>
      <div v-if="settings.provider === 'deepseek'" class="model-options">
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
  </div>
</template>
