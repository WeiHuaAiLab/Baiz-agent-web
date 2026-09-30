<script setup lang="ts"> 
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../../stores/session";
import { useMessageStore } from "../../stores/message";
import { useSettingsStore } from "../../stores/settings";
import { useUiStore } from "../../stores/ui";
import { useApprovalStore } from "../../stores/approval";
import { getBridge } from "../../bridge";
import type { ChatMessage, RunState } from "../../models";
import MessageItem from "./MessageItem.vue"; 
import { isPendingApproval, useDisplayItems } from "../../utils/displayItems";
import type { DisplayItem } from "../../utils/displayItems"; 
import ToolCallGroup from "./ToolCallGroup.vue";
import EmptyAndSkeletonChatView from "./EmptyAndSkeletonChatView.vue";
import ScrollScrubber from "./ScrollScrubber.vue"; 
import RunBlocks from "./message/RunBlocks.vue";
import ApprovalStack from "./message/ApprovalStack.vue";
import ActivityLine from "./ActivityLine.vue";
import StreamingMarkdownView from "../markdown/StreamingMarkdownView.vue";
import Icon from "../common/Icon.vue";

const { t } = useI18n();
const session = useSessionStore();
const messages = useMessageStore();
const settings = useSettingsStore();
const ui = useUiStore();
const approvals = useApprovalStore();

// 事件：
// - scroller-ready：虚拟滚动容器（DynamicScroller 根 .vue-recycle-scroller）就绪/销毁时上报 DOM，
//   外层 OverlayScrollArea 以此作为滚动条 target（响应式更新，解决异步加载时序问题）。
// - content-changed：消息内容（长度/文本/流式）变化后通知外层刷新悬浮滑块位置。
const emit = defineEmits<{
    (e: "scroller-ready", el?: HTMLElement): void;
    (e: "content-changed"): void;
}>();

const scroller = ref<{
    scrollToItem(index: number, options?: ScrollToOptions): void;
    scrollToBottom(): void;
    $el: HTMLElement;
}>();
const pinned = ref(true);

/** 滚动容器（DynamicScroller.$el）— ref 化便于 ScrollScrubber 挂接 + 父层使用 */
const scrollEl = ref<HTMLElement | null>(null);
// 内容高度观测：MessageItem 的 markdown/代码块等**异步渲染**会在加载完成后
// 继续改变内容总高度（watch 签名只看 text 长度，看不到纯高度变化）——
// ResizeObserver 监听滚动容器与内容 wrapper 的高度变化，贴底态下补一轮
// 有限贴底，保证高度全部落定后真正贴住底部。
let contentRo: ResizeObserver | null = null;
// 流式期间的 rAF 贴底循环句柄：DynamicScroller 是动态高度虚拟滚动，
// item 真实高度在渲染后由 ResizeObserver 下一帧才测量更新，单次
// scrollTop=scrollHeight 会停在旧高度，循环可保证始终贴住真实底部。
let pinRafId = 0;

/**
 * MSG-3236 ②：定位一律走**组件 API**（`scrollToItem`），**禁直写 `scrollTop`**
 *（直写绕过 virtual scroller 的高度记账 ⇒ 定位不稳/回旧偏移——定位件原话）。
 */
function scrollToItemIndex(
    index: number,
    align: "start" | "end" | "center" | "nearest" = "end",
) {
    if (index < 0) return;
    scroller.value?.scrollToItem(index, { align } as ScrollToOptions);
}

function scrollToLatest() {
    markProgrammaticPin();
    scrollToItemIndex(displayItems.value.length - 1, "end");
}

// 程序贴底时间戳：onScroll 据此区分「程序滚动引发的 scroll 事件」与用户滚动
//（详见 onScroll 注释——流式期 pinned 误杀是贴底循环自杀的根因）
let lastProgrammaticPinAt = 0;

function markProgrammaticPin() {
    lastProgrammaticPinAt = performance.now();
}

