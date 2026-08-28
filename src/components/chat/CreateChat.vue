<script setup lang="ts">
// 创建新会话 / 普通任务：居中引导视图（项目关联工具条：新建项目 / 选择项目(select 选中态) / 不选择项目 + 输入框）。
// 仅当 ui.createMode 为 session / task 时由 ChatView 渲染；创建完成后 ui.closeCreate() 切回会话视图。
// 「新建项目」直接切换到 CreateProject（createMode='project'），创建成功后经 ui.createReturn 回跳并自动选中新项目。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/session'
import { useMessageStore } from '../../stores/message'
import { useSettingsStore } from '../../stores/settings'
import { useWorkspaceStore } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import { useFilesStore } from '../../stores/files'
import ComposerBox from './ComposerBox.vue'
import Icon from '../common/Icon.vue'
import Logo from '../common/Logo.vue'

const { t } = useI18n()
const session = useSessionStore()
const messages = useMessageStore()
const settings = useSettingsStore()
const workspace = useWorkspaceStore()
const ui = useUiStore()
const files = useFilesStore()

const input = ref('')
// 项目关联：选中的项目 id（空 = 不关联）。互斥单选，选中后「选择项目」按钮显示项目名
const pickedProjectId = ref('')
const pickOpen = ref(false)
const pickerRef = ref<HTMLElement>()

// 当前选中的项目（来自下拉选择或创建项目后自动选用）
const selectedProject = computed(() => workspace.projectById(pickedProjectId.value))

/** 消费「待选中的项目」：来自 Sidebar 项目点击 或 CreateProject 创建成功后回跳 */
function consumePendingProject() {
  if (ui.pendingProjectId) {
    pickedProjectId.value = ui.pendingProjectId
    ui.pendingProjectId = ''
  }
}

// 重新挂载时消费「创建项目」的回归上下文：恢复输入内容；并兜底消费待选项目
onMounted(() => {
  const ret = ui.createReturn
  if (ret) {
    input.value = ret.input
    ui.createReturn = null
  }
  consumePendingProject()
})

// 每次进入创建模式（openCreate 都会递增 createEpoch，含「重复打开同一模式」如
// 新建会话页已打开时再点新建/点项目）都重置表单；若带待选项目则优先选中。
// 默认新建会话（Ctrl+N / 顶部按钮 / 空状态）不带待选项目 → 落到「不选择项目」。
watch(
  () => ui.createEpoch,
  () => {
    if (ui.createMode !== 'session' && ui.createMode !== 'task') return
    pickOpen.value = false
    if (ui.pendingProjectId) {
      pickedProjectId.value = ui.pendingProjectId
      ui.pendingProjectId = ''
    } else {
      pickedProjectId.value = ''
    }
  },
)

// 点击工具条外部时收起项目下拉
function onDocClick(event: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    pickOpen.value = false
  }
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

/** 「新建项目」：保存回归上下文后切换到 CreateProject（createMode='project'） */
function startCreateProject() {
  ui.createReturn = { mode: ui.createMode as 'session' | 'task', input: input.value }
  ui.openCreate('project')
}

/** 「选择项目」：打开/收起已有项目下拉 */
function togglePick() {
  pickOpen.value = !pickOpen.value
}

/** 从下拉中选中一个已有项目 */
function pickProject(id: string) {
  pickedProjectId.value = id
  pickOpen.value = false
}

/** 「不选择项目」：重置选择，回到未关联状态 */
function clearPick() {
  pickedProjectId.value = ''
  pickOpen.value = false
}

async function submitCreateFromComposer() {
  const text = input.value.trim()
  if (!text) return
  const projectId = pickedProjectId.value || undefined
  if (ui.createMode === 'session') {
    const id = await session.create(text, projectId)
    // 输入内容直接作为会话的第一条用户消息发送并触发 AI 回复，
    // 而不是只创建一个空会话。与 ChatInput.sendWith 保持同源逻辑（含附件/工作区）。
    const attachments = [...files.attachments]
    await messages.sendUserMessage(id, text, settings.activeWorkspace || undefined, attachments)
    void files.clearAttachments()
    void session.touch(id)
  } else if (ui.createMode === 'task') {
    workspace.addPlainTask(text, '', projectId)
  }
  input.value = ''
  ui.closeCreate()
}
</script>

<template>
  <div class="create-center">
    <div class="create-brand">
      <Logo size="lg" />
    </div>

    <div ref="pickerRef" class="create-toolbar">
      <div class="option-tabs">
        <button type="button" class="pick-btn" @click="startCreateProject">
          {{ t('chat.projectNew') }}
        </button>
        <button
          type="button"
          class="pick-btn"
          :class="{ active: !!selectedProject }"
          @click="togglePick"
        >
          <Icon name="workspace" :size="13" />
          <span class="pick-label">
            {{ selectedProject ? selectedProject.title : t('chat.projectChoose') }}
          </span>
          <Icon name="chevron" :size="12" :class="{ open: pickOpen }" />
        </button>
        <button
          type="button"
          class="pick-btn"
          :class="{ active: !selectedProject }"
          @click="clearPick"
        >
          {{ t('chat.projectNone') }}
        </button>
      </div>

      <div v-if="pickOpen" class="project-picker">
        <ul v-if="workspace.projects.length" class="picker-list">
          <li
            v-for="project in workspace.projects"
            :key="project.id"
            :class="{ active: project.id === pickedProjectId }"
            @click="pickProject(project.id)"
          >
            <Icon name="workspace" :size="14" />
            <span class="picker-title">{{ project.title }}</span>
            <Icon v-if="project.id === pickedProjectId" name="check" :size="14" />
          </li>
        </ul>
        <p v-else class="picker-empty">{{ t('chat.pickEmpty') }}</p>
      </div>
    </div>

    <ComposerBox
      v-model="input"
      :placeholder="
        ui.createMode === 'session'
          ? t('chat.createTaglineSession')
          : t('chat.createTaglineTask')
      "
      centered
      @submit="submitCreateFromComposer"
    />
    <div class="center-shadow" />
  </div>
</template>
