<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../stores/session'
import { useMessageStore } from '../stores/message'
import { useSettingsStore } from '../stores/settings'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import { useFilesStore } from '../stores/files'
import MessageItem from './chat/MessageItem.vue'
import ComposerBox from './chat/ComposerBox.vue'
import MarkdownView from './markdown/MarkdownView.vue'
import StreamingMarkdownView from './markdown/StreamingMarkdownView.vue'
import Icon from './common/Icon.vue'
import TaskForm from './common/TaskForm.vue'
import type { ChatMessage } from '../models'
import { createEmptyTaskDraft } from '../stores/workspace'
import type { TaskDraft } from '../stores/workspace'
import { clearDraft, loadDraft, saveDraft } from '../drafts'
import { downloadText, exportConversation } from '../utils/export'
import { getBridge } from '../bridge'
import type { RunState } from '../models'

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
const exportOpen = ref(false)
const scroller = ref<InstanceType<typeof DynamicScroller>>()
const pinned = ref(true)
let draftTimer: ReturnType<typeof setTimeout> | null = null

const activeId = computed(() => session.activeId)
const displayItems = computed<ChatMessage[]>(() => [...messages.list(activeId.value)])
const streamingRuns = computed(() => messages.activeRuns(activeId.value))
const runningRun = computed(() => streamingRuns.value[0] ?? null)

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

watch(activeId, async (id, oldId) => {
  if (oldId) void saveDraft(oldId, input.value)
  if (id) {
    void messages.load(id)
    input.value = await loadDraft(id)
  }
}, { immediate: true })

watch(input, () => {
  if (draftTimer) clearTimeout(draftTimer)
  const id = activeId.value
  const text = input.value
  draftTimer = setTimeout(() => {
    if (id) void saveDraft(id, text)
  }, 300)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (draftTimer) clearTimeout(draftTimer)
  if (activeId.value) void saveDraft(activeId.value, input.value)
})

function onScroll(event: Event) {
  const el = event.target as HTMLElement
  pinned.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 120
}

watch(
  () =>
    displayItems.value.length +
    (displayItems.value.at(-1)?.text ?? '').length +
    streamingRuns.value.reduce((sum, run) => sum + run.text.length, 0),
  async () => {
    if (!pinned.value) return
    await nextTick()
    scroller.value?.scrollToItem(Math.max(0, displayItems.value.length - 1))
  },
)

function send() {
  sendWith(input.value)
}

function sendWith(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  pinned.value = true
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
}

function scrollToBottom() {
  pinned.value = true
  void nextTick(() => {
    scroller.value?.scrollToItem(Math.max(0, displayItems.value.length - 1))
  })
}

function onKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && key === 'k') {
    event.preventDefault()
    if (ui.paletteOpen) ui.closePalette()
    else ui.openPalette()
  } else if ((event.ctrlKey || event.metaKey) && key === 'n') {
    event.preventDefault()
    ui.openCreate('session')
  } else if (event.key === 'Escape' && ui.createMode) {
    ui.closeCreate()
  }
}