function startPinLoop() {
    if (pinRafId || !pinned.value) return;
    const tick = () => {
        pinRafId = 0;
        if (!pinned.value) return;
        if (streamingRuns.value.length > 0) {
            // 流式期尾流（streaming-tail）已迁入 DynamicScroller 的 #after 槽位——
            // scrollToItem 只能定位到最后一个 item 的底边，尾流在其下方会被留在屏外。
            // 改走库内 scrollToBottom()：内部循环 scrollTop=scrollHeight+5000 直到
            // 测量队列稳定，天然覆盖 after 槽位内容（库内自管高度记账，非外直写）。
            scroller.value?.scrollToBottom();
        } else {
            scrollToLatest();
        }
        // 本帧发生了程序滚动——onScroll 时间窗判据（见 onScroll）
        markProgrammaticPin();
        pinRafId = requestAnimationFrame(tick);
    };
    pinRafId = requestAnimationFrame(tick);
}

function stopPinLoop() {
    if (pinRafId) {
        cancelAnimationFrame(pinRafId);
        pinRafId = 0;
    }
}

/** 用户交互型高度变化的贴底抑制：折叠块（工具组/思考/命令/结果/工具行）展开或
 *  收起会增高内容——RO 视角与流式增长同形，回调参数区分不了来源。但此类变化
 *  源于用户在阅读位置上的**主动点击**，强制贴底等于把视口拽走（体验为「点一下
 *  折叠头、整页跳到底」）。窗口期内 RO／settle 的贴底分支跳过；流式新帧到达仍
 *  照常贴底（真内容增长优先级高于抑制）。 */
const PIN_SUPPRESS_MS = 800;
let pinSuppressUntil = 0;

function suppressPin() {
    pinSuppressUntil = performance.now() + PIN_SUPPRESS_MS;
}

function isPinSuppressed(): boolean {
    return performance.now() < pinSuppressUntil;
}

/** 折叠头点击（捕获阶段事件委托）：命中任一已知折叠头 ⇒ 抑制贴底并停循环。
 *  RunBlocks／ToolRow 的折叠态在组件内部、不上报父层——委托监听免穿组件逐个
 *  接线；后续新折叠头只需把选择器补进列表。 */
const COLLAPSIBLE_HEAD_SELECTOR =
    ".tool-group-head, .reasoning-head, .block-head, .tool-main";

function onCollapsibleHeadClick(event: Event) {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.(COLLAPSIBLE_HEAD_SELECTOR)) {
        suppressPin();
        // 流式期 rAF 循环可能在跑：先停——是否回贴由「下一帧新内容」决定，
        // 而非本次点击引起的高度重排
        stopPinLoop();
    }
}

// 有限贴底循环的自动停止定时器
let pinStopTimer = 0;

/** 「非贴底」自动恢复倒计时（用户主动滚动脱离贴底后，N ms 内未滚回底部也
 *  未再滚动 ⇒ 恢复程序贴底模式）。仅流式思考期生效——非流式期已无新内容
 *  要追，强制拉底会破坏阅读位置；只翻标志位（pinned=true），让下一次内容
 *  增长时自然贴底。N=10s 是用户口径（避免短时间打扰阅读，也不让用户「忘记
 *  自己在看旧内容」太久而错过新流式增量）。 */
const UNPIN_RESTORE_MS = 10_000;
let unpinRestoreTimer = 0;

function scheduleUnpinRestore() {
    // 非流式期不启倒计时（流式已结束，强拉底无意义且破坏阅读位置）；
    // 只翻 pinned 标志位，由后续内容变化 watch 走贴底
    if (streamingRuns.value.length === 0) {
        pinned.value = true;
        return;
    }
    if (unpinRestoreTimer) clearTimeout(unpinRestoreTimer);
    unpinRestoreTimer = setTimeout(() => {
        unpinRestoreTimer = 0;
        if (pinned.value) return; // 期间已被「滚回底部」分支提前恢复
        // 仍非贴底：恢复程序贴底（流式期下由 rAF 循环持续贴底）
        pinned.value = true;
        startPinLoop();
    }, UNPIN_RESTORE_MS);
}

function clearUnpinRestore() {
    if (unpinRestoreTimer) {
        clearTimeout(unpinRestoreTimer);
        unpinRestoreTimer = 0;
    }
}

// 首帧测量遮罩：DynamicScroller 第一次把消息渲染进可视区时，库内 ResizeObserver
// 还在异步测量各 item 的真实高度——「估计高度 → 实测高度」跳变会造成文字重叠等
// 视觉残影外露。此窗口期盖一层轻量加载占位遮蔽；10 帧（~167ms @60Hz）后库内
// 测量已完成，自动渐隐退场。流式期不进入（尾条常驻变化且 rAF 贴底循环在跑，
// 无首帧跳变问题，遮罩反而挡住流式输出）。
const startMeasurementOverlay = ref(false);
const measurementFading = ref(false);
let measurementRafId = 0;
let measurementFadeTimer = 0;

