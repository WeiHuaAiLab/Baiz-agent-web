<script setup lang="ts">
// 创建项目：居中的项目创建表单（项目名 + 位置选择），与 CreateChat 平级。
// 由 ChatView 在 ui.createMode === 'project' 时渲染；创建成功后关闭并回到聊天视图。
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import { useSettingsStore } from '../../stores/settings'
import { useFilesStore } from '../../stores/files'
import { useUiStore } from '../../stores/ui'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const settings = useSettingsStore()
const files = useFilesStore()
const ui = useUiStore()

const name = ref('')
const drives = ref<string[]>([])
const selectedDrive = ref('')
const projectDir = ref('')

// 进入创建项目视图时加载盘符列表（无盘符形态降级为"选择父目录"）
onMounted(() => {
  void loadDrives()
})

async function loadDrives() {
  drives.value = await files.listDrives()
  if (drives.value.length && !drives.value.includes(selectedDrive.value)) {
    selectedDrive.value = drives.value[0]
  }
}

async function pickParentDir() {
  const picked = await files.authorizeDir()
  if (picked) {
    selectedDrive.value = picked.path
    ui.toast(`${t('tasks.parentPicked')} ${picked.path}`, 'info')
  }
}

async function createProjectDir() {
  const folder = name.value.trim()
  if (!folder) {
    ui.toast(t('tasks.needFolderName'), 'error')
    return
  }
  if (!selectedDrive.value) {
    ui.toast(t('tasks.needDrive'), 'error')
    return
  }
  const created = await files.createDir(selectedDrive.value, folder)
  if (!created) return
  projectDir.value = created
  files.bindDir(created, name.value.trim())
  settings.addWorkspace(created)
  settings.setActiveWorkspace(created)
  ui.toast(`${t('tasks.projectDirCreated')} ${created}`, 'success')
}

/** 创建完成：若来自新建会话/任务（createReturn），回跳原创建视图并让 CreateChat 自动选中新项目；否则直接关闭 */
function finish() {
  if (ui.createReturn) {
    ui.pendingProjectId = workspace.projects[0]?.id ?? ''
    ui.openCreate(ui.createReturn.mode)
  } else {
    ui.closeCreate()
  }
}

function submit() {
  const title = name.value.trim()
  if (!title) {
    ui.toast(t('tasks.needFolderName'), 'error')
    return
  }
  workspace.addProject(title)
  ui.toast(`${t('chat.projectCreated')}：${title}`, 'success')
  finish()
}

/** 取消：有回归上下文则回到原创建视图（CreateChat 恢复输入、不选中项目），否则直接关闭 */
function cancel() {
  if (ui.createReturn) {
    ui.openCreate(ui.createReturn.mode)
  } else {
    ui.closeCreate()
  }
}
</script>

<template>
  <div class="create-center">
    <p class="center-hint">{{ t('chat.createProjectTitle') }}</p>
    <div class="project-form">
      <input
        v-model="name"
        class="project-name-input"
        :placeholder="t('chat.projectNamePlaceholder')"
        @keyup.enter="submit"
      />
      <div class="location-picker">
        <div class="location-row">
          <select v-if="drives.length" v-model="selectedDrive" class="drive-select">
            <option v-for="drive in drives" :key="drive" :value="drive">{{ drive }}</option>
          </select>
          <template v-else>
            <button type="button" class="btn-ghost" @click="pickParentDir">
              {{ t('tasks.pickParent') }}
            </button>
            <span class="parent-path">{{ selectedDrive || t('tasks.driveEmpty') }}</span>
          </template>
        </div>
        <div class="location-row">
          <button type="button" class="btn-ghost" @click="createProjectDir">
            {{ t('tasks.createProjectDir') }}
          </button>
          <span class="parent-path">{{ projectDir || t('tasks.needProjectDir') }}</span>
        </div>
      </div>
      <div class="create-actions">
        <button type="button" class="btn-ghost" @click="cancel">
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!name.trim()"
          @click="submit"
        >
          {{ t('chat.projectCreate') }}
        </button>
      </div>
    </div>
  </div>
</template>
