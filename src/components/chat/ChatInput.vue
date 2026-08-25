<script setup lang="ts">
// 聊天输入区：底部输入框（附件/语音/发送/停止）与创建会话/任务/定时任务的覆盖流程，
// 并承载输入草稿保存/恢复与 pendingPrompt（新手引导一键试玩）处理。
// 发送成功后 emit('submitted')，由外层驱动内容体回到底部。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/session'
import { useMessageStore } from '../../stores/message'
import { useSettingsStore } from '../../stores/settings'
import { useWorkspaceStore, createEmptyTaskDraft } from '../../stores/workspace'
import type { TaskDraft } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import { useFilesStore } from '../../stores/files'
import { clearDraft, loadDraft, saveDraft } from '../../drafts'
import ComposerBox from './ComposerBox.vue'
import TaskForm from '../common/TaskForm.vue'

const emit = defineEmits<{ (e: 'submitted'): void }>()

const { t } = useI18n()
const session = useSessionStore()
const messages = useMessageStore()
const settings = useSettingsStore()
const workspace = useWorkspaceStore()
const ui = useUiStore()
const files = useFilesStore()

const input = ref('')
const taskDraft = ref<TaskDraft>(createEmptyTaskDraft())
const projectOption = ref<'new' | 'folder' | 'none'>('none')
const chosenDir = ref('')
const drives = ref<string[]>([])
const selectedDrive = ref('')
const newProjectName = ref('')
const newProjectDir = ref('')
let draftTimer: ReturnType<typeof setTimeout> | null = null

const activeId = computed(() => session.activeId)
const streamingRuns = computed(() => messages.activeRuns(activeId.value))
const runningRun = computed(() => streamingRuns.value[0] ?? null)

// 进入创建模式时重置对应表单
watch(
  () => ui.createMode,
  (mode) => {
    if (mode === 'task') {
      projectOption.value = 'none'
      chosenDir.value = ''
      newProjectDir.value = ''
      newProjectName.value = ''
    } else if (mode === 'session') {
      projectOption.value = 'none'
      chosenDir.value = ''
      newProjectDir.value = ''
      newProjectName.value = ''
    } else if (mode === 'scheduled') {
      taskDraft.value = createEmptyTaskDraft()
    }
  },
)

watch(projectOption, (option) => {
  if (option === 'new') {
    newProjectDir.value = ''
    newProjectName.value = ''
    void loadDrives()
  }
})

// 会话切换：保存旧会话草稿、恢复新会话草稿
watch(
  activeId,
  async (id, oldId) => {
    if (oldId) void saveDraft(oldId, input.value)
    if (id) input.value = await loadDraft(id)
  },
  { immediate: true },
)

// 输入防抖保存草稿
watch(input, () => {
  if (draftTimer) clearTimeout(draftTimer)
  const id = activeId.value
  const text = input.value
  draftTimer = setTimeout(() => {
    if (id) void saveDraft(id, text)
  }, 300)
})

onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer)
  if (activeId.value) void saveDraft(activeId.value, input.value)
})

function send() {
  sendWith(input.value)
}

function sendWith(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  const attachments = [...files.attachments]
  void messages.sendUserMessage(
    activeId.value,
    trimmed,
    settings.activeWorkspace || undefined,
    attachments,
  )
  void files.clearAttachments()
  void session.touch(activeId.value)
  void clearDraft(activeId.value)
  input.value = ''
  emit('submitted')
}

function stopCurrent() {
  if (runningRun.value) messages.stopRun(runningRun.value.taskId)
}

async function submitCreate() {
  if (!taskDraft.value.title.trim()) return
  workspace.addTask({ ...taskDraft.value })
  ui.closeCreate()
}

async function submitCreateFromComposer() {
  const text = input.value.trim()
  if (!text) return
  if (ui.createMode === 'session') {
    const id = await session.create(text)
    session.select(id)
    if (projectOption.value === 'new') workspace.addProject(text)
  } else if (ui.createMode === 'task') {
    if (projectOption.value === 'folder') {
      if (!chosenDir.value) {
        ui.toast(t('tasks.needFolder'), 'error')
        return
      }
      settings.addWorkspace(chosenDir.value)
      settings.setActiveWorkspace(chosenDir.value)
    } else if (projectOption.value === 'new' && !newProjectDir.value) {
      ui.toast(t('tasks.needProjectDir'), 'error')
      return
    }
    workspace.addPlainTask(text, '')
    if (projectOption.value === 'new') workspace.addProject(text)
  }
  input.value = ''
  ui.closeCreate()
}

