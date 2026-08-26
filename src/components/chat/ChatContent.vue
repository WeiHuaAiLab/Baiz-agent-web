<script setup lang="ts">
// 聊天内容体：重连提示、空状态、虚拟滚动消息列表、流式渲染尾条与"回到最新"按钮。
// 暴露 scrollToBottom() 供外层（发送消息后）强制回到底部。
import { computed, nextTick, ref, watch } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/session'
import { useMessageStore } from '../../stores/message'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'
import { getBridge } from '../../bridge'
import type { ChatMessage, RunState } from '../../models'
import MessageItem from './MessageItem.vue'
import StreamingMarkdownView from '../markdown/StreamingMarkdownView.vue'
import OverlayScrollArea from '../common/OverlayScrollArea.vue'

const { t } = useI18n()
const session = useSessionStore()
const messages = useMessageStore()
const settings = useSettingsStore()
const ui = useUiStore()

const scroller = ref<{
  scrollToItem(index: number, options?: ScrollToOptions): void
  $el: HTMLElement
}>()
const pinned = ref(true)

// overlay 滚动条容器：滑块视觉与同步逻辑已抽离到 OverlayScrollArea，
// 此处仅保留"是否贴底"的业务判断
const scrollArea = ref<InstanceType<typeof OverlayScrollArea>>()

const activeId = computed(() => session.activeId)
const displayItems = computed<ChatMessage[]>(() => [...messages.list(activeId.value)])
const streamingRuns = computed(() => messages.activeRuns(activeId.value))

watch(
  activeId,
  (id) => {
    if (id) void messages.load(id)
  },
  { immediate: true },
)

function onScroll(event: Event) {
  const el = event.target as HTMLElement
  pinned.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 120
}

watch(
  () =>
    displayItems.value.length +
    (displayItems.value.at(-1)?.text ?? '').length +
    streamingRuns.value.reduce((sum, run) => sum + run.text.length, 0),
  async () => {
    if (!pinned.value) return
    await nextTick()
    scroller.value?.scrollToItem(Math.max(0, displayItems.value.length - 1))
    scrollArea.value?.sync()
  },
)

function scrollToBottom() {
  pinned.value = true
  void nextTick(() => {
    scroller.value?.scrollToItem(Math.max(0, displayItems.value.length - 1))
    scrollArea.value?.sync()
  })
}
defineExpose({ scrollToBottom })

function activityText(run: RunState): string {
  const last = run.trace[run.trace.length - 1]
  if (last?.kind === 'tool.call') {
    return `${t('chat.activityTool')} ${last.toolName ?? ''}…`
  }
  if (last?.kind === 'tool.result') {
    return `${t('chat.activityToolDone')} ${last.toolName ?? ''}`
  }
  if (run.reasoning) return t('chat.activityThinking')
  return t('chat.activityGenerating')
}

// 捎修一宗（MSG-1434，偏离②在册）：流式期链接/复制按钮点击面——
// streaming-tail 容器事件委托，逻辑与现盘 MarkdownView.onClick 同源
// （done 后 MarkdownView 自带处理恢复；此处只补流式期间交互面）。
async function onStreamingClick(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a')
  if (anchor) {
    const href = anchor.getAttribute('href')
    if (href) {
      event.preventDefault()
      await getBridge().openExternal.open(href)
    }
    return
  }
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('.code-copy')
  if (!target) return
  const code = decodeURIComponent(target.dataset.code ?? '')
  try {
    await getBridge().clipboard.writeText(code)
    const original = target.textContent
    target.textContent = t('common.copied')
    setTimeout(() => {
      target.textContent = original
    }, 1200)
  } catch {
    /* clipboard unavailable */
  }
}
</script>

<template>
  <div
    v-if="
      !settings.demoMode &&
      (settings.connection === 'reconnecting' || settings.connection === 'connecting')
    "
    class="reconnect-banner"
  >
    {{ t('status.disconnectedReconnect') }}
  </div>

  <div v-if="displayItems.length === 0 && streamingRuns.length === 0" class="empty-state">
    <p class="empty">{{ t('chat.empty') }}</p>
    <button type="button" class="empty-start" @click="ui.openCreate('session')">
      {{ t('chat.emptyStart') }}
    </button>
  </div>

  
  <OverlayScrollArea
    v-if="displayItems.length > 0"
    ref="scrollArea"
    class="message-scroll"
    :target="scroller"
  >
    <DynamicScroller
      ref="scroller"
      class="message-list"
      :items="displayItems"
      :min-item-size="64"
      @scroll.passive="onScroll"
    >
      <template #default="{ item, index, active }">
        <DynamicScrollerItem :item="item" :active="active" :data-index="index">
          <div class="message-inner">
            <MessageItem :message="item" />
          </div>
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>
  </OverlayScrollArea>

  <div v-if="streamingRuns.length" class="streaming-tail" @click="onStreamingClick">
    <div v-for="run in streamingRuns" :key="run.taskId" class="msg assistant streaming-block">
      <div class="activity-line">
        <span class="activity-dot" />
        {{ activityText(run) }}
      </div>
      <StreamingMarkdownView :text="run.text" />
      <span class="caret" />
    </div>
  </div>

  <button
    v-if="!pinned && displayItems.length > 0"
    type="button"
    class="scroll-bottom"
    :title="t('chat.scrollToLatest')"
    @click="scrollToBottom"
  >
    ↓
  </button>
</template>
