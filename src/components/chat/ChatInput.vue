<script setup lang="ts">
// 聊天输入区：两段式结构——输入区（textarea 默认 98px、超出 300px 滚动）+
// 操作功能区（左侧「+」项目选择器 / 语音 / 发送）。并承载输入草稿保存/恢复、pendingPrompt 处理，
// 以及定时任务创建的覆盖流程。发送成功后 emit('submitted')，由外层驱动内容体回到底部。
// 项目关联：点「+」展开项目菜单——上方为「已有项目列表」（含 ✓ 选中态），分隔线后是「新建项目」与「不选择项目」。
// 选中即实时写入当前会话 projectId。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/session'
import { useMessageStore } from '../../stores/message'
import { useSettingsStore } from '../../stores/settings'
import { useWorkspaceStore, createEmptyTaskDraft } from '../../stores/workspace'
import type { TaskDraft } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import { useFilesStore } from '../../stores/files'
import { clearDraft, loadDraft, saveDraft } from '../../drafts'
import Icon from '../common/Icon.vue'
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

// 项目关联：选中的项目 id（空 = 不关联）；「+」打开的项目菜单
const pickedProjectId = ref('')
const pickerOpen = ref(false)
const pickerRef = ref<HTMLElement>()
const voiceHint = ref(false)
const selectedProject = computed(() => workspace.projectById(pickedProjectId.value))

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

// 会话切换：保存旧会话草稿、恢复新会话草稿，并同步该会话的项目关联
watch(
  activeId,
  async (id, oldId) => {
    if (oldId) void saveDraft(oldId, input.value)
    if (id) input.value = await loadDraft(id)
    pickedProjectId.value = session.active?.projectId ?? ''
  },
  { immediate: true },
)

// 项目选择实时写入当前会话（setProject 内部判重，避免无谓写库）
watch(pickedProjectId, (id) => {
  const cid = activeId.value
  if (cid) void session.setProject(cid, id || undefined)
})

// 输入防抖保存草稿
watch(input, () => {
  if (draftTimer) clearTimeout(draftTimer)
  const id = activeId.value
  const text = input.value
  draftTimer = setTimeout(() => {
    if (id) void saveDraft(id, text)
  }, 300)
})

onMounted(() => {
  document.addEventListener('click', onDocClick)
  // 消费「新建项目」回跳的待选项目（CreateProject 创建成功后 backToChat 触发本组件重挂载）
  if (ui.pendingProjectId) {
    pickedProjectId.value = ui.pendingProjectId
    ui.pendingProjectId = ''
  }
})

onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer)
  if (activeId.value) void saveDraft(activeId.value, input.value)
  document.removeEventListener('click', onDocClick)
})

// 点击「+」外部时收起项目菜单
function onDocClick(event: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    pickerOpen.value = false
  }
}

/** 切换项目菜单面板 */
function togglePicker() {
  pickerOpen.value = !pickerOpen.value
}

/** 语音按钮：暂时展示"即将上线"提示 */
function toggleVoice() {
  voiceHint.value = true
  setTimeout(() => {
    voiceHint.value = false
  }, 1800)
}

/** 「不选择项目」：清空关联并收起面板 */
function clearPick() {
  pickedProjectId.value = ''
  pickerOpen.value = false
}

/** 「选择项目」：从已有项目中选中并收起面板 */
function pickProject(id: string) {
  pickedProjectId.value = id
  pickerOpen.value = false
}

/** 「新建项目」：保存回归上下文（mode='' 表示来自聊天输入框）后切换到 CreateProject */
function startCreateProject() {
  ui.createReturn = { mode: '', input: input.value }
  pickerOpen.value = false
  ui.openCreate('project')
}

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
    <form class="composer composer-block" @submit.prevent="send">
      <!-- 输入区：固定 98px，超出 300px 滚动 -->
      <div class="composer-input">
        <textarea
          v-model="input"
          class="input-area"
          :placeholder="t('chat.placeholder')"
          @keydown.enter.exact.prevent="send"
        />
      </div>

      <!-- 操作功能区：+（项目菜单）/ 语音 / 发送 -->
      <div class="composer-actions">
        <div ref="pickerRef" class="composer-picker-wrap">
          <button
            type="button"
            class="act-btn"
            :class="{ active: !!selectedProject }"
            :title="t('chat.linkProject')"
            @click="togglePicker"
          >
            <Icon :name="selectedProject ? 'workspace' : 'plus'" :size="16" />
            <span v-if="selectedProject" class="act-project">{{ selectedProject.title }}</span>
          </button>

          <!-- 项目菜单面板：从操作区向上弹出。
               风格参考百度搭子/豆包/Kimi 底部功能菜单——
               顶部小标题 + 可滚动项目列表（含 ✓ 选中态）+ 分隔线 + 底部操作项。 -->
          <div v-if="pickerOpen" class="composer-picker">
            <!-- 标题行 -->
            <div class="picker-header">
              <Icon name="workspace" :size="14" />
              <span>{{ t('chat.projectChoose') }}</span>
            </div>

            <!-- 已有项目列表（可滚动；选中态右侧 ✓） -->
            <ul class="picker-list">
              <li
                v-for="project in workspace.projects"
                :key="project.id"
                class="picker-item"
                :class="{ active: project.id === pickedProjectId }"
                @click="pickProject(project.id)"
              >
                <span class="picker-item-icon">
                  <Icon name="workspace" :size="15" />
                </span>
                <span class="picker-item-title">{{ project.title }}</span>
                <Icon v-if="project.id === pickedProjectId" name="check" :size="15" />
              </li>
              <li v-if="!workspace.projects.length" class="picker-empty-li">
                {{ t('chat.pickEmpty') }}
              </li>
            </ul>

            <!-- 分隔线 -->
            <div class="picker-divider" />

            <!-- 底部操作项：「新建项目」+「不选择项目」 -->
            <ul class="picker-list picker-list--bottom">
              <li class="picker-item" @click="startCreateProject">
                <span class="picker-item-icon">
                  <Icon name="plus" :size="15" />
                </span>
                <span class="picker-item-title">{{ t('chat.projectNew') }}</span>
              </li>
              <li
                class="picker-item"
                :class="{ active: !pickedProjectId }"
                @click="clearPick"
              >
                <span class="picker-item-icon">
                  <Icon name="circle-slash" :size="15" />
                </span>
                <span class="picker-item-title">{{ t('chat.projectNone') }}</span>
                <Icon v-if="!pickedProjectId" name="check" :size="15" />
              </li>
            </ul>
          </div>
        </div>

        <span class="actions-spacer" />

        <button type="button" class="act-btn" :title="t('chat.voiceInput')" @click="toggleVoice">
          <Icon name="mic" :size="16" />
        </button>

        <button
          v-if="runningRun"
          type="button"
          class="send-btn stop"
          :title="t('chat.stop')"
          @click="stopCurrent"
        >
          <Icon name="stop" :size="15" />
        </button>
        <button
          v-else
          type="submit"
          class="send-btn"
          :disabled="!input.trim()"
          :title="t('chat.send')"
        >
          <Icon name="send" :size="16" />
        </button>
      </div>

      <span v-if="voiceHint" class="voice-hint">{{ t('chat.voiceComing') }}</span>
    </form>
  </div>
</template>
