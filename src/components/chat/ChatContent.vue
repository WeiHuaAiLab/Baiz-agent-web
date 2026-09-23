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
import { useApprovalStore } from '../../stores/approval'
import { getBridge } from '../../bridge'
import type { ChatMessage, RunState } from '../../models'
import MessageItem from './MessageItem.vue'
// MSG-3513 并上游 1712993：工具调用折叠组（`StreamingMarkdownView` 我方第 24 行已 import
// 同径 ⇒ **不重复引入**，否则重复 import 报错）
import ToolCallGroup from './ToolCallGroup.vue'
import SkeletonChatView from './SkeletonChatView.vue'
// MSG-3335 G-4：RunBlocks 随 kind 分发迁入 chat/message/（本件随迁改 import，行为零改）
import RunBlocks from './message/RunBlocks.vue'
import StreamingMarkdownView from '../markdown/StreamingMarkdownView.vue'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const session = useSessionStore()
const messages = useMessageStore()
const settings = useSettingsStore()
const ui = useUiStore()
const approvals = useApprovalStore()

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

/**
 * MSG-3236 ②：定位一律走**组件 API**（`scrollToItem`），**禁直写 `scrollTop`**
 *（直写绕过 virtual scroller 的高度记账 ⇒ 定位不稳/回旧偏移——定位件原话）。
 */
function scrollToItemIndex(index: number, align: 'start' | 'end' | 'center' | 'nearest' = 'end') {
  if (index < 0) return
  scroller.value?.scrollToItem(index, { align } as ScrollToOptions)
}

function scrollToLatest() {
  scrollToItemIndex(displayItems.value.length - 1, 'end')
}

