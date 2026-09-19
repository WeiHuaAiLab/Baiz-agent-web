<script setup lang="ts">
// 状态栏（件 4）：模型 / 连接 / 用量 / 工作区——对照 codex status/ 模块的轻量版
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../stores/session'
import { useMessageStore } from '../stores/message'
import { useSettingsStore } from '../stores/settings'
import { useApprovalStore } from '../stores/approval'
import { useUiStore } from '../stores/ui'
import Icon from './common/Icon.vue'

const { t } = useI18n()
const session = useSessionStore()
const messages = useMessageStore()
const settings = useSettingsStore()
const approvals = useApprovalStore()
const ui = useUiStore()

const activeId = computed(() => session.activeId)

const modelText = computed(() =>
  settings.demoMode
    ? t('status.demo')
    : settings.model === 'deepseek-v4-flash'
      ? t('chat.modelFlash')
      : t('chat.modelPro'),
)

const connectionText = computed(() => {
  if (settings.demoMode) return t('status.demo')
  switch (settings.connection) {
    case 'connecting':
      return t('status.connecting')
    case 'reconnecting':
      return t('status.reconnecting')
    case 'connected':
      return t('status.connected')
    default:
      return t('status.idle')
  }
})

const connectionClass = computed(() => settings.connection)

/** 当前活跃 run 的字符量（流式期间的轻量用量指标，数据源为 message store） */
const chars = computed(() => {
  if (!activeId.value) return 0
  return messages
    .activeRuns(activeId.value)
    .reduce((sum, run) => sum + run.text.length + run.reasoning.length, 0)
})

const workspaceText = computed(() => {
  const ws = settings.activeWorkspace
  if (!ws) return ''
  return ws.length > 48 ? `…${ws.slice(ws.length - 48)}` : ws
})
</script>

<template>
  <footer class="status-bar">
    <!-- 标准 v1.0 §C B5：待办入口常驻＋`pending_total` 角标（任何视图都在） -->
    <button
      type="button"
      class="sb-item sb-inbox"
      :class="{ 'has-items': approvals.badgeCount > 0 }"
      :title="t('approval.inboxTitle')"
      @click="ui.toggleInbox()"
    >
      <Icon name="inbox" :size="13" />
      <span>{{ t('approval.inboxShort') }}</span>
      <span v-if="approvals.badgeCount > 0" class="sb-badge">{{ approvals.badgeCount }}</span>
    </button>
    <span class="sb-sep" />
    <span class="sb-item sb-model">{{ modelText }}</span>
    <span class="sb-sep" />
    <span class="sb-item sb-conn" :class="connectionClass">
      <span class="sb-dot" />
      {{ connectionText }}
    </span>
    <span v-if="chars > 0" class="sb-sep" />
    <span v-if="chars > 0" class="sb-item sb-chars">{{ chars }} {{ t('status.chars') }}</span>
    <span class="sb-spacer" />
    <span
      v-if="workspaceText"
      class="sb-item sb-workspace"
      :title="settings.activeWorkspace"
    >
      {{ workspaceText }}
    </span>
  </footer>
</template>
