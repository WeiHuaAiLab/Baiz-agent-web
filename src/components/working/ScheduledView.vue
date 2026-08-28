<script setup lang="ts">
// 定时任务子页：顶部大标题 + 描述 + 右侧操作（刷新 / 通过对话创建 / 创建新任务），
// 下方是任务列表 / 空状态。
// 「创建新任务」直接打开「创建自动化任务」弹窗（ui.openCreate('scheduled')）；
// 「通过对话创建」跳回聊天页并触发「新建会话」弹窗（ui.openCreate('session')）。
// 不再内联 TaskForm，避免与全局弹窗重复入口。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore, type TaskItem } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import { scheduleText } from '../../utils/tasks'
import Icon from '../common/Icon.vue'
import EmptyCompents from '../common/EmptyCompents.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const ui = useUiStore()

/** 定时任务：带 schedule 调度配置的任务 */
const scheduledTasks = computed(() => workspace.tasks.filter((task) => task.schedule))

/** 「创建新任务」：复用 ui.openCreate('scheduled') 触发 App.vue 挂载的 CreateTask 弹窗 */
function createNew() {
  ui.openCreate('scheduled')
}

/** 任务是否开启（enabled 缺省视为开启） */
function isEnabled(task: TaskItem): boolean {
  return task.enabled !== false
}

/** 刷新：演示态，弹出 toast；后续可接入定时任务列表的重新拉取逻辑 */
function refresh() {
  ui.toast(t('working.scheduledRefreshed'), 'info')
}

function removeTask(id: string) {
  workspace.removeTask(id)
}
</script>

<template>
  <div>
    <header class="scheduled-header">
      <div class="scheduled-head-text">
        <h2 class="scheduled-title">{{ t('working.scheduled') }}</h2>
        <p class="scheduled-subtitle">{{ t('working.scheduledSubtitle') }}</p>
      </div>
      <div class="scheduled-actions">
        <button type="button" class="btn-primary" @click="createNew">
          <Icon name="plus" :size="14" />
          <span>{{ t('working.createNewTask') }}</span>
        </button>
      </div>
    </header>

    <div v-if="scheduledTasks.length" class="task-list-wrap">
      <div class="task-section-head">
        <h3 class="task-section-title">{{ t('working.scheduledList') }}</h3>
        <button
          type="button"
          class="scheduled-refresh"
          :title="t('working.refresh')"
          @click="refresh"
        >
          <Icon name="refresh" :size="15" />
        </button>
      </div>
      <ul class="task-list">
        <li v-for="task in scheduledTasks" :key="task.id" class="task-item">
          <div class="task-head">
            <div class="task-title">{{ task.title }}</div>
            <button
              type="button"
              class="task-toggle"
              :class="{ on: isEnabled(task) }"
              :title="isEnabled(task) ? t('working.taskEnabled') : t('working.taskDisabled')"
              @click="workspace.toggleTask(task.id)"
            >
              <span class="task-toggle-track">
                <span class="task-toggle-knob" />
              </span>
            </button>
          </div>
          <div v-if="task.instruction" class="task-desc" :title="task.instruction">
            {{ task.instruction }}
          </div>
          <div class="task-meta">
            <span class="task-time">
              <Icon name="alarm" :size="12" />
              {{ scheduleText(task as TaskItem, t) }}
            </span>
            <button
              type="button"
              class="task-del"
              :title="t('common.delete')"
              @click="removeTask(task.id)"
            >
              <Icon name="trash" :size="14" />
            </button>
          </div>
        </li>
      </ul>
    </div>

    <EmptyCompents
      v-else
      icon="alarm"
      :title="t('working.emptyScheduledTitle')"
      :description="t('working.emptyScheduled')"
    />
  </div>
</template>
