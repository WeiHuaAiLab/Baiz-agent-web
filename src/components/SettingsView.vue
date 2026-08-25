<script setup lang="ts">
// 设置页：语言/主题/模型切换、API Key 配置、工作区管理、记忆（memory）管理与数据导出。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { detectRuntime } from '../bridge'
import { getClient } from '../client/singleton'
import { db } from '../db'
import { useSettingsStore } from '../stores/settings'
import { useMemoryStore } from '../stores/memory'
import { useFilesStore } from '../stores/files'
import type { Locale, MemoryScope, ModelPref, Theme } from '../stores/settings'
import Icon from './common/Icon.vue'

const { t, locale } = useI18n()
const router = useRouter()
const settings = useSettingsStore()
const memory = useMemoryStore()
const files = useFilesStore()
const keyInput = ref('')
const newWorkspace = ref('')
const keyMsg = ref('')
const memoryMsg = ref('')
const runtime = detectRuntime()

function setLocale(value: Locale) {
  locale.value = value
  settings.setLocale(value)
}

function setTheme(value: Theme) {
  settings.setTheme(value)
}

function setModel(value: ModelPref) {
  settings.setModel(value)
}

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

function addWorkspace() {
  settings.addWorkspace(newWorkspace.value)
  newWorkspace.value = ''
}

async function pickDir() {
  const picked = await files.authorizeDir()
  if (picked) settings.addWorkspace(picked.path)
}

async function resetDemo() {
  if (!window.confirm(t('settings.resetConfirm'))) return
  await db.delete()
  const keys = Object.keys(localStorage).filter((key) => key.startsWith('baiz.'))
  keys.forEach((key) => localStorage.removeItem(key))
  location.reload()
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
  <section class="settings-view">
    <header class="settings-header">
      <button type="button" class="back-btn" @click="router.back()">← {{ t('common.back') }}</button>
      <h1>{{ t('settings.title') }}</h1>
    </header>

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

    <div class="settings-card">
      <h2>{{ t('settings.workspaceDir') }}</h2>
      <p class="section-desc">{{ t('settings.dirHint') }}</p>
      <div class="key-row">
        <input
          v-model="newWorkspace"
          :placeholder="t('settings.dirPlaceholder')"
          @keyup.enter="addWorkspace"
        />
        <button
          type="button"
          class="btn-primary"
          :disabled="!newWorkspace.trim()"
          @click="addWorkspace"
        >
          {{ t('settings.add') }}
        </button>
        <button type="button" class="btn-ghost" @click="pickDir">
          {{ t('settings.pickDir') }}
        </button>
      </div>
      <ul v-if="settings.workspaces.length" class="dir-list">
        <li v-for="path in settings.workspaces" :key="path">
          <label class="dir-label">
            <input
              type="radio"
              name="workspace"
              :checked="settings.activeWorkspace === path"
              @change="settings.setActiveWorkspace(path)"
            />
            <span>{{ path }}</span>
          </label>
          <button
            type="button"
            class="dir-remove"
            :title="t('common.delete')"
            @click="settings.removeWorkspace(path)"
          >
            <Icon name="x" :size="14" />
          </button>
        </li>
      </ul>
      <p v-else class="dir-empty">{{ t('workspace.empty') }}</p>
    </div>

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

    <div class="settings-card">
      <h2>{{ t('settings.demo') }}</h2>
      <p class="section-desc">{{ t('settings.demoHint') }}</p>
      <button type="button" class="btn-ghost danger" @click="resetDemo">
        {{ t('settings.resetDemo') }}
      </button>
    </div>
  </section>
</template>
