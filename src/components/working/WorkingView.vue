<script setup lang="ts">
// 工作区路由容器（Settings 风格）：不再显示返回栏/页面标题，
// 各子页（普通任务 / 定时任务 / 能力扩展）自行提供顶部标题与内容。
//
// MSG-3375 U-4（在册件 U-4 留裁项）：**加可见页签栏**——
// 旧面只有裸 `<RouterView/>` ⇒ 用户看不出工作区还有别的页，也无法切回去；
// 现在：① 常显两枚页签（顺序＝`WORKING_TABS`）；② 当前页高亮（`aria-current`）；
// ③ 切页即写记忆（`rememberWorkingTab`）⇒ 从文件面板切走再回来**落回上次页签**。
import { computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  WORKING_TABS,
  isWorkingTab,
  rememberWorkingTab,
  workingTabPath,
  type WorkingTab,
} from '../../utils/workingTabs'

const { t } = useI18n()
const route = useRoute()

/** 页签标签复用既有 i18n 键（零新增键；顺序即展示顺序） */
const TAB_LABEL_KEYS: Record<WorkingTab, string> = {
  scheduled: 'working.scheduled',
  extensions: 'working.extensions',
}

const tabs = computed(() =>
  WORKING_TABS.map((tab) => ({
    tab,
    path: workingTabPath(tab),
    label: t(TAB_LABEL_KEYS[tab]),
  })),
)

/** 当前页签：从**路径**取（子页路由名＝`working-<tab>`，路径更稳） */
const activeTab = computed<WorkingTab | ''>(() => {
  const matched = /^\/working\/([^/?#]+)/.exec(route.path)
  const seg = matched?.[1]
  return isWorkingTab(seg) ? seg : ''
})

// 切页即记（含首次进入——把"当前落点"钉成下次的落点）
watch(activeTab, (tab) => {
  if (tab) rememberWorkingTab(tab)
}, { immediate: true })
</script>

<template>
  <section class="settings-view working-view">
    <div class="settings-inner">
      <nav class="working-tabs" :aria-label="t('working.tabsLabel')">
        <RouterLink
          v-for="item in tabs"
          :key="item.tab"
          class="working-tab"
          :class="{ active: activeTab === item.tab }"
          :to="item.path"
          :aria-current="activeTab === item.tab ? 'page' : undefined"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
      <RouterView />
    </div>
  </section>
</template>
