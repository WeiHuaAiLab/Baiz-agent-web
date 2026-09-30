<script setup lang="ts">
// 记忆模块：开关、作用范围、自动蒸馏、清空与已存事实列表。
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { db } from '../../db'
import { useSettingsStore } from '../../stores/settings'
import { useMemoryStore } from '../../stores/memory'
import type { MemoryScope } from '../../stores/settings'
import type { MemoryFact } from '../../stores/memory'
import { formatRelativeTime } from '../../utils/time'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const settings = useSettingsStore()
const memory = useMemoryStore()
const memoryMsg = ref('')

/**
 * R2 波三（DEBT-876 · T8 记忆可解释性）：**"为何被记住"看得见**——
 * 每条现形「来源」（哪次会话／哪个文件）＋「记住于」（什么时候）。
 * 时间缺失（daemon 未给／解析失败 ⇒ 0）**明说"未标注"**，不显 1970 假时间。
 */
function factTime(fact: MemoryFact): string {
  return fact.createdAt > 0 ? formatRelativeTime(fact.createdAt) : t('settings.memoryFactTimeUnknown')
}

/**
 * 补席 B（KIMI 点名③）：**来源缺字段也不留白**——daemon 若没回 `source`（或回空串／null），
 * 改前直出 `{{ fact.source }}` ⇒ 屏上只剩"来源："两个光秃秃的字（看着像渲染坏了），
 * 甚至可能显 `undefined`。与 `factTime` **同口径**：缺失明说"未标注"。
 */
function factSource(fact: MemoryFact): string {
  return String(fact.source ?? '').trim() || t('settings.memoryFactSourceUnknown')
}

/** MSG-3503 A9：真机面拉 daemon 真记忆（只回本人）；演示态保种子（零 RPC）。 */
onMounted(() => {
  if (settings.demoMode) memory.seedDemo()
  else void memory.load()
})

function reload() {
  void memory.load()
}

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
      <p v-if="memory.loading" class="dir-empty">{{ t('settings.memoryLoading') }}</p>
      <p v-else-if="memory.notReady" class="dir-empty">{{ t('settings.memoryNotReady') }}</p>
      <p v-else-if="memory.failed" class="dir-empty">
        {{ t('settings.memoryLoadFailed') }}
        <template v-if="memory.error">：{{ memory.error }}</template>
        <button type="button" class="btn-ghost" @click="reload">
          {{ t('settings.memoryRetry') }}
        </button>
      </p>
      <ul v-else-if="memory.facts.length" class="memory-fact-list">
        <li v-for="fact in memory.facts" :key="fact.id">
          <!-- R2 波三（DEBT-876）：摘要＋**来源**＋**时间**三件齐——「记住了什么」与「为何记住」逐条现形 -->
          <div class="fact-main">
            <span class="fact-text">{{ fact.text }}</span>
            <span class="fact-source">{{ t('settings.memoryFactSource') }}{{ factSource(fact) }}</span>
            <span class="fact-time">{{ t('settings.memoryFactTime') }}{{ factTime(fact) }}</span>
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
      <p v-if="memory.note" class="dir-empty">{{ memory.note }}</p>
    </div>
  </div>
</template>
