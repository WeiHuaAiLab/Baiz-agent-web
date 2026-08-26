<script setup lang="ts">
// 工作区目录模块：添加路径、系统选目录、激活/移除已授权目录。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../../stores/settings'
import { useFilesStore } from '../../stores/files'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const settings = useSettingsStore()
const files = useFilesStore()
const newWorkspace = ref('')

function addWorkspace() {
  settings.addWorkspace(newWorkspace.value)
  newWorkspace.value = ''
}

async function pickDir() {
  const picked = await files.authorizeDir()
  if (picked) settings.addWorkspace(picked.path)
}
</script>

<template>
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
</template>
