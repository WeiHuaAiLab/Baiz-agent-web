<script setup lang="ts">
// 侧栏「工作区」Tab：新建任务 / 定时任务 / 能力扩展入口 + 任务列表。
// 所有入口统一跳转到 /working 路由对应子页（不在侧栏内弹创建流程）。
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore, type TaskItem } from '../../stores/workspace'
import { scheduleText } from '../../utils/tasks'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const router = useRouter()
const workspace = useWorkspaceStore()

function goTasks() {
  void router.push('/working/tasks')
}

function goScheduled() {
  void router.push('/working/scheduled')
}

function goExtensions() {
  void router.push('/working/extensions')
}

/** 点击任务项：按是否配置调度跳转到对应子页查看/编辑 */
function openTask(task: TaskItem) {
  void router.push(task.schedule ? '/working/scheduled' : '/working/tasks')
}
</script>

<template>
  <section class="side-section">
    <button type="button" class="menu-item" @click="goTasks">
      <Icon name="pen" :size="15" />
      <span>{{ t('sidebar.newTask') }}</span>
    </button>

    <button
      type="button"
      class="menu-item"
      :title="t('tasks.addScheduled')"
      @click="goScheduled"
    >
      <Icon name="alarm" :size="15" />
      <span>{{ t('sidebar.scheduledTasks') }}</span>
    </button>

    <ul v-if="workspace.tasks.length" class="project-list task-list-slim">
      <li v-for="task in workspace.tasks" :key="task.id" @click="openTask(task)">
        <Icon name="tasks" :size="13" />
        <span class="project-title">{{ task.title }}</span>
        <span class="task-when">{{ scheduleText(task, t) }}</span>
      </li>
    </ul>
    <p v-else class="placeholder">{{ t('sidebar.noTasks') }}</p>

    <div class="section-block">
      <button type="button" class="menu-item" @click="goExtensions">
        <Icon name="extension" :size="15" />
        <span>{{ t('sidebar.extensions') }}</span>
      </button>
      <p class="placeholder">{{ t('sidebar.noExtensions') }}</p>
    </div>
  </section>
</template>