/** 撤下遮罩（立即，不渐隐）——流式开始/组件卸载时用 */
function hideMeasurementOverlayNow() {
    if (measurementRafId) {
        cancelAnimationFrame(measurementRafId);
        measurementRafId = 0;
    }
    if (measurementFadeTimer) {
        clearTimeout(measurementFadeTimer);
        measurementFadeTimer = 0;
    }
    measurementFading.value = false;
    startMeasurementOverlay.value = false;
}

/** 首帧测量遮罩：盖住 → 数 10 帧 → 渐隐 → 撤 DOM */
function runMeasurementOverlay() {
    // 流式期不进入；无消息也无需遮蔽
    if (streamingRuns.value.length > 0 || displayItems.value.length === 0)
        return;
    if (measurementRafId) cancelAnimationFrame(measurementRafId);
    if (measurementFadeTimer) clearTimeout(measurementFadeTimer);
    measurementFadeTimer = 0;
    measurementFading.value = false;
    startMeasurementOverlay.value = true;
    let frames = 0;
    const tick = () => {
        measurementRafId = 0;
        // 计数中途流式启动：立即撤下（内容持续变化，遮蔽会挡住流式输出）
        if (streamingRuns.value.length > 0) {
            hideMeasurementOverlayNow();
            return;
        }
        if (++frames >= 10) {
            // 测量窗口结束：渐隐（CSS opacity 过渡），过渡完撤 DOM
            measurementFading.value = true;
            measurementFadeTimer = setTimeout(() => {
                measurementFadeTimer = 0;
                hideMeasurementOverlayNow();
            }, 260);
            return;
        }
        measurementRafId = requestAnimationFrame(tick);
    };
    measurementRafId = requestAnimationFrame(tick);
}

/**
 * 有限时长贴底：DynamicScroller 的 item 真实高度渲染后由 ResizeObserver
 * 下一帧才测量，单次 scrollToLatest 会停在旧高度（"滚了但没到底"）。
 * 跑一小段 rAF 贴底循环吸收「渲染 → 测量 → 重排」多跳，时限到自动停；
 * 用户上滚脱离贴底（pinned=false）时循环自行退出，尊重阅读位置。
 */
function scrollToBottomWithSettle(duration = 400) {
    if (!pinned.value) return;
    startPinLoop();
    if (pinStopTimer) clearTimeout(pinStopTimer);
    pinStopTimer = setTimeout(() => {
        pinStopTimer = 0;
        stopPinLoop();
    }, duration);
}

const activeId = computed(() => session.activeId);
/**
 * MSG-3236 ①：未决卡**脱离虚拟滚动复用**——虚拟列表只收普通消息，
 * 未决卡改由常驻区渲染（DOM 常在＋稳定 id/data-*）⇒ UIA／自动化可稳定命中「同意/拒绝」。
 */
const pendingApprovals = computed<ChatMessage[]>(() =>
    messages.list(activeId.value).filter(isPendingApproval),
);

const streamingRuns = computed(() => messages.activeRuns(activeId.value));

/** 本 run 的未决审批卡：迁入尾流 RunBlocks 的审批卡容器（执行命令/执行结果之间） */
function approvalsOf(taskId: string): ChatMessage[] {
    return pendingApprovals.value.filter((m) => m.meta?.taskId === taskId);
}

/** 孤儿未决卡：不属于任何在跑 run（后台任务/历史遗留）——仍走常驻区兜底呈现 */
const orphanApprovals = computed<ChatMessage[]>(() => {
    const running = new Set(streamingRuns.value.map((run) => run.taskId));
    return pendingApprovals.value.filter(
        (m) => !m.meta?.taskId || !running.has(m.meta.taskId),
    );
});

/** 消息流展示分组（未决审批卡剥离＋工具链折叠，逻辑见 ./displayItems.ts——行数闸
 *  MSG-3417 基线件只准减不准增，故外迁新件）。工具组**附着**到该 run 落地的
 *  assistant 消息上，由 AssistantMessage 在过程区（深度思考/执行命令/审批卡/
 *  执行结果）之后、正文之前渲染——时间顺序复原；无落点（assistant 被删/失败径）
 *  ⇒ 组原位兜底渲染为独立 item，行为与旧版一致。 */