function doExport(format: 'md' | 'json') {
  const conversation = session.active
  if (!conversation) return
  const { filename, content } = exportConversation(
    conversation,
    messages.list(activeId.value),
    format,
  )
  downloadText(filename, content)
  exportOpen.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

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

function stopCurrent() {
  if (runningRun.value) messages.stopRun(runningRun.value.taskId)
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

function activityText(run: RunState): string {
  const last = run.trace[run.trace.length - 1]
  if (last?.kind === 'tool.call') {
    return `${t('chat.activityTool')} ${last.toolName ?? ''}…`
  }
  if (last?.kind === 'tool.result') {
    return `${t('chat.activityToolDone')} ${last.toolName ?? ''}`
  }
  if (run.reasoning) return t('chat.activityThinking')
  return t('chat.activityGenerating')
}

// 捎修一宗（MSG-1434，偏离②在册）：流式期链接/复制按钮点击面——
// streaming-tail 容器事件委托，逻辑与现盘 MarkdownView.onClick 同源
// （done 后 MarkdownView 自带处理恢复；此处只补流式期间交互面）。
async function onStreamingClick(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a')
  if (anchor) {
    const href = anchor.getAttribute('href')
    if (href) {
      event.preventDefault()
      await getBridge().openExternal(href)
    }
    return
  }
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('.code-copy')
  if (!target) return
  const code = decodeURIComponent(target.dataset.code ?? '')
  try {
    await getBridge().clipboard.writeText(code)
    const original = target.textContent
    target.textContent = '已复制'
    setTimeout(() => {
      target.textContent = original
    }, 1200)
  } catch {
    /* clipboard unavailable */
  }
}
</script>

<template>
  <section class="chat-view">
    <div
      v-if="
        !settings.demoMode &&
        (settings.connection === 'reconnecting' || settings.connection === 'connecting')
      "
      class="reconnect-banner"
    >
      {{ t('status.disconnectedReconnect') }}
    </div>
    <header class="chat-header">
      <div class="chat-title">
        <span class="conv-title">{{ session.active?.title ?? t('app.title') }}</span>
        <span class="model-chip">
          {{ settings.model === 'qwen' ? t('chat.modelLocal') : t('chat.modelCloud') }}
        </span>
        <span v-if="settings.demoMode" class="demo-chip">{{ t('chat.demoMode') }}</span>
        <span v-if="streamingRuns.length > 0" class="status">{{ t('status.connecting') }}</span>
        <span
          v-else-if="settings.connection === 'reconnecting' || settings.connection === 'connecting'"
          class="status"
        >
          {{ t('status.reconnecting') }}
        </span>
      </div>
      <div class="header-actions">
        <div class="export-wrap">
          <button
            type="button"
            class="icon-btn"
            :title="t('chat.export')"
            @click.stop="exportOpen = !exportOpen"
          >
            <Icon name="download" :size="15" />
          </button>
          <div v-if="exportOpen" class="export-menu">
            <button type="button" @click="doExport('md')">Markdown</button>
            <button type="button" @click="doExport('json')">JSON</button>
          </div>
        </div>
      </div>
    </header>

    <div v-if="exportOpen" class="menu-mask" @click="exportOpen = false" />

    <div v-if="displayItems.length === 0 && streamingRuns.length === 0" class="empty-state">
      <p class="empty">{{ t('chat.empty') }}</p>
      <button type="button" class="empty-start" @click="ui.openCreate('session')">
        {{ t('chat.emptyStart') }}
      </button>
    </div>
    <DynamicScroller
      v-if="displayItems.length > 0"
      ref="scroller"
      class="message-list"
      :items="displayItems"
      :min-item-size="64"
      @scroll.passive="onScroll"
    >
      <template #default="{ item, index, active }">
        <DynamicScrollerItem :item="item" :active="active" :data-index="index">
          <MessageItem :message="item" />
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>

    <div v-if="streamingRuns.length" class="streaming-tail" @click="onStreamingClick">
      <div v-for="run in streamingRuns" :key="run.taskId" class="msg assistant streaming-block">
        <div class="activity-line">
          <span class="activity-dot" />
          {{ activityText(run) }}
        </div>
        <StreamingMarkdownView :text="run.text" />
        <span class="caret" />
      </div>
    </div>

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
          <button type="button" class="btn-primary" :disabled="!taskDraft.title.trim()" @click="submitCreate">
            {{ t('chat.createConfirm') }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-else-if="ui.createMode === 'session' || ui.createMode === 'task'"
      class="create-center"
    >
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
      <div
        v-if="ui.createMode === 'task' && projectOption === 'new'"
        class="location-picker"
      >
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

    <ComposerBox
      v-else
      v-model="input"
      :placeholder="t('chat.placeholder')"
      :running="!!runningRun"
      @submit="send"
      @stop="stopCurrent"
    />
    <button
      v-if="!pinned && displayItems.length > 0"
      type="button"
      class="scroll-bottom"
      :title="t('chat.scrollToLatest')"
      @click="scrollToBottom"
    >
      ↓
    </button>
  </section>
</template>
