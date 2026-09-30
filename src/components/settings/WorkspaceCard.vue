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

/**
 * **DEBT-883 甲案**：**找回旧工作区**——切过账号后，旧账号的分段目录
 * （如 `…/baiz-workspace/users/<旧段>`）不在新根之下，会表现为"没权限"。
 * 本入口**复用既有能力**（`files.authorizeDir()`＝桥 `fs.pickDir` 系统目录选择器）
 * 让用户**浏览并选中**该旧目录 ⇒ 重新入授权根即可继续使用。
 * **零新增后端接口**；**不改 fail-closed 隔离语义**（互不可见依旧，只有显式授权才可见）。
 */
async function recoverLegacy() {
  const picked = await files.authorizeDir()
  if (picked) settings.addWorkspace(picked.path)
}
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.workspaceDir') }}</h2>
    <p class="section-desc">{{ t('settings.dirHint') }}</p>
    <!-- **DEBT-883 甲案**：工作区**按账号隔离**——明写（daemon 侧
         `crates/daemon/src/sse/workspace_config.rs:93`
         `base.join("users").join(account_segment(account_id))`；未登录落 `users/__anon__`，
         头注 `:70-77` 写明 **fail-closed·互不可见·不回落**）。
         换账号 ⇒ 有效根变 ⇒ 旧目录**表现为"没权限"**；此处**只说清**，**不动隔离语义**。 -->
    <p class="section-desc workspace-isolation">{{ t('settings.workspaceIsolation') }}</p>
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

    <!-- **DEBT-883 甲案**：**找回旧工作区**入口——**复用既有** `files.authorizeDir()`
         （桥 `fs.pickDir` 系统目录选择器），**零新增后端接口**；选中即入授权根。
         ⚠ **不改隔离语义**：旧段目录仍与登录账号互不可见，**只有显式授权才可见**。 -->
    <div class="workspace-legacy">
      <p class="section-desc">{{ t('settings.workspaceLegacyHint') }}</p>
      <button type="button" class="btn-ghost workspace-legacy-entry" @click="recoverLegacy">
        {{ t('settings.workspaceLegacyEntry') }}
      </button>
    </div>
  </div>
</template>