const {
    displayItems,
    isToolGroup,
    groupExpanded,
    isGroupExpanded,
    attachedGroupOf,
    attachedGroupExpanded,
    sizeDeps,
} = useDisplayItems();

function toggleGroup(id: string) {
    groupExpanded.value = {
        ...groupExpanded.value,
        [id]: !groupExpanded.value[id],
    };
    // 用户主动展开/收起：**不贴底**（抑制窗口吸收「展开 → 重测 → 落定」的多跳
    // 高度重排；流式新帧到达仍照常贴底，见 PIN_SUPPRESS_MS 注释）
    suppressPin();
    stopPinLoop();
}

/** 切换附着组展开态（无附着组空操作；贴底口径经 toggleGroup 转发天然同覆盖） */
function toggleAttachedGroup(item: DisplayItem): void {
    const group = attachedGroupOf(item);
    if (group) toggleGroup(group.id);
}

// MSG-3233 ④：消息加载态——**加载中且消息为空**时盖骨架（免空帧闪 empty-state）
const loadingMessages = ref(false);
/**
 * main f793908 口径（本令摘段移植）：加载中＝`byConversation[id] === undefined`。
 * 与「加载完且为空」区分——后者说明这是**合法空会话**（用户清空了消息），应走
 * empty-state 而不是骨架屏。只按 displayItems === 0 判会把骨架吞成空态（反向亦然）。
 * 我方保留条件：未决审批卡常驻区在场时不盖骨架（见模板 v-if）。
 */
const isLoadingMessages = computed(() => {
    const id = activeId.value;
    if (!id) return false;
    return loadingMessages.value && messages.byConversation[id] === undefined;
});

watch(
    activeId,
    async (id) => {
        // 切换会话：重置贴底状态；消息加载完毕后默认滚动到底部
        pinned.value = true;
        // 跨会话遗留的「10s 自动恢复」倒计时无意义——上会话的滚动状态不应带到新会话
        clearUnpinRestore();
        // 折叠组展开态随会话切换重置：id 派生自消息，跨会话残留只会是死键
        groupExpanded.value = {};
        if (!id) return;
        loadingMessages.value = true;
        try {
            await messages.load(id);
        } finally {
            loadingMessages.value = false;
        }
        // 等虚拟滚动容器渲染、scrollEl 绑定完成（scroller 的 watch 为 post flush，
        // 在 nextTick 回调之前已执行），再强制贴底
        await nextTick();
        // 首帧测量遮罩：遮蔽库内 ResizeObserver 异步测高期的「估高→实测」跳变残影
        //（流式期/空消息内部自行跳过）
        runMeasurementOverlay();
        // MSG-3236 ②：走组件 API（索引定位），禁直写 scrollTop；
        // 消息全部渲染后 item 高度还要经 ResizeObserver 多跳测量——
        // 用有限贴底循环保证最终真正贴住底部
        scrollToBottomWithSettle();
    },
    { immediate: true },
);

function onScroll(event: Event) {
    const el = event.target as HTMLElement;
    // 程序贴底滚动引发的 scroll 事件**忽略判定**：scroll 事件是异步派发的，
    // 写入 scrollTop（贴住当时的底）与事件派发之间流式内容可能又增长
    //（RunBlocks reasoning / run.text 逐帧变高，scrollHeight 变大）——此刻按
    // 旧 scrollTop 对新 scrollHeight 判定，会把 pinned 误杀为 false → rAF 贴底
    // 循环自杀、内容 watch 又因 pinned=false 跳过重启 ⇒ 流式期持续不贴底。
    // 时间窗（120ms > 一次帧间内容增长 + scroll 派发延迟）内忽略；用户真实
    // 滚动持续多帧，窗后第一个 scroll 事件即恢复判定，不影响阅读位置保护。
    if (performance.now() - lastProgrammaticPinAt < 120) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    pinned.value = atBottom;
    if (atBottom) {
        // 已回到贴底：清掉「10s 自动恢复」倒计时（已被手动恢复）
        clearUnpinRestore();
    } else {
        // 用户上滚脱离贴底：① 停 rAF 循环（下一帧起不再强制回底）；
        // ② 启 10s 倒计时——超时仍未回底则恢复程序贴底（流式期）
        stopPinLoop();
        scheduleUnpinRestore();
    }
}

