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

function setMode(mode: TaskMode) {
  draft.value.mode = mode
}

function setCycle(cycle: TaskCycle) {
  draft.value.cycle = cycle
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
