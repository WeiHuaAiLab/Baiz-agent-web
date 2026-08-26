<script setup lang="ts">
// 记忆模块：开关、作用范围、自动蒸馏、清空与已存事实列表。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { db } from '../../db'
import { useSettingsStore } from '../../stores/settings'
import { useMemoryStore } from '../../stores/memory'
import type { MemoryScope } from '../../stores/settings'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const settings = useSettingsStore()
const memory = useMemoryStore()
const memoryMsg = ref('')

async function clearMemory() {
  if (!window.confirm(t('settings.clearMemoryConfirm'))) return
  await db.messages.clear()
  memoryMsg.value = t('settings.memoryCleared')
  setTimeout(() => {
    memoryMsg.value = ''
  }, 1800)
}
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.memory') }}</h2>
    <p class="section-desc">{{ t('settings.memoryHint') }}</p>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.memoryEnabled') }}</span>
      <div class="seg">
        <button
          type="button"
          :class="{ active: settings.memoryEnabled }"
          @click="settings.setMemoryEnabled(true)"
        >
          {{ t('common.on') }}
        </button>
        <button
          type="button"
          :class="{ active: !settings.memoryEnabled }"
          @click="settings.setMemoryEnabled(false)"
        >
          {{ t('common.off') }}
        </button>
      </div>
    </div>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.memoryScope') }}</span>
      <select
        :value="settings.memoryScope"
        @change="
          settings.setMemoryScope(($event.target as HTMLSelectElement).value as MemoryScope)
        "
      >
        <option value="session">{{ t('settings.memoryScopeSession') }}</option>
        <option value="recent">{{ t('settings.memoryScopeRecent') }}</option>
        <option value="all">{{ t('settings.memoryScopeAll') }}</option>
      </select>
    </div>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.autoDistill') }}</span>
      <div class="seg">
        <button
          type="button"
          :class="{ active: settings.autoDistill }"
          @click="settings.setAutoDistill(true)"
        >
          {{ t('common.on') }}
        </button>
        <button
          type="button"
          :class="{ active: !settings.autoDistill }"
          @click="settings.setAutoDistill(false)"
        >
          {{ t('common.off') }}
        </button>
      </div>
    </div>
    <button type="button" class="btn-ghost danger" @click="clearMemory">
      {{ t('settings.clearMemory') }}
    </button>
    <span v-if="memoryMsg" class="memory-msg">{{ memoryMsg }}</span>
    <div class="memory-facts">
      <div class="memory-facts-head">
        <span>{{ t('settings.memoryFacts') }}</span>
        <span class="memory-count">{{ memory.facts.length }}</span>
      </div>
      <ul v-if="memory.facts.length" class="memory-fact-list">
        <li v-for="fact in memory.facts" :key="fact.id">
          <div class="fact-main">
            <span class="fact-text">{{ fact.text }}</span>
            <span class="fact-source">{{ fact.source }}</span>
          </div>
          <button
            type="button"
            class="fact-del"
            :title="t('common.delete')"
            @click="memory.removeFact(fact.id)"
          >
            <Icon name="x" :size="13" />
          </button>
        </li>
      </ul>
      <p v-else class="dir-empty">{{ t('settings.memoryFactsEmpty') }}</p>
    </div>
  </div>
</template>