// 虚拟滚动容器就绪/销毁时：
// 1) 手动绑定 scroll（组件 @scroll 不会转发到内部根元素 —— inheritAttrs:false，此前贴底判断从未执行）；
// 2) 上报容器给外层 OverlayScrollArea 作为滚动条 target。
watch(
    scroller,
    (s) => {
        if (scrollEl.value) {
            scrollEl.value.removeEventListener("scroll", onScroll);
            scrollEl.value.removeEventListener("click", onCollapsibleHeadClick, true);
            contentRo?.disconnect();
            contentRo = null;
        }
        scrollEl.value = (s?.$el as HTMLElement | undefined) ?? null;
        if (scrollEl.value) {
            scrollEl.value.addEventListener("scroll", onScroll, { passive: true });
            // 折叠头点击委托（捕获阶段）：命中即抑制贴底，见 onCollapsibleHeadClick
            scrollEl.value.addEventListener("click", onCollapsibleHeadClick, true);
            // 高度观测挂接：① 滚动容器自身（流式尾条增高压缩视口、窗口缩放）；
            // ② 内容 wrapper（item 高度因异步渲染增长）。高度变化时贴底态补贴底。
            if (typeof ResizeObserver !== "undefined") {
                contentRo = new ResizeObserver(() => {
                    // 抑制窗口内（用户刚点了折叠头）的高度重排不贴底——
                    // 该变化源于主动交互而非新内容，拽走视口即「跳到底」坏体验
                    if (!pinned.value || isPinSuppressed()) return;
                    // 流式期由 rAF 贴底循环持续贴底（startPinLoop），勿重复起定时器
                    if (streamingRuns.value.length > 0) {
                        startPinLoop();
                        return;
                    }
                    scrollToBottomWithSettle(600);
                });
                contentRo.observe(scrollEl.value);
                const wrapper = scrollEl.value.querySelector(
                    ".vue-recycle-scroller__item-wrapper",
                );
                if (wrapper) contentRo.observe(wrapper);
            }
        }
        emit("scroller-ready", scrollEl.value ?? undefined);
    },
    { flush: "post" },
);

onBeforeUnmount(() => {
    stopPinLoop();
    hideMeasurementOverlayNow();
    if (pinStopTimer) {
        clearTimeout(pinStopTimer);
        pinStopTimer = 0;
    }
    clearUnpinRestore();
    contentRo?.disconnect();
    contentRo = null;
    if (scrollEl.value) {
        scrollEl.value.removeEventListener("scroll", onScroll);
        scrollEl.value.removeEventListener("click", onCollapsibleHeadClick, true);
    }
    scrollEl.value = null;
});

// 用户消息入列即强制贴底：sendUserMessage 先 push user 消息（立即渲染）再
// await chatSend RPC（可达数百 ms~秒级）——ChatInput 的 submitted 事件要等
// RPC 回执才到，这段窗口期滚动条不动；且用户若之前上滚过（pinned=false），
// 内容变化 watch 的贴底分支直接跳过。发送消息＝想看回复：user 消息出现
// 即恢复贴底态并贴底。覆盖全发送径（ChatInput/regenerate/CreateChat 均走
// sendUserMessage），不受 RPC 快慢影响。
watch(
    () => displayItems.value.length,
    (len, prev) => {
        if (len > prev && displayItems.value[len - 1]?.kind === "user") {
            pinned.value = true;
            scrollToBottomWithSettle();
        }
    },
);

watch(
    () =>
        displayItems.value.length +
        (displayItems.value.at(-1)?.text ?? "").length +
        streamingRuns.value.reduce((sum, run) => sum + run.text.length, 0),
    async () => {
        // 内容变化（含流式增长）：通知外层刷新悬浮滑块（上滚脱离贴底时 scrollTop 不变，需手动 sync）
        emit("content-changed");
        if (!pinned.value) return;
        if (streamingRuns.value.length > 0) {
            // 流式期：item 高度每帧异步测量，由 rAF 循环持续贴底
            startPinLoop();
            return;
        }
        await nextTick();
        // 直接将 scrollTop 设为 scrollHeight，绕过 virtual scroller 的
        // scrollToItem 索引计算（虚拟滚动中 item 高度尚未 layout 时会被下一次的 render
        // 覆盖回旧的偏移，表现为「滚到底但没真的到底」）
        scrollToBottomWithSettle(200);
    },
);

