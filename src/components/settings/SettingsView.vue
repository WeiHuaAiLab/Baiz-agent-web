<script setup lang="ts">
// 设置页路由容器：5 个 Tab 内容区（通用 / 模型 / MCP / 运行与更新 / 关于）。
// 无独立头部行，Tab 栏直接置于顶部，切换即显隐对应 panel。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppearanceCard from './AppearanceCard.vue'
import ApiKeyCard from './ApiKeyCard.vue'
import ModelCard from './ModelCard.vue'
import MemoryCard from './MemoryCard.vue'
import WorkspaceCard from './WorkspaceCard.vue'
import SystemCard from './SystemCard.vue'
import DemoCard from './DemoCard.vue'

type TabKey = 'general' | 'model' | 'mcp' | 'runtime' | 'about'

const { t } = useI18n()

const tabs: TabKey[] = ['general', 'model', 'mcp', 'runtime', 'about']
const activeTab = ref<TabKey>('general')

function selectTab(key: TabKey) {
  activeTab.value = key
}
</script>

<template>
  <section class="settings-view">
    <div class="settings-inner">
      <nav class="settings-tabs" role="tablist">
        <button
          v-for="key in tabs"
          :key="key"
          type="button"
          role="tab"
          class="settings-tab"
          :class="{ active: activeTab === key }"
          :aria-selected="activeTab === key"
          @click="selectTab(key)"
        >
          {{ t(`settings.tabs.${key}`) }}
        </button>
      </nav>

      <!-- 通用：外观 + 存储设置（授权目录） -->
      <div v-show="activeTab === 'general'" class="settings-panel" role="tabpanel">
        <AppearanceCard />
        <WorkspaceCard />
      </div>

      <!-- 模型：API Key 配置 + 模型偏好选择 -->
      <div v-show="activeTab === 'model'" class="settings-panel" role="tabpanel">
        <ApiKeyCard />
        <ModelCard />
      </div>

      <!-- MCP：预留入口（功能接入前的占位） -->
      <div v-show="activeTab === 'mcp'" class="settings-panel" role="tabpanel">
        <div class="settings-mcp-empty">
          <span class="mcp-title">{{ t('settings.mcp.emptyTitle') }}</span>
          <span class="mcp-hint">{{ t('settings.mcp.emptyHint') }}</span>
        </div>
      </div>

      <!-- 运行与更新：记忆设置 + 演示数据 -->
      <div v-show="activeTab === 'runtime'" class="settings-panel" role="tabpanel">
        <MemoryCard />
        <DemoCard />
      </div>

      <!-- 关于：系统状态 + 版本 -->
      <div v-show="activeTab === 'about'" class="settings-panel" role="tabpanel">
        <SystemCard />
      </div>
    </div>
  </section>
</template>
