<script setup lang="ts">
// 工作区 · 定时任务子页：内联新建/编辑表单（复用 TaskForm，不再弹窗）+ 定时任务列表。
// 页面结构与普通任务页一致：卡片表单在上，列表在下，无数据时用 EmptyCompents 占位。
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
import EmptyCompents from '../common/EmptyCompents.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()

/** 定时任务：带 schedule 调度配置的任务 */
const scheduledTasks = computed(() => workspace.tasks.filter((task) => task.schedule))

/** 当前编辑目标（null 表示新建） */
const editTarget = ref<TaskItem | null>(null)
const editDraft = ref<TaskDraft>(createEmptyTaskDraft())

/** 是否有输入内容——用于启用重置按钮 */
const isDirty = computed(() => !!(editDraft.value.title.trim() || editDraft.value.instruction.trim()))

/** 点击列表项编辑：回填表单 */
function openEdit(task: TaskItem) {
  editTarget.value = task
  editDraft.value = {
    ...createEmptyTaskDraft(),
    ...task.schedule,
    title: task.title,
    instruction: task.instruction,
  }
}

/** 重置表单（清空已输入但未提交的内容，回到新建态） */
function reset() {
  editTarget.value = null
  editDraft.value = createEmptyTaskDraft()
}

/** 保存：新增或更新后回到新建态 */
function save() {
  const draft = editDraft.value
  if (!draft.title.trim()) return
  if (editTarget.value) {
    workspace.updateTask(editTarget.value.id, draft)
  } else {
    workspace.addTask(draft)
  }
  reset()
}

function removeTask(id: string) {
  workspace.removeTask(id)
}
</script>

<template>
  <div>
    <!-- 新建/编辑定时任务表单（卡片形式，内联显示） -->
    <div class="settings-card">
      <h2>{{ t('working.scheduled') }}</h2>
      <p class="section-desc">{{ t('working.scheduledHint') }}</p>

      <TaskForm v-model="editDraft" />

      <div class="form-actions">
        <button
          type="button"
          class="btn-ghost"
          :disabled="!isDirty"
          @click="reset"
        >
          {{ t('working.reset') }}
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!editDraft.title.trim()"
          @click="save"
        >
          {{ editTarget ? t('tasks.scheduleSave') : t('working.addScheduled') }}
        </button>
      </div>
    </div>

    <!-- 定时任务列表 -->
    <div v-if="scheduledTasks.length" class="task-list-wrap">
      <h3 class="task-section-title">{{ t('working.scheduledList') }}</h3>
      <ul class="task-list">
        <li v-for="task in scheduledTasks" :key="task.id" class="task-item">
          <div class="task-dot" />
          <div class="task-main">
            <div class="task-title">{{ task.title }}</div>
            <div v-if="task.instruction" class="task-desc">{{ task.instruction }}</div>
            <div class="task-meta">
              <span class="task-meta-item">
                <Icon name="alarm" :size="12" />
                {{ scheduleText(task, t) }}
              </span>
            </div>
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
    </div>

    <!-- 空数据：使用 EmptyCompents 占位 -->
    <EmptyCompents
      v-else
      icon="alarm"
      :title="t('working.emptyScheduledTitle')"
      :description="t('working.emptyScheduled')"
    />
  </div>
</template>
