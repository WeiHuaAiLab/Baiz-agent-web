<script setup lang="ts">
// 定时任务表单：任务名称、指令、执行模式（云/本地）、执行周期（月/周/日/时/间隔）及对应时间配置。
import { useI18n } from 'vue-i18n'
import type { TaskCycle, TaskDraft, TaskMode } from '../../stores/workspace'

const draft = defineModel<TaskDraft>({ required: true })
const { t } = useI18n()

const cycles: { id: TaskCycle; label: string }[] = [
  { id: 'monthly', label: t('tasks.cycleMonthly') },
  { id: 'weekly', label: t('tasks.cycleWeekly') },
  { id: 'daily', label: t('tasks.cycleDaily') },
  { id: 'hourly', label: t('tasks.cycleHourly') },
  { id: 'interval', label: t('tasks.cycleInterval') },
  // DEBT-546 once 档：一次性（datetime-local 选时——执行后自动 disabled）
  { id: 'once', label: t('tasks.cycleOnce') },
]

/** once 档最小选时（datetime-local 空值给现在 +1h 整数分默认） */
function defaultOnceRunAt(): string {
  const d = new Date(Date.now() + 3_600_000)
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const weekdays = [1, 2, 3, 4, 5, 6, 7].map((value) => ({
  value,
  label: t(`tasks.weekday.${value}`),
}))

const unitLabels: Record<TaskDraft['unit'], string> = {
  minute: t('tasks.unitMinute'),
  hour: t('tasks.unitHour'),
  day: t('tasks.unitDay'),
}

function setMode(mode: TaskMode) {
  draft.value.mode = mode
}

function setCycle(cycle: TaskCycle) {
  draft.value.cycle = cycle
  // once 切档：runAt 空则给默认（现在 +1h 整数分）
  if (cycle === 'once' && !draft.value.runAt) {
    draft.value.runAt = defaultOnceRunAt()
  }
}
</script>

<template>
  <div class="task-form">
    <div class="field">
      <label>{{ t('tasks.taskName') }}</label>
      <input v-model="draft.title" :placeholder="t('tasks.namePlaceholder')" />
    </div>
    <div class="field">
      <label>{{ t('tasks.instruction') }}</label>
      <textarea
        v-model="draft.instruction"
        :placeholder="t('tasks.instructionPlaceholder')"
        rows="3"
      />
    </div>
    <div class="field">
      <label>{{ t('tasks.executeMode') }}</label>
      <div class="seg">
        <button type="button" :class="{ active: draft.mode === 'cloud' }" @click="setMode('cloud')">
          {{ t('tasks.modeCloud') }}
        </button>
        <button type="button" :class="{ active: draft.mode === 'local' }" @click="setMode('local')">
          {{ t('tasks.modeLocal') }}
        </button>
      </div>
    </div>
    <div class="field">
      <label>{{ t('tasks.executeCycle') }}</label>
      <div class="seg cycle-seg">
        <button
          v-for="cycle in cycles"
          :key="cycle.id"
          type="button"
          :class="{ active: draft.cycle === cycle.id }"
          @click="setCycle(cycle.id)"
        >
          {{ cycle.label }}
        </button>
      </div>
    </div>
    <div class="field time-field">
      <template v-if="draft.cycle === 'monthly'">
        <label>{{ t('tasks.monthDay') }}</label>
        <input v-model.number="draft.day" type="number" min="1" max="31" />
        <label class="sub">{{ t('tasks.timeLabel') }}</label>
        <input v-model="draft.time" type="time" />
      </template>
      <template v-else-if="draft.cycle === 'weekly'">
        <label>{{ t('tasks.weekdayLabel') }}</label>
        <select v-model.number="draft.weekday">
          <option v-for="week in weekdays" :key="week.value" :value="week.value">
            {{ week.label }}
          </option>
        </select>
        <label class="sub">{{ t('tasks.timeLabel') }}</label>
        <input v-model="draft.time" type="time" />
      </template>
      <template v-else-if="draft.cycle === 'daily'">
        <label>{{ t('tasks.timeLabel') }}</label>
        <input v-model="draft.time" type="time" />
      </template>
      <template v-else-if="draft.cycle === 'hourly'">
        <p class="hint">{{ t('tasks.hourlyHint') }}</p>
      </template>
      <!-- DEBT-546 once 档：datetime-local 选时（替代 time/day 组——执行后自动关） -->
      <template v-else-if="draft.cycle === 'once'">
        <label>{{ t('tasks.runAtLabel') }}</label>
        <input v-model="draft.runAt" type="datetime-local" />
        <p class="hint">{{ t('tasks.onceHint') }}</p>
      </template>
      <template v-else>
        <label>{{ t('tasks.everyLabel') }}</label>
        <input v-model.number="draft.every" type="number" min="1" />
        <select v-model="draft.unit">
          <option value="minute">{{ unitLabels.minute }}</option>
          <option value="hour">{{ unitLabels.hour }}</option>
          <option value="day">{{ unitLabels.day }}</option>
        </select>
      </template>
    </div>
  </div>
</template>
