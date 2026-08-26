<script setup lang="ts">
// 工作区路由容器：顶部返回 + Tab 导航（普通任务 / 定时任务 / 能力扩展），内容由子路由渲染。
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const tabs = [
  { name: 'working-tasks', path: '/working/tasks', icon: 'tasks', labelKey: 'working.tasks' },
  { name: 'working-scheduled', path: '/working/scheduled', icon: 'alarm', labelKey: 'working.scheduled' },
  { name: 'working-extensions', path: '/working/extensions', icon: 'extension', labelKey: 'working.extensions' },
] as const

/** 返回：优先回退历史（通常来自聊天页），无历史可退时直接回聊天页 */
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    void router.push('/')
  }
}
</script>

<template>
  <section class="working-view">
    <header class="working-header">
      <button type="button" class="back-btn" @click="goBack()">← {{ t('common.back') }}</button>
      <h1>{{ t('working.title') }}</h1>
    </header>

    <nav class="working-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.name"
        type="button"
        class="working-tab"
        :class="{ active: route.name === tab.name }"
        @click="router.push(tab.path)"
      >
        <Icon :name="tab.icon" :size="14" />
        <span>{{ t(tab.labelKey) }}</span>
      </button>
    </nav>

    <div class="working-body">
      <div class="working-inner">
        <router-view />
      </div>
    </div>
  </section>
</template>
