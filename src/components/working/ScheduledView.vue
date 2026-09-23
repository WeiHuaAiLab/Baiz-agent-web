<script setup lang="ts">
// 定时任务子页：顶部大标题 + 描述 + 右侧操作（刷新 / 创建新任务），下方任务列表 / 空状态。
// **MSG-3511 S1**：列表／执行记录**改接 daemon**（`schedule.list`／`schedule.list_runs`）；
// 空表与错误均给**人话**（不得空白）；启停／删除同接 daemon。
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { type TaskItem } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import { getClient } from '../../client/singleton'
import {
  humanizeRpcError,
  loadScheduledTasks,
  loadTaskRuns,
  onScheduleChanged,
  runStatusLabel,
} from '../../utils/scheduleWire'
import type { ScheduleRun } from '../../client/types'
import { scheduleText } from '../../utils/tasks'
import Icon from '../common/Icon.vue'
import EmptyCompents from '../common/EmptyCompents.vue'

const { t } = useI18n()
const ui = useUiStore()

/** 定时任务：来自 **daemon**（本拘前为内存 store） */
const remoteTasks = ref<TaskItem[]>([])
const loadError = ref('')
const loading = ref(false)
/** 已展开的执行记录（taskId → runs） */
const runsOf = ref<Record<string, ScheduleRun[]>>({})
const runsError = ref<Record<string, string>>({})

const scheduledTasks = computed(() => remoteTasks.value)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    remoteTasks.value = await loadScheduledTasks(getClient())
  } catch (e) {
    remoteTasks.value = []
    loadError.value = humanizeRpcError(e)
  } finally {
    loading.value = false
  }
}

/** 刷新：**真重拉 daemon**（旧为演示 toast） */
async function refresh() {
  await load()
  if (!loadError.value) ui.toast(t('working.scheduledRefreshed'), 'info')
}

/** 执行记录：真在跑与产出（展开即拉、再点收起） */
async function toggleRuns(task: TaskItem) {
  if (runsOf.value[task.id]) {
    const next = { ...runsOf.value }
    delete next[task.id]
    runsOf.value = next
    return
  }
  try {
    const runs = await loadTaskRuns(getClient(), task.id, 10)
    runsOf.value = { ...runsOf.value, [task.id]: runs }
    runsError.value = { ...runsError.value, [task.id]: '' }
  } catch (e) {
    runsError.value = { ...runsError.value, [task.id]: humanizeRpcError(e) }
  }
}

/** 同一行人话：`状态 · 时间 [· 摘要/错误]` */
function runLine(r: ScheduleRun): string {
  const at = r.triggered_at > 0 ? new Date(r.triggered_at * 1000).toLocaleString() : '—'
  const extra = (r.error || r.summary || '').trim()
  return `${runStatusLabel(r.status)} · ${at}${extra ? `· ${extra}` : ''}`
}

/** 启停：接 daemon（失败人话·不改界面状态） */
async function toggleTask(task: TaskItem) {
  const next = !isEnabled(task)
  try {
    await getClient().scheduleToggle(task.id, next)
    task.enabled = next
  } catch (e) {
    ui.toast(humanizeRpcError(e), 'error')
  }
}

/** **MSG-3528**：编辑既有任务（复用 CreateTask 弹窗·编辑态 ⇒ `schedule.update`） */
function editTask(task: TaskItem) {
  ui.openScheduleEdit(task)
}

/** 删除：接 daemon（成功后从列表摘除）。
 *
 * **MSG-3528**：**须先确认**（`window.confirm` 带任务名）——**不得一键无声删**；
 * **二次校验**＝daemon 侧 `guard_owner`（空账号拒＋仅本账号任务可删）。 */
async function removeTask(id: string) {
  const name = scheduledTasks.value.find((item) => item.id === id)?.title ?? id
  if (!window.confirm(t('working.deleteConfirm', { name }))) return
  try {
    await getClient().scheduleDelete(id)
    remoteTasks.value = remoteTasks.value.filter((item) => item.id !== id)
  } catch (e) {
    ui.toast(humanizeRpcError(e), 'error')
  }
}

/** 任务是否开启（enabled 缺省视为开启） */
function isEnabled(task: TaskItem): boolean {
  return task.enabled !== false
}

/** 「创建新任务」：复用 `ui.openCreate('scheduled')` 触发 App.vue 挂载的 CreateTask 弹窗 */
function createNew() {
  ui.openCreate('scheduled')
}

let offSchedule: (() => void) | null = null
onMounted(() => {
  void load()
  offSchedule = onScheduleChanged(() => void load())
})
onBeforeUnmount(() => {
  offSchedule?.()
  offSchedule = null
})
</script>

<template>
  <div>
    <div v-if="loadError" class="scheduled-error" role="alert">{{ loadError }}</div>
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
              @click="toggleTask(task)"
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
              class="task-runs-btn"
              :title="t('working.runsLabel')"
              @click="toggleRuns(task)"
            >
              <Icon name="list" :size="13" />
              <span>{{ t('working.runsLabel') }}</span>
            </button>
            <button
              type="button"
              class="task-edit"
              :title="t('working.taskEdit')"
              @click="editTask(task as TaskItem)"
            >
              <Icon name="pen" :size="14" />
            </button>
            <button
              type="button"
              class="task-del"
              :title="t('common.delete')"
              @click="removeTask(task.id)"
            >
              <Icon name="trash" :size="14" />
            </button>
          </div>
          <!-- S1：执行记录（展开即拉 `schedule.list_runs`；空表/错误均给人话） -->
          <div v-if="runsError[task.id]" class="task-runs-error" role="alert">
            {{ runsError[task.id] }}
          </div>
          <ul v-else-if="runsOf[task.id]" class="task-runs">
            <li v-if="!runsOf[task.id].length" class="task-runs-empty">
              {{ t('working.runsEmpty') }}
            </li>
            <li v-for="run in runsOf[task.id]" :key="run.id" class="task-run-line">
              {{ runLine(run) }}
            </li>
          </ul>
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
