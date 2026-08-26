<script setup lang="ts">
// 工作区 · 普通任务子页：一次性任务列表 + 内联新建（无调度配置）。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()

const plainTasks = computed(() => workspace.tasks.filter((task) => !task.schedule))

const title = ref('')
const instruction = ref('')

function submit() {
  const name = title.value.trim()
  if (!name) return
  workspace.addPlainTask(name, instruction.value.trim())
  title.value = ''
  instruction.value = ''
}

function removeTask(id: string) {
  workspace.removeTask(id)
}
</script>

<template>
  <div>
    <div class="settings-card">
      <h2>{{ t('working.tasks') }}</h2>
      <p class="section-desc">{{ t('working.tasksHint') }}</p>
      <div class="task-new-form">
        <input
          v-model="title"
          :placeholder="t('tasks.taskName')"
          @keyup.enter="submit"
        />
        <textarea
          v-model="instruction"
          :placeholder="t('tasks.instructionPlaceholder')"
          rows="2"
        />
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

    <ul v-if="plainTasks.length" class="task-list">
      <li v-for="task in plainTasks" :key="task.id" class="task-item">
        <div class="task-main">
          <span class="task-title">{{ task.title }}</span>
          <span v-if="task.instruction" class="task-desc">{{ task.instruction }}</span>
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
    <p v-else class="placeholder">{{ t('working.emptyTasks') }}</p>
  </div>
</template>