function startPinLoop() {
  if (pinRafId || !pinned.value) return
  const tick = () => {
    pinRafId = 0
    if (!pinned.value) return
    scrollToLatest()
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
/** MSG-3236 ①：未决审批卡（`kind==='approval'` 且未决）——判定与展示分离 */
function isPendingApproval(m: ChatMessage): boolean {
  return m.kind === 'approval' && m.meta?.approved === undefined
}
/**
 * MSG-3236 ①：未决卡**脱离虚拟滚动复用**——虚拟列表只收普通消息，
 * 未决卡改由常驻区渲染（DOM 常在＋稳定 id/data-*）⇒ UIA／自动化可稳定命中「同意/拒绝」。
 */
const pendingApprovals = computed<ChatMessage[]>(() =>
  messages.list(activeId.value).filter(isPendingApproval),
)

const streamingRuns = computed(() => messages.activeRuns(activeId.value))

/** 连续工具调用折叠组：≥ TOOL_GROUP_MIN 条连续 tool_call 在收束后合并成一个虚拟 item */
interface ToolGroup {
  id: string
  kind: 'tool-group'
  /** 摘要文本（工具名去重）：与 ChatMessage.text 同形，让 size 依赖 / 贴底签名
   *  的取值表达式对两种 item 无需分支 */
  text: string
  messages: ChatMessage[]
}

type DisplayItem = ChatMessage | ToolGroup

function isToolGroup(item: DisplayItem): item is ToolGroup {
  return item.kind === 'tool-group'
}

// 折叠门槛：连续 tool_call ≥ 3 条才收起（不足则逐条散开，行为与既有会话完全一致）
const TOOL_GROUP_MIN = 3

/** 「思考完毕」判定：该 tool_call 所属 run 是否已收束（不再 running/queued）。
 *  未收束 = 流式进行中 —— 此时保持逐条散开（尾流期不折叠，让用户看到实时操作）；
 *  run 已被 trim 或从未登记（从 DB 载入的历史消息）一律视为已收束。 */
function isRunSettled(taskId?: string): boolean {
  if (!taskId) return true
  const run = messages.runs[taskId]
  if (!run) return true
  return run.status !== 'running' && run.status !== 'queued'
}

/** 折叠组摘要：工具名去重保序（同一工具反复调用时不重复堆字） */
function summarizeTools(items: ChatMessage[]): string {
  const names = items
    .map((message) => message.meta?.toolName)
    .filter((name): name is string => !!name)
  return [...new Set(names)].join(' · ')
}

/**
 * **MSG-3513 合流**（我方 `MSG-3236` ① ＋ 上游 `1712993`「连续工具调用折叠」）：
 * 源＝消息流**去掉未决审批卡**（未决卡走常驻区，见 `pendingApprovals`）
 * ⇒ 再对剩余流做「同 run 连续 `tool_call` ≥ `TOOL_GROUP_MIN` ⇒ 折成一个 `ToolGroup`」。
 * **两侧合取并集**：我方"审批卡常驻区"与上游"工具链折叠"语义各自保留，**零丢弃**。
 */
const displayItems = computed<DisplayItem[]>(() => {
  const source = messages.list(activeId.value).filter((m) => !isPendingApproval(m))
  const out: DisplayItem[] = []
  let buffer: ChatMessage[] = []

  const flush = () => {
    const head = buffer[0]
    // 段内必定同 run（下方断组保证），故只需看首条所属 run 是否收束
    if (head && buffer.length >= TOOL_GROUP_MIN && isRunSettled(head.meta?.taskId)) {
      // id 由首条消息 id 派生：段尾追加新条目时 id 不变，虚拟列表不重建
      out.push({
        id: `tg:${head.id}`,
        kind: 'tool-group',
        text: summarizeTools(buffer),
        messages: buffer,
      })
    } else {
      out.push(...buffer)
    }
    buffer = []
  }

  for (const message of source) {
    if (message.kind === 'tool_call') {
      // 同一 run 的连续 tool_call 才归一组：换 run 即断组——否则「上一个 run
      // 已完成、下一个 run 还在跑」两段相邻时会被并成一段，导致已收束的那半
      // 也一直不折叠（违背「已完成的默认折叠」）
      if (buffer.length > 0 && buffer[0]?.meta?.taskId !== message.meta?.taskId) flush()
      buffer.push(message)
      continue
    }
    flush()
    out.push(message)
  }
  flush()
  return out
})

// 折叠组展开态：默认收起（「思考完毕后」自动折叠，用户点击可展开）。
// 存父层而非组组件内部——DynamicScroller 会回收 item 组件，
// 状态若存组件内，滚出视口再滚回来就丢了。
const groupExpanded = ref<Record<string, boolean>>({})

function isGroupExpanded(id: string): boolean {
  return groupExpanded.value[id] === true
}

function toggleGroup(id: string) {
  groupExpanded.value = { ...groupExpanded.value, [id]: !groupExpanded.value[id] }
  // 整组展开/收起是高度突变，且组内工具行的高度还要等 ResizeObserver 落地——
  // 交给贴底循环吸收「展开 → 重测 → 落定」的多跳；非吸附态不动，尊重阅读位置
  if (pinned.value) startPinLoop()
}

/** size 依赖（v3 已 deprecated，ResizeObserver 才是正路）：仅保证两种 item 都取得到值 */
function sizeDeps(item: DisplayItem): unknown[] {
  if (isToolGroup(item)) return [item.messages.length, isGroupExpanded(item.id)]
  return [item.text, item.meta?.taskId, item.meta?.attachments?.length, item.meta?.streaming]
}

// MSG-3233 ④：消息加载态——**加载中且消息为空**时盖骨架（免空帧闪 empty-state）
const loadingMessages = ref(false)
/**
 * main f793908 口径（本令摘段移植）：加载中＝`byConversation[id] === undefined`。
 * 与「加载完且为空」区分——后者说明这是**合法空会话**（用户清空了消息），应走
 * empty-state 而不是骨架屏。只按 displayItems === 0 判会把骨架吞成空态（反向亦然）。
 * 我方保留条件：未决审批卡常驻区在场时不盖骨架（见模板 v-if）。
 */
const isLoadingMessages = computed(() => {
  const id = activeId.value
  if (!id) return false
  // 两口径同时成立才盖骨架：
  //   ① 我方 MSG-3233 ④：load **在途**（loadingMessages，可被测试显式控制起止）；
  //   ② main f793908：数据**尚未载入**（`byConversation[id] === undefined`）。
  // 只留 ① 会在「键已存在但为空」的合法空会话上误盖骨架（main 新增用例 B 反证）；
  // 只留 ② 会在 load 已收口但键仍缺（如 load 被替身/失败）时永远盖着（我方 MSG-3233 ③ 反证）。
  return loadingMessages.value && messages.byConversation[id] === undefined
})

watch(
  activeId,
  async (id) => {
    // 切换会话：重置贴底状态；消息加载完毕后默认滚动到底部
    pinned.value = true
    // 折叠组展开态随会话切换重置：id 派生自消息，跨会话残留只会是死键
    groupExpanded.value = {}
    if (!id) return
    loadingMessages.value = true
    try {
      await messages.load(id)
    } finally {
      loadingMessages.value = false
    }
    // 等虚拟滚动容器渲染、scrollEl 绑定完成（scroller 的 watch 为 post flush，
    // 在 nextTick 回调之前已执行），再强制贴底
    await nextTick()
    // MSG-3236 ②：走组件 API（索引定位），禁直写 scrollTop
    scrollToLatest()
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
    scrollToLatest()
  },
)

// SSE 推流结束（run 全部完成/停止）：停止贴底循环，内容最终落地后补一次贴底
watch(
  () => streamingRuns.value.length,
  (count, prev) => {
    if (count === 0 && prev > 0) {
      stopPinLoop()
      emit('content-changed')
      if (pinned.value) scrollToLatest()
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
    scrollToLatest()
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

    <!-- 标准 v1.0 §C B5：`pending_total` 角标＋常驻入口——「另有 N 张卡」 -->
    <button
      v-if="approvals.badgeCount > 0"
      type="button"
      class="approval-banner"
      @click="ui.openInbox()"
    >
      <Icon name="inbox" :size="14" />
      {{ t('approval.inboxBanner', { n: approvals.badgeCount }) }}
    </button>

    <!-- MSG-3233 ④：加载中且空 ⇒ 骨架；否则走空态（两者互斥） -->
    <SkeletonChatView
      v-if="
        isLoadingMessages &&
        displayItems.length === 0 &&
        pendingApprovals.length === 0 &&
        streamingRuns.length === 0
      "
    />
    <div
      v-else-if="
        displayItems.length === 0 && pendingApprovals.length === 0 && streamingRuns.length === 0
      "
      class="empty-state"
    >
      <p class="empty">{{ t('chat.empty') }}</p>
      <button type="button" class="empty-start" @click="ui.openCreate('session')">
        {{ t('chat.emptyStart') }}
      </button>
    </div>

    <!-- MSG-3236 ①：未决审批卡常驻区（**独立于虚拟滚动**，与消息流并存）
         —— 稳定 id/data-* ⇒ UIA／自动化可稳定命中「同意/拒绝」 -->
    <div v-if="pendingApprovals.length" class="pending-approvals" data-uia="pending-approvals">
      <div
        v-for="card in pendingApprovals"
        :key="card.id"
        class="pending-approval-slot"
        :id="`approval-${card.meta?.requestId ?? card.id}`"
        :data-approval-request-id="card.meta?.requestId ?? ''"
        data-uia="pending-approval"
      >
        <MessageItem :message="card" />
      </div>
    </div>

    <div v-if="displayItems.length > 0" class="message-scroll">
      <DynamicScroller
        ref="scroller"
        class="message-list"
        :items="displayItems"
        :min-item-size="64"
      >
        <template #default="{ item, index, active }">
          <DynamicScrollerItem
            :item="item"
            :active="active"
            :data-index="index"
            :size-dependencies="sizeDeps(item)"
          >
            <div class="message-inner">
              <!-- 收束后的长工具链收成一个虚拟 item；展开体仍是逐条 MessageItem -->
              <ToolCallGroup
                v-if="isToolGroup(item)"
                :messages="item.messages"
                :expanded="isGroupExpanded(item.id)"
                @toggle="toggleGroup(item.id)"
              />
              <MessageItem v-else :message="item" />
            </div>
          </DynamicScrollerItem>
        </template>
      </DynamicScroller>
    </div>

    <div v-if="streamingRuns.length" class="streaming-tail" @click="onStreamingClick">
      <div v-for="run in streamingRuns" :key="run.taskId" class="msg assistant streaming-block">
        <!-- MSG-2998 修②（DEBT-544 目二）：三分离归组——思考/执行命令/
             执行结果各自成区（流式态与终态同构，RunBlocks 两态一源） -->
        <RunBlocks :run="run" streaming />
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
  </div>
</template>