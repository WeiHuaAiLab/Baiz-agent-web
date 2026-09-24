<script setup lang="ts">
// 聊天内容体：重连提示、空状态、骨架屏（加载占位）、虚拟滚动消息列表、流式渲染尾条与"回到最新"按钮。
// 暴露 scrollToBottom()（发送消息后强制回到底部）+ unpin()（外部主动解除流式贴底）。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../../stores/session'
import { useMessageStore, isRunTerminal } from '../../stores/message'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'
import { getBridge } from '../../bridge'
import type { ChatMessage, RunState } from '../../models'
import MessageItem from './MessageItem.vue'
import ToolCallGroup from './ToolCallGroup.vue'
import StreamingMarkdownView from '../markdown/StreamingMarkdownView.vue'
import SkeletonChatView from './SkeletonChatView.vue'

const { t } = useI18n()
const session = useSessionStore()
const messages = useMessageStore()
const settings = useSettingsStore()
const ui = useUiStore()

// 历史上 ChatContent 向外层 OverlayScrollArea 上报 scroller-ready / content-changed 用于绘制
// 悬浮滚动条；v2 起 OverlayScrollArea 退化为普通容器（性能优先），这两个事件无接收方，
// 故移除。如未来需要再次「主动通知外层某事件」再考虑重新引入。

const scroller = ref<{
  scrollToItem(index: number, options?: ScrollToOptions): void
  $el: HTMLElement
}>()
// 贴底（跟随）状态 =「用户是否还想跟着底部走」，只能由用户手势置 false。
// 为什么不看滚动位置：写 scrollTop 的不止用户——① 本文件的贴底循环；
// ② DynamicScroller 在 item 尺寸变化后按「逻辑位置」恢复 scrollTop
//    （useDynamicScroller 里 flush:post 的 watcher，还会 dispatch 合成 scroll 事件）；
// ③ 内容收缩时浏览器把 scrollTop clamp 回去。
// 旧实现把「离底部 > 120px」当解除信号，于是上面任一次程序写入都会把 pinned
// 打成 false 并停掉循环，而此后没有任何代码路径把它置回 true —— 流式尾条就永久
// 停在视口下方（实测：一次程序写入后 gap 只增不减，内容再长视图也不动）。
// 现在：scroll 事件只在「用户手势窗内」参与解除判定；任何原因触底都重新吸附。
const pinned = ref(true)
// 「真的到底」容差：吸附态下 scrollTop 被 clamp 到整数像素，留 8px 抗 DPR 取整
const BOTTOM_EPS = 8
// 手势内「回到吸附带」容差：滚轮一格 ~100px，要用户贴到 8px 内不现实。
// 沿用旧的 120px 阈值，但它现在只对手势生效，程序写入撞不进这个判定
const REARM_PX = 120
// 用户手势有效期：wheel / touch / 键盘翻页 / 拖悬浮滑块之后这么久内的 scroll
// 事件才可能是「人滚的」，窗口外的一律视为程序写入
const GESTURE_MS = 250
// 贴底循环的静默预算（帧）：流式进行中常驻；流式结束后再跑这么多帧，
// 吸收「尾条下线 → 真实消息上线」时 item 高度「估计值 → 实测值」的两跳，之后自动退出
const PIN_IDLE_FRAMES = 30

let scrollEl: HTMLElement | null = null
let gestureUntil = 0
let touchY: number | null = null
// 流式期间的 rAF 贴底循环句柄：DynamicScroller 是动态高度虚拟滚动，
// item 真实高度在渲染后由 ResizeObserver 下一帧才测量更新，单次
// scrollTop=scrollHeight 会停在旧高度，循环可保证始终贴住真实底部。
let pinRafId = 0
let pinIdle = PIN_IDLE_FRAMES