// 流式 run 数量启停：起跑即开 rAF 贴底循环——尾条在 message-scroll 内增长时
// 会压缩历史区高度，即使滚动内容本身未变（如纯 reasoning 帧）也需持续贴底；
// 收口（归零）停循环并补一次贴底让最终内容落定。
watch(
    () => streamingRuns.value.length,
    (count, prev) => {
        if (count > 0 && pinned.value) startPinLoop();
        if (count === 0 && prev > 0) {
            stopPinLoop();
            emit("content-changed");
            if (pinned.value) scrollToBottomWithSettle();
        }
    },
);

function scrollToBottom() {
    pinned.value = true;
    if (streamingRuns.value.length > 0) {
        // 流式仍在进行：恢复 rAF 贴底循环
        startPinLoop();
        return;
    }
    void nextTick(() => {
        scrollToLatest();
    });
}

/** ScrollScrubber 段位（0..segments-1）⇒ 直写 scrollTop 定位：
 *  默认 N=7：每段 ≈ 滚动总高 16.67%（≈ 16%），最后一段映射到底部 100%。
 *
 *  **scrollToItem 范式 ≠ scrubber 直觉**：scrollToItem 是按 item 索引定位的，
 *  但 scrubber 是"滚到 X%"的相对位置选择器——本用例下**直写 scrollTop 更贴合语义**
 *  （浏览器原生滚动条就是这么做的）。DynamicScroller 不禁直写 scrollTop，
 *  会按 scroll 事件自动重渲染可见 item、与 scrollToItem 走同一最终像素位置。
 *
 *  MSG-3236 ② 的"禁直写"是定位件设计约定（针对"跳到具体某条 item"的强诉求），
 *  scrubber 用例（跳到百分比）不受该约定约束；与 ScrollScrubber 高亮同用
 *  `scrollTop / total` 比 ⇒ 零错位自洽。 */
const SCRUBBER_SEGMENTS = 7;
function scrollToScrubberSegment(index: number) {
    const el = scrollEl.value;
    if (!el) return;
    const ratio = index / Math.max(1, SCRUBBER_SEGMENTS - 1);
    const total = el.scrollHeight - el.clientHeight;
    if (total <= 0) return;
    // 直写 scrollTop ⇒ 浏览器派发原生 scroll 事件 ⇒ ScrollScrubber 高亮位更新
    // （rAF 下一帧）；并由 onScroll 走贴底态判定（滚到非底部 ⇒ 自动 unpin）。
    el.scrollTop = ratio * total;
}
// 暴露 scroller：外层 OverlayScrollArea 通过 target 绑定滚动容器，绘制悬浮滚动条
defineExpose({ scrollToBottom, scroller });

function activityText(run: RunState): string {
    const last = run.trace[run.trace.length - 1];
    if (last?.kind === "tool.call") {
        return `${t("chat.activityTool")} ${last.toolName ?? ""}…`;
    }
    if (last?.kind === "tool.result") {
        return `${t("chat.activityToolDone")} ${last.toolName ?? ""}`;
    }
    if (run.reasoning) return t("chat.activityThinking");
    return t("chat.activityGenerating");
}

// 捎修一宗（MSG-1434，偏离②在册）：流式期链接/复制按钮点击面——
// streaming-tail 容器事件委托，逻辑与现盘 MarkdownView.onClick 同源
// （done 后 MarkdownView 自带处理恢复；此处只补流式期间交互面）。
async function onStreamingClick(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        "a",
    );
    if (anchor) {
        const href = anchor.getAttribute("href");
        if (href) {
            event.preventDefault();
            await getBridge().openExternal.open(href);
        }
        return;
    }
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
        ".code-copy",
    );
    if (!target) return;
    const code = decodeURIComponent(target.dataset.code ?? "");
    try {
        await getBridge().clipboard.writeText(code);
        const original = target.textContent;
        target.textContent = t("common.copied");
        setTimeout(() => {
            target.textContent = original;
        }, 1200);
    } catch {
        /* clipboard unavailable */
    }
}
</script>

