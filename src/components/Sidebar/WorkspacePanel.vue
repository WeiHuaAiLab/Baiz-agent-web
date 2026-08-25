<script setup lang="ts">
// 侧栏「工作区」Tab：新建任务 + 定时任务列表 + 扩展区块，以及任务调度配置弹窗。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import type { TaskDraft, TaskItem } from '../../stores/workspace'
import { createEmptyTaskDraft } from '../../stores/workspace'
import { formatNextRun, nextRunAt } from '../../utils/tasks'
import Icon from '../common/Icon.vue'
import TaskForm from '../common/TaskForm.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const ui = useUiStore()

const taskConfig = ref<TaskItem | null>(null)
const editDraft = ref<TaskDraft>(createEmptyTaskDraft())

function openTaskConfig(task: TaskItem) {
  taskConfig.value = task
  // 容错：task.schedule 为可选，未配置调度时用默认草稿兜底，保证 TaskDraft 字段完整
  editDraft.value = {
    ...createEmptyTaskDraft(),
    ...task.schedule,
    title: task.title,
    instruction: task.instruction,
  }
}

function saveTaskConfig() {
  if (!taskConfig.value) return
  workspace.updateTask(taskConfig.value.id, editDraft.value)
  taskConfig.value = null
}

function scheduleText(task: TaskItem): string {
  const schedule = task.schedule
  if (!schedule) return t('tasks.notConfigured')
  const mode = schedule.mode === 'cloud' ? t('tasks.modeCloud') : t('tasks.modeLocal')
  let base: string
  if (schedule.cycle === 'monthly') {
    base = `${t('tasks.cycleMonthly')} ${schedule.day} 日 ${schedule.time} · ${mode}`
  } else if (schedule.cycle === 'weekly') {
    base = `${t('tasks.cycleWeekly')} ${t(`tasks.weekday.${schedule.weekday}`)} ${schedule.time} · ${mode}`
  } else if (schedule.cycle === 'daily') {
    base = `${t('tasks.cycleDaily')} ${schedule.time} · ${mode}`
  } else if (schedule.cycle === 'hourly') {
    base = `${t('tasks.cycleHourly')} · ${mode}`
  } else {
    const unit =
      schedule.unit === 'minute'
        ? t('tasks.unitMinute')
        : schedule.unit === 'hour'
          ? t('tasks.unitHour')
          : t('tasks.unitDay')
    base = `${t('tasks.cycleInterval')} ${schedule.every} ${unit} · ${mode}`
  }
  const next = nextRunAt(schedule)
  return next ? `${base} · ${t('tasks.next')} ${formatNextRun(next)}` : base
}

function newTask() {
  ui.openCreate('task')
}
</script>

<template>
  <section class="side-section">
    <button type="button" class="menu-item" @click="newTask">
      <Icon name="pen" :size="15" />
      <span>{{ t('sidebar.newTask') }}</span>
    </button>

    <button
      type="button"
      class="menu-item"
      :title="t('tasks.addScheduled')"
      @click="ui.openCreate('scheduled')"
    >
      <Icon name="alarm" :size="15" />
      <span>{{ t('sidebar.scheduledTasks') }}</span>
    </button>
    <ul v-if="workspace.tasks.length" class="project-list task-list-slim">
      <li v-for="task in workspace.tasks" :key="task.id">
        <Icon name="tasks" :size="13" />
        <span class="project-title">{{ task.title }}</span>
        <span class="task-when">{{ scheduleText(task) }}</span>
        <button
          type="button"
          class="task-config-btn"
          :title="t('tasks.scheduleTitle')"
          @click="openTaskConfig(task)"
        >
          <Icon name="settings" :size="13" />
        </button>
      </li>
    </ul>
    <p v-else class="placeholder">{{ t('sidebar.noTasks') }}</p>

    <div class="section-block">
      <div class="menu-item static">
        <Icon name="extension" :size="15" />
        <span>{{ t('sidebar.extensions') }}</span>
      </div>
      <p class="placeholder">{{ t('sidebar.noExtensions') }}</p>
    </div>
  </section>

  <div v-if="taskConfig" class="modal-mask" @click.self="taskConfig = null">
    <div class="modal-card">
      <h3>{{ t('tasks.scheduleTitle') }}</h3>
      <p class="modal-slogan">{{ taskConfig.title }}</p>
      <TaskForm v-model="editDraft" />
      <div class="modal-actions">
        <button type="button" class="btn-ghost" @click="taskConfig = null">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="btn-primary" @click="saveTaskConfig">
          {{ t('tasks.scheduleSave') }}
        </button>
      </div>
    </div>
  </div>
</template>
