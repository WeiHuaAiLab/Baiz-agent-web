<script setup lang="ts">
// 创建自动化任务（定时任务）弹窗。
// 挂载于 App.vue（ui.createMode === 'scheduled'），由侧栏工作区「创建任务」入口触发。
// 字段：任务名称（必填·0/50 字数）、任务指令（必填）、执行方式（下拉）、
//       执行周期（下拉 + 时间行）、取消/确认。表单颜色风格对齐 settings 页。
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createEmptyTaskDraft,
  useWorkspaceStore,
  type TaskCycle,
  type TaskDraft,
} from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const ui = useUiStore()

/** 名称字数上限（对齐参考图 0/50） */
const MAX_NAME = 50

const draft = ref<TaskDraft>(createEmptyTaskDraft())

const nameLen = computed(() => draft.value.title.length)
const canSubmit = computed(
  () => !!draft.value.title.trim() && !!draft.value.instruction.trim(),
)

const cycles: { id: TaskCycle; label: string }[] = [
  { id: 'monthly', label: t('tasks.cycleMonthly') },
  { id: 'weekly', label: t('tasks.cycleWeekly') },
  { id: 'daily', label: t('tasks.cycleDaily') },
  { id: 'hourly', label: t('tasks.cycleHourly') },
  { id: 'interval', label: t('tasks.cycleInterval') },
]

const weekdays = [1, 2, 3, 4, 5, 6, 7].map((value) => ({
  value,
  label: t(`tasks.weekday.${value}`),
}))

const unitLabels: Record<TaskDraft['unit'], string> = {
  minute: t('tasks.unitMinute'),
  hour: t('tasks.unitHour'),
  day: t('tasks.unitDay'),
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') cancel()
}
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/** 确认：新建定时任务后关闭弹窗 */
function submit() {
  if (!canSubmit.value) return
  const title = draft.value.title.trim()
  workspace.addTask({ ...draft.value, title })
  ui.toast(`${t('tasks.scheduleTitle')}：${title}`, 'success')
  ui.closeCreate()
}

function cancel() {
  ui.closeCreate()
}
</script>

<template>
  <div class="modal-mask modal-create-task" @click.self="cancel">
    <div class="modal-card modal-card-task">
      <header class="modal-header">
        <h3>{{ t('tasks.autoTitle') }}</h3>
        <button
          type="button"
          class="modal-close"
          :title="t('common.close')"
          @click="cancel"
        >
          <Icon name="x" :size="14" />
        </button>
      </header>

      <label class="field-label">
        {{ t('tasks.taskName') }}
        <span class="required">*</span>
        <span class="char-count">{{ nameLen }}/{{ MAX_NAME }}</span>
      </label>
      <input
        v-model="draft.title"
        class="modal-input"
        :maxlength="MAX_NAME"
        :placeholder="t('tasks.namePlaceholder')"
        autofocus
      />

      <label class="field-label">
        {{ t('tasks.instruction') }}
        <span class="required">*</span>
      </label>
      <textarea
        v-model="draft.instruction"
        class="modal-input modal-textarea"
        :placeholder="t('tasks.instructionPlaceholder')"
        rows="3"
      />

      <label class="field-label">{{ t('tasks.executeMode') }}</label>
      <div class="mode-row">
        <select v-model="draft.mode" class="modal-select">
          <option value="cloud">{{ t('tasks.autoMode') }}</option>
          <option value="local">{{ t('tasks.modeLocal') }}</option>
        </select>
        <span class="mode-hint">
          <Icon name="info" :size="12" />
          {{ t('tasks.autoModeHint') }}
        </span>
      </div>

      <label class="field-label">{{ t('tasks.executeCycle') }}</label>
      <div class="cycle-row">
        <select v-model="draft.cycle" class="modal-select cycle-select">
          <option v-for="c in cycles" :key="c.id" :value="c.id">
            {{ c.label }}
          </option>
        </select>
        <span class="cycle-time">
          <Icon name="alarm" :size="13" />
          <template v-if="draft.cycle === 'daily'">
            <input v-model="draft.time" type="time" class="modal-input time-input" />
          </template>
          <template v-else-if="draft.cycle === 'monthly'">
            <input
              v-model.number="draft.day"
              type="number"
              min="1"
              max="31"
              class="modal-input num-input"
            />
            <input v-model="draft.time" type="time" class="modal-input time-input" />
          </template>
          <template v-else-if="draft.cycle === 'weekly'">
            <select v-model.number="draft.weekday" class="modal-select weekday-select">
              <option v-for="w in weekdays" :key="w.value" :value="w.value">
                {{ w.label }}
              </option>
            </select>
            <input v-model="draft.time" type="time" class="modal-input time-input" />
          </template>
          <template v-else-if="draft.cycle === 'hourly'">
            <span class="inline-hint">{{ t('tasks.hourlyHint') }}</span>
          </template>
          <template v-else>
            <input
              v-model.number="draft.every"
              type="number"
              min="1"
              class="modal-input num-input"
            />
            <select v-model="draft.unit" class="modal-select">
              <option value="minute">{{ unitLabels.minute }}</option>
              <option value="hour">{{ unitLabels.hour }}</option>
              <option value="day">{{ unitLabels.day }}</option>
            </select>
          </template>
          <span class="exec-word">{{ t('tasks.execWord') }}</span>
        </span>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn-ghost" @click="cancel">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="btn-primary" :disabled="!canSubmit" @click="submit">
          {{ t('tasks.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>
