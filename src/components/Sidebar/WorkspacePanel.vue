<script setup lang="ts">
// 侧栏「工作区」Tab：普通任务 / 定时任务 / 能力扩展入口 + 普通任务列表。
// 定时任务不在侧栏展示列表（数量过多不适合），统一进入子页管理。
// 所有入口统一跳转到 /working 路由对应子页（不在侧栏内弹创建流程）。
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore, formatRelativeTime } from '../../stores/workspace'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const router = useRouter()
const workspace = useWorkspaceStore()

/** 侧栏仅列出普通任务（无 schedule），定时任务列表不进侧栏 */
const plainTasks = computed(() => workspace.tasks.filter((task) => !task.schedule))

function goTasks() {
  void router.push('/working/tasks')
}

function goScheduled() {
  void router.push('/working/scheduled')
}

function goExtensions() {
  void router.push('/working/extensions')
}
</script>

<template>
  <section class="side-section">
    <button type="button" class="menu-item" @click="goTasks">
      <Icon name="tasks" :size="15" />
      <span>{{ t('sidebar.plainTasks') }}</span>
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

    <ul v-if="plainTasks.length" class="project-list task-list-slim">
      <li v-for="task in plainTasks" :key="task.id" @click="goTasks">
        <Icon name="tasks" :size="13" />
        <span class="project-title">{{ task.title }}</span>
        <span class="task-when">{{ formatRelativeTime(task.createdAt) }}</span>
      </li>
    </ul>
    <p v-else class="placeholder">{{ t('sidebar.noPlainTasks') }}</p>

    <div class="section-block">
      <button type="button" class="menu-item" @click="goExtensions">
        <Icon name="extension" :size="15" />
        <span>{{ t('sidebar.extensions') }}</span>
      </button>
      <p class="placeholder">{{ t('sidebar.noExtensions') }}</p>
    </div>
  </section>
</template>
