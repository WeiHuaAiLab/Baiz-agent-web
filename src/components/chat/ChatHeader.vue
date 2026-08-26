<script setup lang="ts">
// 聊天页头部：会话标题与徽标（左）；导出菜单（右）。
// 头部占满 100% 宽，内部内容体与消息列一致（720px 居中，见 .chat-header-inner）。
// 「侧栏展开/收缩」按钮在 App.vue 悬浮于 main 左上角（见 .sidebar-toggle-fab）；
// 「打开文件面板」按钮在 ChatView 与 ExtensionPanel 同层级、悬浮于 chatView 右上角（见 .panel-toggle-btn）。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/session'
import { useMessageStore } from '../../stores/message'
import { useSettingsStore } from '../../stores/settings'
import { downloadText, exportConversation } from '../../utils/export'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const session = useSessionStore()
const messages = useMessageStore()
const settings = useSettingsStore()

const exportOpen = ref(false)
const streamingRuns = computed(() => messages.activeRuns(session.activeId))

function doExport(format: 'md' | 'json') {
  const conversation = session.active
  if (!conversation) return
  const { filename, content } = exportConversation(
    conversation,
    messages.list(session.activeId),
    format,
  )
  downloadText(filename, content)
  exportOpen.value = false
}
</script>

<template>
  <header class="chat-header">
    <div class="chat-header-inner">
      <div class="chat-title">
        <span class="conv-title">{{ session.active?.title ?? t('app.title') }}</span>
        <span class="model-chip">
          {{ settings.model === 'qwen' ? t('chat.modelLocal') : t('chat.modelCloud') }}
        </span>
        <span v-if="settings.demoMode" class="demo-chip">{{ t('chat.demoMode') }}</span>
        <span v-if="streamingRuns.length > 0" class="status">{{ t('status.connecting') }}</span>
        <span
          v-else-if="settings.connection === 'reconnecting' || settings.connection === 'connecting'"
          class="status"
        >
          {{ t('status.reconnecting') }}
        </span>
      </div>
      <div class="header-actions">
        <div class="export-wrap">
          <button
            type="button"
            class="header-icon-btn"
            :title="t('chat.export')"
            @click.stop="exportOpen = !exportOpen"
          >
            <Icon name="download" :size="15" />
          </button>
          <div v-if="exportOpen" class="export-menu">
            <button type="button" @click="doExport('md')">Markdown</button>
            <button type="button" @click="doExport('json')">JSON</button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <div v-if="exportOpen" class="menu-mask" @click="exportOpen = false" />
</template>
