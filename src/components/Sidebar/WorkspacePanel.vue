<script setup lang="ts">
// 侧栏「工作区」Tab：普通任务 / 定时任务 / 能力扩展入口 + 普通任务列表。
// 定时任务不在侧栏展示列表（数量过多不适合），统一进入子页管理。
// 所有入口统一跳转到 /working 路由对应子页（不在侧栏内弹创建流程）。
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore, type TaskItem } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const router = useRouter()
const workspace = useWorkspaceStore()
const ui = useUiStore()

/** 侧栏默认显示定时任务列表（带 schedule 的任务），点击进入 /working/scheduled */
const scheduledTasks = computed(() => workspace.tasks.filter((task) => task.schedule))

/** 任务运行模式：cloud → 云端图标，local → 本地图标 */
function modeIcon(task: TaskItem): 'cloud' | 'local' {
  return task.schedule?.mode === 'cloud' ? 'cloud' : 'local'
}

/** 「创建任务」= 创建定时任务：直接弹出「创建自动化任务」弹窗（App.vue 挂载） */
function createScheduledTask() {
  ui.openCreate('scheduled')
}

// 普通任务页暂时不展示，恢复时取消注释
// function goTasks() {
//   void router.push('/working/tasks')
// }

function goScheduled() {
  void router.push('/working/scheduled')
}

function goExtensions() {
  void router.push('/working/extensions')
}
</script>

<template>
  <section class="side-section">
    <button type="button" class="menu-item" @click="createScheduledTask">
      <Icon name="plus" :size="15" />
      <span>{{ t('sidebar.createTask') }}</span>
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

    <ul v-if="scheduledTasks.length" class="project-list task-list-slim">
      <li v-for="task in scheduledTasks" :key="task.id" @click="goScheduled">
        <Icon :name="modeIcon(task)" :size="13" />
        <span class="project-title">{{ task.title }}</span>
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
