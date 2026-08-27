<script setup lang="ts">
// 聊天内容体：重连提示、空状态、虚拟滚动消息列表、流式渲染尾条与"回到最新"按钮。
// 暴露 scrollToBottom()（发送消息后强制回到底部）；滚动容器就绪/内容变化时通过
// scroller-ready / content-changed 事件通知外层 OverlayScrollArea 更新悬浮滚动条。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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

const { t } = useI18n()
const session = useSessionStore()
const messages = useMessageStore()
const settings = useSettingsStore()
const ui = useUiStore()

// 事件：
// - scroller-ready：虚拟滚动容器（DynamicScroller 根 .vue-recycle-scroller）就绪/销毁时上报 DOM，
//   外层 OverlayScrollArea 以此作为滚动条 target（响应式更新，解决异步加载时序问题）。
// - content-changed：消息内容（长度/文本/流式）变化后通知外层刷新悬浮滑块位置。
const emit = defineEmits<{
  (e: 'scroller-ready', el?: HTMLElement): void
  (e: 'content-changed'): void
}>()

const scroller = ref<{
  scrollToItem(index: number, options?: ScrollToOptions): void
  $el: HTMLElement
}>()
const pinned = ref(true)

let scrollEl: HTMLElement | null = null
// 流式期间的 rAF 贴底循环句柄：DynamicScroller 是动态高度虚拟滚动，
// item 真实高度在渲染后由 ResizeObserver 下一帧才测量更新，单次
// scrollTop=scrollHeight 会停在旧高度，循环可保证始终贴住真实底部。
let pinRafId = 0

function startPinLoop() {
  if (pinRafId || !pinned.value || !scrollEl) return
  const tick = () => {
    pinRafId = 0
    if (!pinned.value || !scrollEl) return
    scrollEl.scrollTop = scrollEl.scrollHeight
    pinRafId = requestAnimationFrame(tick)
  }
  pinRafId = requestAnimationFrame(tick)
}

function stopPinLoop() {
  if (pinRafId) {
    cancelAnimationFrame(pinRafId)
    pinRafId = 0
  }
}

const activeId = computed(() => session.activeId)
const displayItems = computed<ChatMessage[]>(() => [...messages.list(activeId.value)])
const streamingRuns = computed(() => messages.activeRuns(activeId.value))

watch(
  activeId,
  async (id) => {
    // 切换会话：重置贴底状态；消息加载完毕后默认滚动到底部
    pinned.value = true
    if (!id) return
    await messages.load(id)
    // 等虚拟滚动容器渲染、scrollEl 绑定完成（scroller 的 watch 为 post flush，
    // 在 nextTick 回调之前已执行），再强制贴底
    await nextTick()
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
  },
  { immediate: true },
)

function onScroll(event: Event) {
  const el = event.target as HTMLElement
  pinned.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 120
  // 用户上滚脱离贴底：停止流式贴底循环（下一帧起不再强制回底）
  if (!pinned.value) stopPinLoop()
}

// 虚拟滚动容器就绪/销毁时：
// 1) 手动绑定 scroll（组件 @scroll 不会转发到内部根元素 —— inheritAttrs:false，此前贴底判断从未执行）；
// 2) 上报容器给外层 OverlayScrollArea 作为滚动条 target。
watch(
  scroller,
  (s) => {
    if (scrollEl) scrollEl.removeEventListener('scroll', onScroll)
    scrollEl = (s?.$el as HTMLElement | undefined) ?? null
    if (scrollEl) scrollEl.addEventListener('scroll', onScroll, { passive: true })
    emit('scroller-ready', scrollEl ?? undefined)
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  stopPinLoop()
  if (scrollEl) scrollEl.removeEventListener('scroll', onScroll)
  scrollEl = null
})

watch(
  () =>
    displayItems.value.length +
    (displayItems.value.at(-1)?.text ?? '').length +
    streamingRuns.value.reduce((sum, run) => sum + run.text.length, 0),
  async () => {
    // 内容变化（含流式增长）：通知外层刷新悬浮滑块（上滚脱离贴底时 scrollTop 不变，需手动 sync）
    emit('content-changed')
    if (!pinned.value) return
    if (streamingRuns.value.length > 0) {
      // 流式期：item 高度每帧异步测量，由 rAF 循环持续贴底
      startPinLoop()
      return
    }
    await nextTick()
    // 直接将 scrollTop 设为 scrollHeight，绕过 virtual scroller 的
    // scrollToItem 索引计算（虚拟滚动中 item 高度尚未 layout 时会被下一次的 render
    // 覆盖回旧的偏移，表现为「滚到底但没真的到底」）
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
  },
)

// SSE 推流结束（run 全部完成/停止）：停止贴底循环，内容最终落地后补一次贴底
watch(
  () => streamingRuns.value.length,
  (count, prev) => {
    if (count === 0 && prev > 0) {
      stopPinLoop()
      emit('content-changed')
      if (pinned.value && scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
    }
  },
)

function scrollToBottom() {
  pinned.value = true
  if (streamingRuns.value.length > 0) {
    // 流式仍在进行：恢复 rAF 贴底循环
    startPinLoop()
    return
  }
  void nextTick(() => {
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
  })
}
// 暴露 scroller：外层 OverlayScrollArea 通过 target 绑定滚动容器，绘制悬浮滚动条
defineExpose({ scrollToBottom, scroller })

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
  <!-- 统一内容容器：外层 OverlayScrollArea 包裹本组件 + 输入框，滚动条轨道覆盖整个 chat 区域 -->
  <div class="chat-content">
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

    <!-- 消息滚动区：flex:1 占据输入框以上空间，原生滚动条隐藏，滚动条视觉由外层 OverlayScrollArea 绘制 -->
    <div v-if="displayItems.length > 0" class="message-scroll">
      <DynamicScroller
        ref="scroller"
        class="message-list"
        :items="displayItems"
        :min-item-size="64"
      >
        <template #default="{ item, index, active }">
          <DynamicScrollerItem :item="item" :active="active" :data-index="index">
            <div class="message-inner">
              <MessageItem :message="item" />
            </div>
          </DynamicScrollerItem>
        </template>
      </DynamicScroller>
    </div>

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

    <!-- 滚动到底部的按钮 -->
    <button
      v-if="!pinned && displayItems.length > 0"
      type="button"
      class="scroll-bottom"
      :title="t('chat.scrollToLatest')"
      @click="scrollToBottom"
    >
      ↓
    </button>
  </div>
</template>
