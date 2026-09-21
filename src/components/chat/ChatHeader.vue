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
import { useUiStore } from '../../stores/ui'
import { downloadText, exportConversation } from '../../utils/export'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const session = useSessionStore()
const messages = useMessageStore()
const settings = useSettingsStore()
const ui = useUiStore();

const exportOpen = ref(false)
const streamingRuns = computed(() => messages.activeRuns(session.activeId))
// MSG-2870 DEBT-592：连链稳判定——connected/resync（订阅在——run 终帧
// 可达——思考中文案成立）；reconnecting/connecting/idle（订阅断重建中
// ——run 终帧缺源——卡死诚实报断面）
const connStable = computed(
  () =>
    settings.connection === 'connected' || settings.connection === 'resync',
)

function doExport(format: 'md' | 'json') {
  const conversation = session.active
  if (!conversation) return
  const { filename, content } = exportConversation(
    conversation,
    messages.list(session.activeId),
    format,
  )
  // MSG-3263 ②：导出**必须有回显**——成功报「文件名＋去哪儿找」，失败报明确原因（禁静默）
  try {
    const done = downloadText(filename, content)
    ui.toast(t('chat.exportDone', { name: done.filename, dir: done.hint }), 'success')
  } catch (error) {
    ui.toast(
      t('chat.exportFailed', { msg: error instanceof Error ? error.message : String(error) }),
      'error',
    )
  }
  exportOpen.value = false
}
</script>

<template>
  <header class="chat-header">
    <div class="chat-header-inner">
      <div class="chat-title">
        <span class="conv-title">{{ session.active?.title ?? t('app.title') }}</span>
        <span class="model-chip">
          {{
            settings.model === 'deepseek-v4-flash'
              ? t('chat.modelFlash')
              : t('chat.modelPro')
          }}
        </span>
        <span v-if="settings.demoMode" class="demo-chip">{{ t('chat.demoMode') }}</span>
        <!-- MSG-2722 L3 编程 UI：编程模式徽标（ui.programmingMode——toolchain
            任务态随动） -->
        <span v-if="ui.programmingMode" class="prog-chip">{{ t('chat.programModeOn') }}</span>
        <!-- MSG-2870 DEBT-592 分槽（勘案 🔴 即改）：streaming 勿借
             connecting 槽——run 在飞且连链稳 → 「思考中…」（chat.
             activityThinking——573 文案并目）；run 在飞但连链断（订阅断
             重建——终帧缺源）→ 诚实报断可重试（勿思考中永卡——
             chat.runInterrupted）；真连链态（无 run）→ 重连中 -->
        <span v-if="streamingRuns.length > 0 && connStable" class="status">{{
          t('chat.activityThinking')
        }}</span>
        <span v-else-if="streamingRuns.length > 0 && !connStable" class="status warn">{{
          t('chat.runInterrupted')
        }}</span>
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
