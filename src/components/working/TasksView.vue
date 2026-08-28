<script setup lang="ts">
// 工作区 · 普通任务子页：一次性任务列表 + 内联新建表单。 暂时用不到
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore, formatRelativeTime } from '../../stores/workspace'
import Icon from '../common/Icon.vue'
import EmptyCompents from '../common/EmptyCompents.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()

/** 普通任务：无 schedule 调度配置的任务 */
const plainTasks = computed(() =>
  workspace.tasks.filter((task) => !task.schedule),
)

const title = ref('')
const instruction = ref('')

/** 是否处于编辑或已输入内容状态——用于启用重置按钮 */
const isDirty = computed(() => !!(title.value.trim() || instruction.value.trim()))

function submit() {
  const name = title.value.trim()
  if (!name) return
  workspace.addPlainTask(name, instruction.value.trim())
  title.value = ''
  instruction.value = ''
}

/** 重置表单（清空已输入但未提交的内容） */
function reset() {
  title.value = ''
  instruction.value = ''
}

function removeTask(id: string) {
  workspace.removeTask(id)
}

/** 取任务关联项目名（如有），供任务卡片展示 */
function getProjectTitle(projectId?: string) {
  if (!projectId) return null
  return workspace.projectById(projectId)?.title ?? null
}
</script>

<template>
  <div>
    <div class="settings-card">
      <h2>{{ t('working.tasks') }}</h2>
      <p class="section-desc">{{ t('working.tasksHint') }}</p>

      <div class="task-new-form">
        <label class="form-field">
          <span class="row-label">{{ t('tasks.taskName') }}</span>
          <input
            v-model="title"
            :placeholder="t('tasks.namePlaceholder')"
            @keyup.enter="submit"
          />
        </label>
        <label class="form-field">
          <span class="row-label">{{ t('tasks.instruction') }}</span>
          <textarea
            v-model="instruction"
            :placeholder="t('tasks.instructionPlaceholder')"
            rows="2"
          />
        </label>
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
            :disabled="!title.trim()"
            @click="submit"
          >
            {{ t('working.newTask') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="plainTasks.length" class="task-list-wrap">
      <h3 class="task-section-title">{{ t('working.taskList') }}</h3>
      <ul class="task-list">
        <li v-for="task in plainTasks" :key="task.id" class="task-item">
          <div class="task-dot" />
          <div class="task-main">
            <div class="task-title">{{ task.title }}</div>
            <div v-if="task.instruction" class="task-desc">{{ task.instruction }}</div>
            <div class="task-meta">
              <span v-if="getProjectTitle(task.projectId)" class="task-meta-item">
                <Icon name="workspace" :size="12" />
                {{ getProjectTitle(task.projectId) }}
              </span>
              <span class="task-meta-item">
                <Icon name="alarm" :size="12" />
                {{ formatRelativeTime(task.createdAt) }}
              </span>
            </div>
          </div>
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

    <EmptyCompents
      v-else
      icon="inbox"
      :title="t('working.emptyTasksTitle')"
      :description="t('working.emptyTasks')"
    />
  </div>
</template>
