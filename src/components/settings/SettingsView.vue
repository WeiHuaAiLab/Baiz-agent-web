<script setup lang="ts">
// 设置页路由容器：顶部返回栏 + 按模块拆分的卡片组件（整页滚动，页面级滚动由 .settings-view 承担）。
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppearanceCard from './AppearanceCard.vue'
import ApiKeyCard from './ApiKeyCard.vue'
import ModelCard from './ModelCard.vue'
import MemoryCard from './MemoryCard.vue'
import WorkspaceCard from './WorkspaceCard.vue'
import SystemCard from './SystemCard.vue'
import DemoCard from './DemoCard.vue'

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <section class="settings-view">
    <div class="settings-inner">
      <header class="settings-header">
        <button type="button" class="back-btn" @click="router.back()">← {{ t('common.back') }}</button>
        <h1>{{ t('settings.title') }}</h1>
      </header>

      <AppearanceCard />
      <ApiKeyCard />
      <ModelCard />
      <MemoryCard />
      <WorkspaceCard />
      <SystemCard />
      <DemoCard />
    </div>
  </section>
</template>
