<script setup lang="ts">
// API Key 模块：保存/清除密钥并回显状态。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getClient } from '../../client/singleton'
import { useSettingsStore } from '../../stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()
const keyInput = ref('')
const keyMsg = ref('')

async function saveKey() {
  const key = keyInput.value.trim()
  if (!key) return
  try {
    await getClient().provideKey(key)
    settings.setKeyConfigured(true)
    keyInput.value = ''
    keyMsg.value = `✓ ${t('settings.keySaved')}`
  } catch (error) {
    keyMsg.value = `${t('settings.keyError')} ${(error as Error).message}`
  }
}

function clearKey() {
  settings.setKeyConfigured(false)
  keyMsg.value = ''
}
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.apiKey') }}</h2>
    <p class="section-desc">{{ t('settings.keyHint') }}</p>
    <div class="key-row">
      <input
        v-model="keyInput"
        type="password"
        :placeholder="t('settings.keyPlaceholder')"
        @keyup.enter="saveKey"
      />
      <button type="button" class="btn-primary" :disabled="!keyInput.trim()" @click="saveKey">
        {{ t('settings.save') }}
      </button>
      <button v-if="settings.keyConfigured" type="button" class="btn-ghost" @click="clearKey">
        {{ t('settings.clear') }}
      </button>
    </div>
    <p class="key-state" :class="{ ok: settings.keyConfigured }">
      {{ settings.keyConfigured ? `✓ ${t('settings.keyConfigured')}` : t('settings.keyNotConfigured') }}
      <span v-if="keyMsg" class="key-msg">{{ keyMsg }}</span>
    </p>
  </div>
</template>