/* DynamicScroller 测量期遮罩：
   DynamicScroller 是「动态高度」虚拟滚动——item 真实高度要等渲染后 ResizeObserver
   异步测量才知道。在测量完成前，库的累积偏移是按 min-item-size 估的，第一个真
   实高度远超估值的 item 出现时，下一个 item 会按旧偏移叠上去——视觉上瞬间「文字
   内容重叠」。该库的固有视觉残影，无法只靠 CSS 修复。
   修法：在 DynamicScroller 同级盖一层 absolute 铺满的 mask（SkeletonChatView），
   把测量窗口期（~10 帧 ≈ 167ms）整体遮住，用户看不到「重叠」瞬间，只看到
   「骨架 → 真内容」过渡。同 DOM 结构（msg.user / msg.assistant + sk-line 宽度
   不同）保证落定不发生纵向位移。
   —— 不在流式期使用：流式期每个 token 都会触发 ResizeObserver 重新测量，如开启
     会一直盖着挡住用户看 tail；流式期 payload 增长的是「最后一条 run」，没有重叠
     问题（run 在 after 槽，不是 RecycleScroller 的标准 item）。 */
const showMeasurementOverlay = ref(false)
let measurementFrames = 0
let measurementRafId = 0
const MEASUREMENT_FRAMES = 10 // ~167ms @60Hz：覆盖库内 ResizeObserver + Vue nextTick 两阶段

function startMeasurementOverlay() {
  if (streamingRuns.value.length > 0) return
  if (measurementRafId) cancelAnimationFrame(measurementRafId)
  showMeasurementOverlay.value = true
  measurementFrames = 0
  const tick = () => {
    measurementFrames++
    if (measurementFrames >= MEASUREMENT_FRAMES) {
      showMeasurementOverlay.value = false
      measurementRafId = 0
      return
    }
    measurementRafId = requestAnimationFrame(tick)
  }
  measurementRafId = requestAnimationFrame(tick)
}

onBeforeUnmount(() => {
  if (measurementRafId) cancelAnimationFrame(measurementRafId)
})

function markGesture() {
  gestureUntil = performance.now() + GESTURE_MS
}

function atBottom(el: HTMLElement) {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - BOTTOM_EPS
}

