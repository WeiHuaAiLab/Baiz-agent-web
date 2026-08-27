<script setup lang="ts">
// 聊天输入区：底部输入框（附件/语音/发送/停止）与定时任务创建的覆盖流程，
// 并承载输入草稿保存/恢复与 pendingPrompt（新手引导一键试玩）处理。
// 发送成功后 emit('submitted')，由外层驱动内容体回到底部。
// 注：新会话/普通任务的居中创建引导已抽离到 CreateChat.vue。
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
let draftTimer: ReturnType<typeof setTimeout> | null = null

const activeId = computed(() => session.activeId)
const streamingRuns = computed(() => messages.activeRuns(activeId.value))
const runningRun = computed(() => streamingRuns.value[0] ?? null)

// 进入定时任务创建模式时重置表单
watch(
  () => ui.createMode,
  (mode) => {
    if (mode === 'scheduled') {
      taskDraft.value = createEmptyTaskDraft()
    }
  },
)

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

  <div class="chat-input">
    <ComposerBox
      v-model="input"
      :placeholder="t('chat.placeholder')"
      :running="!!runningRun"
      @submit="send"
      @stop="stopCurrent"
    />
  </div>
</template>