async function selectFolder() {
  projectOption.value = 'folder'
  const picked = await files.authorizeDir()
  if (picked) {
    chosenDir.value = picked.path
    settings.addWorkspace(picked.path)
    settings.setActiveWorkspace(picked.path)
  } else if (!chosenDir.value) {
    projectOption.value = 'none'
  }
}

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

async function createBlankProject() {
  const name = newProjectName.value.trim()
  if (!name) {
    ui.toast(t('tasks.needFolderName'), 'error')
    return
  }
  if (!selectedDrive.value) {
    ui.toast(t('tasks.needDrive'), 'error')
    return
  }
  const created = await files.createDir(selectedDrive.value, name)
  if (!created) return
  newProjectDir.value = created
  files.bindDir(created, name)
  settings.addWorkspace(created)
  settings.setActiveWorkspace(created)
  ui.toast(`${t('tasks.projectDirCreated')} ${created}`, 'success')
}

// pendingPrompt（新手引导"试玩"等）：填入输入框并直接发送
watch(
  () => ui.pendingPrompt,
  (prompt) => {
    if (prompt) {
      input.value = prompt
      sendWith(prompt)
      ui.setPendingPrompt('')
    }
  },
)
</script>

<template>
  <div v-if="ui.createMode === 'scheduled'" class="create-overlay">
    <div class="create-card">
      <h3>
        {{ t('tasks.addScheduled') }}
      </h3>
      <TaskForm v-model="taskDraft" />
      <div class="create-actions">
        <button type="button" class="btn-ghost" @click="ui.closeCreate()">
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!taskDraft.title.trim()"
          @click="submitCreate"
        >
          {{ t('chat.createConfirm') }}
        </button>
      </div>
    </div>
  </div>

  <div v-else-if="ui.createMode === 'session' || ui.createMode === 'task'" class="create-center">
    <p class="center-hint">
      {{ ui.createMode === 'session' ? t('chat.projectChoose') : t('tasks.enterProjectWork') }}
    </p>
    <div class="option-tabs">
      <template v-if="ui.createMode === 'session'">
        <button
          type="button"
          :class="{ active: projectOption === 'new' }"
          @click="projectOption = 'new'"
        >
          {{ t('chat.projectNew') }}
        </button>
        <button
          type="button"
          :class="{ active: projectOption === 'none' }"
          @click="projectOption = 'none'"
        >
          {{ t('chat.projectNone') }}
        </button>
      </template>
      <template v-else>
        <button
          type="button"
          :class="{ active: projectOption === 'new' }"
          @click="projectOption = 'new'"
        >
          {{ t('tasks.workNewProject') }}
        </button>
        <button
          type="button"
          :class="{ active: projectOption === 'folder' }"
          @click="selectFolder"
        >
          {{ t('tasks.workUseFolder') }}
        </button>
        <button
          type="button"
          :class="{ active: projectOption === 'none' }"
          @click="projectOption = 'none'"
        >
          {{ t('tasks.workNoFolder') }}
        </button>
      </template>
    </div>
    <p v-if="ui.createMode === 'task' && projectOption === 'folder'" class="chosen-dir">
      {{ t('tasks.chosenFolder') }}：{{ chosenDir || t('tasks.needFolder') }}
    </p>
    <div v-if="ui.createMode === 'task' && projectOption === 'new'" class="location-picker">
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
        <input
          v-model="newProjectName"
          class="folder-name-input"
          :placeholder="t('tasks.newFolderName')"
          @keyup.enter="createBlankProject"
        />
        <button
          type="button"
          class="btn-primary"
          :disabled="!newProjectName.trim() || !selectedDrive || !files.createDirSupported"
          @click="createBlankProject"
        >
          {{ t('tasks.createProjectDir') }}
        </button>
      </div>
      <p v-if="newProjectDir" class="chosen-dir">
        {{ t('tasks.projectDirCreated') }}：{{ newProjectDir }}
      </p>
    </div>
    <ComposerBox
      v-model="input"
      :placeholder="
        ui.createMode === 'session'
          ? t('chat.createPlaceholderSession')
          : t('chat.createPlaceholderTask')
      "
      centered
      @submit="submitCreateFromComposer"
    />
    <div class="center-shadow" />
  </div>

  <div v-else class="chat-input">
    <ComposerBox
      v-model="input"
      :placeholder="t('chat.placeholder')"
      :running="!!runningRun"
      @submit="send"
      @stop="stopCurrent"
    />
  </div>
</template>