function startPinLoop() {
  pinIdle = PIN_IDLE_FRAMES
  if (pinRafId || !pinned.value || !scrollEl) return
  const tick = () => {
    pinRafId = 0
    if (!pinned.value || !scrollEl) return
    // 已贴底就不写：写 scrollTop 会强制一次 layout、并派发 scroll 事件
    // （后者又驱动 OverlayScrollArea.sync），稳态下每帧白做一遍
    if (!atBottom(scrollEl)) scrollEl.scrollTop = scrollEl.scrollHeight
    // 流式进行中常驻（内容每 100ms 就在长）；流式结束后按静默预算自动退出
    if (streamingRuns.value.length === 0 && --pinIdle <= 0) return
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

/** 解除跟随（用户主动离开底部：上滚 / 拖悬浮滑块 / 键盘向上翻页） */
function unpin() {
  // 解除跟随（用户主动离开底部：上滚 / 键盘向上翻页）。
  // 注：v2 起 OverlayScrollArea 不再绘制悬浮滑块，拖悬浮滑块的解除路径已下线；
  // 仍保留此函数供外部（如 ChatView）需要时主动解除时调用。
  pinned.value = false
  stopPinLoop()
}

const activeId = computed(() => session.activeId)
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

/** 「思考完毕」判定：该 tool_call 所属 run 是否已收束（终态）。
 *  未收束 = 流式进行中 —— 此时保持逐条散开（尾流期不折叠，让用户看到实时操作）；
 *  run 已被 trim 或从未登记（从 DB 载入的历史消息）一律视为已收束。
 *  用终态黑名单而非 === 'running'：waiting_approval（审批等待期）仍是活 run
 *  ——该期间工具链不应折叠（与 activeRuns / stopRun 同源修复）。 */
function isRunSettled(taskId?: string): boolean {
  if (!taskId) return true
  const run = messages.runs[taskId]
  if (!run) return true
  return isRunTerminal(run.status)
}

/** 折叠组摘要：工具名去重保序（同一工具反复调用时不重复堆字） */
function summarizeTools(items: ChatMessage[]): string {
  const names = items
    .map((message) => message.meta?.toolName)
    .filter((name): name is string => !!name)
  return [...new Set(names)].join(' · ')
}

const displayItems = computed<DisplayItem[]>(() => {
  const source = messages.list(activeId.value)
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

// 「加载中」判定：当前 activeId 对应的消息列表尚未从 IndexedDB 载入
//（byConversation[id] === undefined）。
// 与"加载完且为空"区分：前者说明数据正在异步载入，应显示骨架屏（避免空帧闪
// empty-state）；后者说明这是合法空会话（用户清空了消息），应显示 empty-state。
// 为什么不看 displayItems：displayItems === 0 在两种情况下都成立，会把骨架屏吞掉。
const isLoadingMessages = computed(() => {
  const id = activeId.value
  if (!id) return false
  return messages.byConversation[id] === undefined
})

// 流式尾条思考过程折叠：默认展开（实时查看推理），reasoning 帧停止增长 2 秒后自动折叠，
// 用户点击 head 可手动切换；进入历史消息（无活跃 run）不参与此状态。
const reasoningShowMap = ref<Record<string, boolean>>({})
const reasoningTimers = new Map<string, number>()

function scheduleReasoningFold(taskId: string) {
  const existing = reasoningTimers.get(taskId)
  if (existing !== undefined) window.clearTimeout(existing)
  const timer = window.setTimeout(() => {
    reasoningShowMap.value = { ...reasoningShowMap.value, [taskId]: false }
    reasoningTimers.delete(taskId)
  }, 2000)
  reasoningTimers.set(taskId, timer)
}

watch(
  () => streamingRuns.value.map((run) => ({ id: run.taskId, reasoning: run.reasoning })),
  (runs) => {
    // 新帧到达：默认展开 + 重置自动折叠定时器
    for (const run of runs) {
      reasoningShowMap.value = { ...reasoningShowMap.value, [run.id]: true }
      scheduleReasoningFold(run.id)
    }
  },
  { deep: true, immediate: true },
)

// 折叠态判定：只要没被显式写成 false 就展开（流式期默认展开——实时可读）
function reasoningOpen(taskId: string): boolean {
  return reasoningShowMap.value[taskId] !== false
}

function toggleReasoning(taskId: string) {
  const current = reasoningShowMap.value[taskId]
  reasoningShowMap.value = { ...reasoningShowMap.value, [taskId]: !current }
  // 用户手动操作时取消自动折叠——手动展开就保持展开，折叠就保持折叠
  const timer = reasoningTimers.get(taskId)
  if (timer !== undefined) {
    window.clearTimeout(timer)
    reasoningTimers.delete(taskId)
  }
}

onBeforeUnmount(() => {
  for (const timer of reasoningTimers.values()) window.clearTimeout(timer)
  reasoningTimers.clear()
  streamingReasoningBodies.clear()
})

watch(
  activeId,
  async (id) => {
    // 切换会话：重置贴底状态；消息加载完毕后默认滚动到底部。
    // 注意：单次 scrollTop = scrollHeight 不能保证贴底成功——DynamicScroller 是动态高度
    // 虚拟滚动，item 真实高度靠 ResizeObserver 异步测量，初始 scrollHeight 只是「估计值」。
    // 用贴底循环代替：每帧检查 + 写入，直到真贴底（PIN_IDLE_FRAMES = 30 帧 ≈ 500ms
    // 足够覆盖 estimate → measure 的两跳）。流式期（如果切到正在切会立即发起流式）
    // 会自动转为常驻，不退。scroller watch 会在 scrollEl 就绪后补一次 startPinLoop，
    // 覆盖「messages.load 后 scrollEl 还没绑定」的时序差。
    pinned.value = true
    // 折叠组展开态随会话切换重置：id 派生自消息，跨会话残留只会是死键
    groupExpanded.value = {}
    if (!id) return
    await messages.load(id)
    startPinLoop()
  },
  { immediate: true },
)

function onScroll(event: Event) {
  const el = event.target as HTMLElement
  const gap = el.scrollHeight - el.clientHeight - el.scrollTop
  if (gap <= BOTTOM_EPS) {
    // 任何原因触底（贴底循环 / 手滚 / 拖滑块 / 库的定位恢复恰好落在底部）
    // 都算吸附——这是「跟随」唯一的重新武装点
    pinned.value = true
    return
  }
  // 非触底：只有用户手势窗内的滚动才代表「人主动离开底部」；
  // 窗口外的（贴底循环自身、虚拟列表的逻辑位置恢复、clamp）一律忽略，
  // 否则一次程序写入就能永久掐死贴底循环
  if (performance.now() > gestureUntil) return
  if (gap > REARM_PX) unpin()
  else if (!pinned.value) pinned.value = true
}

// —— 用户滚动手势：只登记意图，吸附判定统一收口在 onScroll ——
// 上滚要立即解除（不等 scroll 事件落地），否则当帧还会和贴底循环抢一次 scrollTop
function onWheel(event: WheelEvent) {
  markGesture()
  if (event.deltaY < 0) unpin()
}

function onTouchStart(event: TouchEvent) {
  markGesture()
  touchY = event.touches[0]?.clientY ?? null
}

function onTouchMove(event: TouchEvent) {
  markGesture()
  const y = event.touches[0]?.clientY
  // 手指下滑 = 内容上移 = 离开底部
  if (y !== undefined && touchY !== null && y > touchY + 2) unpin()
  if (y !== undefined) touchY = y
}

const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '])
// keydown 冒泡自滚动容器内的聚焦元素（容器本身不可聚焦，但翻页键会滚最近的祖先）
function onKeydown(event: KeyboardEvent) {
  if (!SCROLL_KEYS.has(event.key)) return
  markGesture()
  if (event.key === 'PageUp' || event.key === 'ArrowUp' || event.key === 'Home') unpin()
}

function detachScrollListeners() {
  if (!scrollEl) return
  scrollEl.removeEventListener('scroll', onScroll)
  scrollEl.removeEventListener('wheel', onWheel)
  scrollEl.removeEventListener('touchstart', onTouchStart)
  scrollEl.removeEventListener('touchmove', onTouchMove)
  scrollEl.removeEventListener('keydown', onKeydown)
}

// 虚拟滚动容器就绪/销毁时：
// 手动绑定 scroll 与滚动手势（组件 @scroll 不会转发到内部根元素 —— inheritAttrs:false，
// 此前贴底判断从未执行）；不再向上 emit scroller-ready（v2 起外层 OverlayScrollArea
// 不再监听 target）。
watch(
  scroller,
  (s) => {
    detachScrollListeners()
    scrollEl = (s?.$el as HTMLElement | undefined) ?? null
    if (scrollEl) {
      scrollEl.addEventListener('scroll', onScroll, { passive: true })
      scrollEl.addEventListener('wheel', onWheel, { passive: true })
      scrollEl.addEventListener('touchstart', onTouchStart, { passive: true })
      scrollEl.addEventListener('touchmove', onTouchMove, { passive: true })
      scrollEl.addEventListener('keydown', onKeydown)
      // 首次绑定常发生在「发送之后、首个 token 之前」：那一刻 onSubmitted 里的
      // startPinLoop 因 scrollEl 还没就绪而落空，这里补一次
      if (pinned.value && streamingRuns.value.length > 0) startPinLoop()
    }
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  stopPinLoop()
  detachScrollListeners()
  scrollEl = null
})

watch(
  () =>
    displayItems.value.length +
    (displayItems.value.at(-1)?.text ?? '').length +
    // reasoning 一并计入：流式尾条（含思考区）已移入滚动容器，其增长只改
    // scrollHeight、不改容器的 clientHeight，ResizeObserver 不会触发——
    // 这个签名变化是「通知外层重算滑块 + 启动贴底」的唯一信号源。
    // 只算正文长度的话，纯 reasoning 阶段（还没吐 token）就会掉链子。
    streamingRuns.value.reduce(
      (sum, run) => sum + run.text.length + (run.reasoning?.length ?? 0),
      0,
    ),
  () => {
    // 内容变化（含流式增长）：贴底统一交给循环（自带静默预算，会自我续期 / 退出）：
    // 非流式期也走它，因为虚拟列表的 item 高度同样是「下一帧才测量落地」的，
    // 一次性 scrollTop = scrollHeight 只会停在估计高度上（且会被下一次 render
    // 覆盖回旧偏移，表现为「滚到底但没真的到底」）
    if (pinned.value) startPinLoop()
  },
)

// SSE 推流结束（run 全部完成/停止）：不硬停循环——尾条下线、真实消息上线
// 还要经历「估计高度 → 实测高度」两次跳变，续期让贴底把这两跳一并吸收
watch(
  () => streamingRuns.value.length,
  (count, prev) => {
    if (count === 0 && prev > 0) {
      if (pinned.value) startPinLoop()
    }
  },
)

// 测量期遮罩触发：会话首次从「无消息」切到「有消息」（即 messages.load 完成、
// 初次进入可视区的那一帧）。displayItems 已计算完成、DynamicScroller 已经挂载、
// 但库内部 ResizeObserver 还在异步测每条 item 的真实高度——这窗口期内盖一层
// SkeletonChatView 避免「文字重叠」视觉残影外露。
// 注意：watcher 自身会触发 1+ 次（onSubmitted 后也会让 displayItems 增长），
// 函数内部有「已在跑 / 流式期跳过」双重短路，不会重复打开。
watch(
  () => displayItems.value.length,
  (len, prev) => {
    if (prev === 0 && len > 0) startMeasurementOverlay()
  },
)

// 流式 reasoning 局部贴底：.reasoning-body 是 max-height 220px 的滚动区，
// 思考过程逐帧追加时须保持底部跟随。与外层 ChatContent 主滚动区的贴底循环
// 一致——"在底部附近则软贴底，不在则不动"：
//   · 用户在底部（gap ≤ REASONING_PIN_EPS）→ scrollTop = scrollHeight，让最新追加可见
//   · 用户主动上滚查看更早内容（gap > EPS）→ 不动，尊重阅读位置，不打断追溯
// v-for 下多个活跃 run，用 taskId 索引各自的 reasoning-body 元素；
// 流式期 reasoningShowMap 控制展开/折叠，折叠→展开时也要贴底。
const streamingReasoningBodies = new Map<string, HTMLElement>()
const REASONING_PIN_EPS = 24

function setStreamingReasoningBody(taskId: string, el: unknown) {
  if (el instanceof HTMLElement) {
    streamingReasoningBodies.set(taskId, el)
  } else {
    streamingReasoningBodies.delete(taskId)
  }
}

watch(
  () =>
    streamingRuns.value.map((run) => ({
      id: run.taskId,
      reasoning: run.reasoning ?? '',
    })),
  (runs) => {
    // reasoning 文本变化（流式增长）：等 Vue 渲染 + 浏览器完成一次 layout 再读
    // scrollHeight（文本 wrap 是异步计算的，flush: post 后下一帧才稳定）。
    nextTick(() => {
      for (const run of runs) {
        const el = streamingReasoningBodies.get(run.id)
        if (!el || !run.reasoning) continue
        const gap = el.scrollHeight - el.clientHeight - el.scrollTop
        if (gap <= REASONING_PIN_EPS) {
          el.scrollTop = el.scrollHeight
        }
      }
    })
  },
  { flush: 'post' },
)

// 折叠→展开转换：v-show false→true 后容器从「无尺寸」回到「有尺寸」，
// 这一帧的 scrollHeight 就绪后直接贴底（用户手动展开通常是想看完整）
watch(
  () =>
    streamingRuns.value.map((run) => ({
      id: run.taskId,
      open: reasoningOpen(run.taskId),
    })),
  (runs, prev) => {
    const prevOpen = new Map(prev?.map((p) => [p.id, p.open]) ?? [])
    for (const run of runs) {
      if (!run.open) continue
      if (prevOpen.get(run.id) === true) continue // 一直展开着由 grow watcher 覆盖
      const el = streamingReasoningBodies.get(run.id)
      if (!el) continue
      nextTick(() => {
        el.scrollTop = el.scrollHeight
      })
    }
  },
  { flush: 'post' },
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
// 暴露 scrollToBottom（发送后回到底部）、unpin（外部主动解除流式贴底）。
// v2 起不再暴露 scroller（外层 OverlayScrollArea 已不监听 target）。
defineExpose({ scrollToBottom, unpin })

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

    <!-- 加载中：渲染骨架屏（MSG-2662）。宽度/间距与真实消息同款，落定后不发生纵向位移 -->
    <SkeletonChatView v-if="isLoadingMessages && displayItems.length === 0 && streamingRuns.length === 0" />

    <!-- 加载完且确认是空会话：empty-state 引导创建（合法空，不要用骨架屏替代） -->
    <div v-else-if="displayItems.length === 0 && streamingRuns.length === 0" class="empty-state">
      <p class="empty">{{ t('chat.empty') }}</p>
      <button type="button" class="empty-start" @click="ui.openCreate('session')">
        {{ t('chat.emptyStart') }}
      </button>
    </div>

    <!-- 有消息或有活跃流即出滚动容器：两者皆空时由上方分支接管 -->
    <div
      v-else
      class="message-scroll"
    >
      <DynamicScroller
        ref="scroller"
        class="message-list"
        :items="displayItems"
        :min-item-size="120"
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

        <!-- 流式尾条：走 RecycleScroller 的 after 槽（item-wrapper 之后的
             .vue-recycle-scroller__slot，仍在该滚动容器内），尾条因此成为滚动内容
             的一部分——scrollHeight 含其高度，贴底循环（scrollTop = scrollHeight）
             实时把它按在底部；OverlayScrollArea 的 target 就是这个容器，
             滑块长度/位置随之把尾条算进去，不再出现「内容长过容器、溢出到输入框」。 -->
        <template #after>
          <div v-if="streamingRuns.length" class="streaming-tail" @click="onStreamingClick">
            <div v-for="run in streamingRuns" :key="run.taskId" class="msg assistant">
              <!-- 运行态头部：与终态 AssistantMessage 的 .msg-head 同构同高
                   （终态左侧是「耗时」按钮、右侧是 26px 操作按钮；流式期左侧换成
                   活动文本、右侧留空），落定时头部高度不变、整块不发生纵向位移 -->
              <div class="msg-head">
                <span class="elapsed static streaming-status">
                  <span class="activity-dot" />
                  {{ activityText(run) }}
                </span>
              </div>

              <!-- MSG-2661 目④：reasoning 帧流式增量渲染——思考过程随帧长。
                   类名/结构与终态 RunReasoning 完全同源（同一套 .reasoning-block
                   样式），仅折叠态语义不同：流式期默认展开（实时可读），
                   2 秒无新帧自动折叠，终态则是默认折叠。 -->
              <div v-if="run.reasoning" class="reasoning-block">
                <button
                  type="button"
                  class="reasoning-head"
                  :class="{ open: reasoningOpen(run.taskId) }"
                  @click.stop="toggleReasoning(run.taskId)"
                >
                  <span class="reasoning-dots">⋯</span>
                  <span>{{ t('chat.deepThink') }}</span>
                  <span class="reasoning-toggle">{{ reasoningOpen(run.taskId) ? '▾' : '▸' }}</span>
                </button>
                <div
                  v-show="reasoningOpen(run.taskId)"
                  :ref="(el) => setStreamingReasoningBody(run.taskId, el)"
                  class="reasoning-body"
                >{{ run.reasoning }}</div>
              </div>

              <StreamingMarkdownView :text="run.text" />
              <span class="caret" />
            </div>
          </div>
        </template>
      </DynamicScroller>

      <!-- 测量期遮罩：DynamicScroller 第一次把消息渲染进可视区时，库内
           ResizeObserver 还在异步测各 item 的真实高度——这窗口期内盖一层
           轻量加载占位，避免「估计高度 → 实测高度」跳变造成的"文字
           重叠"视觉残影外露。startMeasurementOverlay 控制 10 帧（~167ms）
           后自动渐隐，库内测量已在该窗口内完成。流式期不进入。 -->
      <transition name="mask-fade">
        <div v-if="showMeasurementOverlay" class="measurement-mask"> </div>
      </transition>
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
