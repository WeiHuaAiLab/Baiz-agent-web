<script setup lang="ts">
// 工作区路由容器（Settings 风格）：顶部返回栏 + 动态标题，内容由三个独立子路由渲染。
// 普通任务 / 定时任务 / 能力扩展 不再以页面内 tab 切换，而是各自独立子页
// （/working/tasks、/working/scheduled、/working/extensions），由侧边栏「工作区」入口直接进入。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

/** 页面标题：跟随当前子路由 */
const pageTitle = computed(() => {
  switch (route.name) {
    case 'working-scheduled':
      return t('working.scheduled')
    case 'working-extensions':
      return t('working.extensions')
    default:
      return t('working.tasks')
  }
})

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
  <section class="settings-view">
    <div class="settings-inner">
      <header class="settings-header">
        <button type="button" class="back-btn" @click="goBack()">← {{ t('common.back') }}</button>
        <h1>{{ pageTitle }}</h1>
      </header>

      <router-view />
    </div>
  </section>
</template>
