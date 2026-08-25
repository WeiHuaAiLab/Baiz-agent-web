<script setup lang="ts">
// 聊天页头部：会话标题、模型/演示/连接状态徽标，右侧导出菜单与扩展面板（抽屉）开关按钮。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/session'
import { useMessageStore } from '../../stores/message'
import { useSettingsStore } from '../../stores/settings'
import { downloadText, exportConversation } from '../../utils/export'
import Icon from '../common/Icon.vue'

const props = withDefaults(
  defineProps<{
    /** 扩展面板（抽屉）当前是否打开；关闭时显示打开按钮 */
    panelOpen?: boolean
  }>(),
  { panelOpen: true },
)
const emit = defineEmits<{ (e: 'toggle-panel'): void }>()

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
      <button
        v-if="!props.panelOpen"
        type="button"
        class="icon-btn"
        :title="t('chat.openPanel')"
        @click="emit('toggle-panel')"
      >
        <Icon name="extesionPanel" :size="15" />
      </button>
      <div class="export-wrap">
        <button
          type="button"
          class="icon-btn"
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
  </header>

  <div v-if="exportOpen" class="menu-mask" @click="exportOpen = false" />
</template>