<template>
    <div class="chat-content">
        <!-- 大模型的连接状态 -->
        <div
            v-if="
                !settings.demoMode &&
                (settings.connection === 'reconnecting' ||
                    settings.connection === 'connecting')
            "
            class="reconnect-banner"
        >
            {{ t("status.disconnectedReconnect") }}
        </div>

        <!-- 待办悬浮角标入口。  标准 v1.0 §C B5：`pending_total` 角标＋常驻入口——「另有 N 张卡」 -->
        <button
            v-if="approvals.badgeCount > 0"
            type="button"
            class="approval-banner"
            @click="ui.openInbox()"
        >
            <Icon name="inbox" :size="14" />
            {{ t("approval.inboxBanner", { n: approvals.badgeCount }) }}
        </button>

        <!-- 加载中、空数据、骨架屏的占位控件 -->
        <EmptyAndSkeletonChatView
            :loading="isLoadingMessages"
            :empty="
                displayItems.length === 0 &&
                pendingApprovals.length === 0 &&
                streamingRuns.length === 0
            "
            @create-session="ui.openCreate('session')"
        />

        <!-- 未决审批卡**孤儿兜底区**：不属于任何在跑 run 的未决卡（后台任务/
             历史遗留）由常驻区以 ApprovalStack 容器呈现（与尾流径同口径——
             编号选项列表直点决策、稳定 id/data-* 全保留）。归属尾流 run
             的未决卡已迁入 RunBlocks 审批卡容器内，此处仅兜底孤儿。 -->
        <!-- <ApprovalStack
            v-if="orphanApprovals.length"
            :messages="orphanApprovals"
        /> -->

        <!-- 会话消息的渲染（滚动区域） -->
        <div
            v-if="displayItems.length > 0 || streamingRuns.length > 0"
            class="message-scroll"
        >   
            <DynamicScroller
                ref="scroller"
                class="message-list"
                :items="displayItems"
                :min-item-size="64"
            >
                <!-- 渲染已经完成的对话内容 -->
                <template #default="{ item, index, active }">
                    <DynamicScrollerItem
                        :item="item"
                        :active="active"
                        :data-index="index"
                        :size-dependencies="sizeDeps(item)"
                    >
                        <div class="message-inner">
                            <!-- 用isToolGroup判断item是否属于同源，如果同源就渲染ToolCallGroup包裹起来 -->
                            <ToolCallGroup
                                v-if="isToolGroup(item)"
                                :messages="item.messages"
                                :expanded="isGroupExpanded(item.id)"
                                @toggle="toggleGroup(item.id)"
                            />
                            <MessageItem
                                v-else
                                :message="item"
                                :tool-group="attachedGroupOf(item)"
                                :tool-group-expanded="attachedGroupExpanded(item)"
                                @toggle-tool-group="toggleAttachedGroup(item)"
                            />
                        </div>
                    </DynamicScrollerItem>
                </template>

                <!-- 流式尾流迁入 #after 槽位：渲染在 item-wrapper 之后的
                     .vue-recycle-scroller__slot 内，其高度由库计入滚动总高
                     （endSpacerSize）——尾流成为滚动内容的组成部分，随历史消息
                     一同在统一滚动流里滚（不再悬在滚动区外的独立块），贴底由
                     startPinLoop 走库内 scrollToBottom() 覆盖 after 内容 -->
                <template #after>
                    <div
                        v-if="streamingRuns.length"
                        class="streaming-tail"
                        @click="onStreamingClick"
                    >
                        <!-- SSE推流过来的数据处理 -->
                        <div
                            v-for="run in streamingRuns"
                            :key="run.taskId"
                            class="msg assistant streaming-block"
                        >
                            <!-- 思考中... -->
                            <ActivityLine :text="activityText(run)" />  
                            <!-- 思考的过程渲染： -->
                            <RunBlocks
                                :run="run"
                                streaming
                                :pending-approvals="approvalsOf(run.taskId)"
                            />
                            <!-- 思考结束后或思考期间,产出的内容渲染 -->
                            <StreamingMarkdownView :text="run.text" />
                            <span class="caret" />
                        </div>
                    </div>
                </template>
            </DynamicScroller>

            <!-- 滚动区域遮罩层 -->
            <div
                v-if="startMeasurementOverlay"
                class="measure-overlay"
                :class="{ 'measure-fading': measurementFading }"
                aria-hidden="true"
            />

            <!-- 滚动速览条 -->
            <ScrollScrubber
                :scroll-el="scrollEl"
                :segments="SCRUBBER_SEGMENTS"
                @seek="scrollToScrubberSegment"
            />
        </div>
    </div>
</template>
