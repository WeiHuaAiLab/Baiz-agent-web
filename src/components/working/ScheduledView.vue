<script setup lang="ts">
// 工作区 · 定时任务子页：周期任务列表 + 新增/编辑（复用 TaskForm 弹窗）。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createEmptyTaskDraft,
  useWorkspaceStore,
  type TaskDraft,
  type TaskItem,
} from '../../stores/workspace'
import { scheduleText } from '../../utils/tasks'
import Icon from '../common/Icon.vue'
import TaskForm from '../common/TaskForm.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()

const scheduledTasks = computed(() => workspace.tasks.filter((task) => task.schedule))

const editing = ref(false)
const editTarget = ref<TaskItem | null>(null)
const editDraft = ref<TaskDraft>(createEmptyTaskDraft())

function openCreate() {
  editTarget.value = null
  editDraft.value = createEmptyTaskDraft()
  editing.value = true
}

function openEdit(task: TaskItem) {
  editTarget.value = task
  editDraft.value = {
    ...createEmptyTaskDraft(),
    ...task.schedule,
    title: task.title,
    instruction: task.instruction,
  }
  editing.value = true
}

function save() {
  const draft = editDraft.value
  if (!draft.title.trim()) return
  if (editTarget.value) {
    workspace.updateTask(editTarget.value.id, draft)
  } else {
    workspace.addTask(draft)
  }
  editing.value = false
}

function removeTask(id: string) {
  workspace.removeTask(id)
}
</script>

<template>
  <div>
    <div class="settings-card">
      <h2>{{ t('working.scheduled') }}</h2>
      <p class="section-desc">{{ t('working.scheduledHint') }}</p>
      <button type="button" class="btn-primary" @click="openCreate">
        {{ t('working.addScheduled') }}
      </button>
    </div>

    <ul v-if="scheduledTasks.length" class="task-list">
      <li v-for="task in scheduledTasks" :key="task.id" class="task-item">
        <div class="task-main">
          <span class="task-title">{{ task.title }}</span>
          <span v-if="task.instruction" class="task-desc">{{ task.instruction }}</span>
          <span class="task-when">{{ scheduleText(task, t) }}</span>
        </div>
        <button
          type="button"
          class="task-del"
          :title="t('tasks.scheduleTitle')"
          @click="openEdit(task)"
        >
          <Icon name="settings" :size="14" />
        </button>
        <button
          type="button"
          class="task-del"
          :title="t('common.delete')"
          @click="removeTask(task.id)"
        >
          <Icon name="trash" :size="14" />
        </button>
      </li>
    </ul>
    <p v-else class="placeholder">{{ t('working.emptyScheduled') }}</p>

    <div v-if="editing" class="modal-mask" @click.self="editing = false">
      <div class="modal-card">
        <h3>{{ t('tasks.scheduleTitle') }}</h3>
        <TaskForm v-model="editDraft" />
        <div class="modal-actions">
          <button type="button" class="btn-ghost" @click="editing = false">
            {{ t('common.cancel') }}
          </button>
          <button type="button" class="btn-primary" @click="save">
            {{ t('tasks.scheduleSave') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
