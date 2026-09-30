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
import InflightItems from "./InflightItems.vue";
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
// - scroller-ready：虚拟滚动容器就绪/销毁时上报 DOM；
// - content-changed：消息内容变化后通知外层刷新滚动条 thumb 位置。
const emit = defineEmits<{
    (e: "scroller-ready", el?: HTMLElement): void;
    (e: "content-changed"): void;
}>();

// ==== §1  滚动容器 ====

const scroller = ref<{
    scrollToItem(index: number, options?: ScrollToOptions): void;
    scrollToBottom(): void;
    $el: HTMLElement;
}>();
const scrollEl = ref<HTMLElement | null>(null);
let contentRo: ResizeObserver | null = null;

// ==== §2  贴底状态机（pinMode：auto / user_locked） ====
//
// 单一源 `pinMode` 收口"程序贴底 vs 用户锁定"的状态争夺：
//   auto         ：程序贴底（rAF 可在跑、内容变化自动追）
//   user_locked  ：程序让位；锁定持续至用户滚回底部/发消息/点滚到底按钮
//
// 所有翻转走 `requestAutoPin(reason)` / `requestUserLock(reason)`，触发点
// 都注明原因便于复盘。副作用集中：进 auto ⇒ 流式期起 rAF；
// 进 user_lock ⇒ 停 rAF。
//
// 三个设计取舍：
//   - 折叠头点击只抑制循环、不进 user_lock——用户对当前阅读位置做高度调整，
//     不应因此锁死滚动；靠 PIN_SUPPRESS_MS 时间窗吸收 RO 重排即可。
//   - 非流式期滚动离开底部同样进 user_lock——若吸收为 auto，虚拟列表在新
//     视口渲染 item、RO 异步测高会触发贴底回调把视口拽回底部（触顶即跳回
//     底部的实测 bug）；滚回底部/发消息/点按钮才恢复 auto。
//   - scrubber 跳转不主动调 requestUserLock——onScroll 会自然判定 atBottom：
//     跳到底 ⇒ auto；跳非底 ⇒ user_lock。主动调会产生 1 帧窗口期不一致。

type PinMode = "auto" | "user_locked";
type PinReason =
    | "init"
    | "session_switch"
    | "user_send"
    | "scroll_at_bottom"
    | "scroll_away"
    | "explicit_bottom_btn";

const pinMode = ref<PinMode>("auto");

/** 业务用的"程序贴底模式"标志（与旧 pinned 同义） */
const pinned = computed(() => pinMode.value === "auto");

// 内部状态
let pinRafId = 0;
let pinStopTimer = 0; // 有限贴底限时
let lastProgrammaticPinAt = 0;
let pinSuppressUntil = 0;

// 时间常量
const PIN_SUPPRESS_MS = 800;             // 折叠展开高度重排抑制窗
const PROGRAMMATIC_PIN_WINDOW_MS = 120;  // 程序滚动 scroll 事件忽略窗
const AT_BOTTOM_THRESHOLD_PX = 120;      // atBottom 判定阈值

// §2.1 状态翻转入口

function requestAutoPin(reason: PinReason) {
    pinMode.value = "auto";
    if (streamingRuns.value.length > 0) startPinLoop();
}

function requestUserLock(reason: PinReason) {
    // 非流式期同样真锁定：滚到顶部/中部时若吸收为 auto 贴底，虚拟列表
    // 在新视口渲染 item、RO 异步测高会触发高度变化回调 ⇒ scrollToBottom
    // 把视口拽回底部（实测"触顶选 0 段后猛跳到底"）。锁定即保持阅读位置；
    // 用户滚回底部/发消息/点滚到底按钮才恢复 auto。
    pinMode.value = "user_locked";
    stopPinLoop();
}

// §2.2 副作用：rAF / 抑制窗 / 滚动时间戳

function markProgrammaticPin() {
    lastProgrammaticPinAt = performance.now();
}

function startPinLoop() {
    if (pinRafId || pinMode.value !== "auto") return;
    const tick = () => {
        pinRafId = 0;
        if (pinMode.value !== "auto") return;
        if (streamingRuns.value.length > 0) {
            // 流式期尾流在 #after 槽位——scrollToItem 跳不到，库内 scrollToBottom()
            // 内部循环 scrollTop=scrollHeight+5000 直到测量稳定，天然覆盖 after
            // 槽位（库内自管高度记账，非外直写）。
            scroller.value?.scrollToBottom();
        } else {
            scrollToLatest();
        }
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

function suppressPin() {
    pinSuppressUntil = performance.now() + PIN_SUPPRESS_MS;
}

function isPinSuppressed(): boolean {
    return performance.now() < pinSuppressUntil;
}

// §2.3 定位 API

// MSG-3236 ②：定位一律走**组件 API**（`scrollToItem`），**禁直写 `scrollTop`**
//（直写绕过 virtual scroller 的高度记账 ⇒ 定位不稳/回旧偏移——定位件原话）。
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

// 有限时长贴底：DynamicScroller item 真实高度由 RO 下一帧才测，单次
// scrollToLatest 会停在旧高度（"滚了但没到底"）。跑一小段 rAF 吸收
// 「渲染→测量→重排」多跳，时限到自动停；用户上滚脱离（pinMode=user_locked）
// 时循环自行退出。
function scrollToBottomWithSettle(duration = 400) {
    if (pinMode.value !== "auto") return;
    startPinLoop();
    if (pinStopTimer) clearTimeout(pinStopTimer);
    pinStopTimer = setTimeout(() => {
        pinStopTimer = 0;
        stopPinLoop();
    }, duration);
}

/** 父层调用入口：用户按"滚到底"按钮 / ChatInput onSubmitted 兜底 */
function scrollToBottom() {
    requestAutoPin("explicit_bottom_btn");
    if (streamingRuns.value.length > 0) return; // 流式期 requestAutoPin 已起 rAF
    void nextTick(() => scrollToLatest());
}

// ==== §3  scrollToScrubberSegment：scrubber 跳转（**唯一**直写 scrollTop 处） ====
//
// 跳百分比 ⇒ 直写 scrollTop 更贴合语义（浏览器原生滚动条就这么做）；库派发
// scroll 事件后按位置自动重渲染可见 item、与 scrollToItem 走同一最终像素。
//
// 不主动调 requestUserLock——onScroll 会自然判定 atBottom：
//   跳第 7 段（100%）⇒ auto；跳非底 ⇒ user_lock。主动调会产生 1 帧不一致。
//
// MSG-3236 ② 的"禁直写"是定位件约定（针对"跳到具体某条 item"），scrubber
// 用例（跳到百分比）不受该约束；与 ScrollScrubber 高亮同用 scrollTop/total
// 比 ⇒ 零错位自洽。
const SCRUBBER_SEGMENTS = 7;
function scrollToScrubberSegment(index: number) {
    const el = scrollEl.value;
    if (!el) return;
    const ratio = index / Math.max(1, SCRUBBER_SEGMENTS - 1);
    const total = el.scrollHeight - el.clientHeight;
    if (total <= 0) return;
    el.scrollTop = ratio * total;
}

// ==== §4  onScroll：原生滚动事件（用户滚动 vs 程序滚动区分） ====
//
// DynamicScroller 是第三方组件（inheritAttrs:false），模板上的 @scroll 不
// 会转发到内部根元素 .vue-recycle-scroller——必须手动 addEventListener。

function onScroll(event: Event) {
    // 程序贴底引发的 scroll 事件**忽略判定**：scroll 异步派发，写入 scrollTop
    // 与派发之间流式内容可能又增长（RunBlocks/run.text 逐帧变高）——此刻按旧
    // scrollTop 对新 scrollHeight 判定会把 pinned 误杀为 false → rAF 自杀、
    // 内容 watch 又因 pinned=false 跳过重启 ⇒ 流式期持续不贴底。时间窗
    //（120ms > 一次帧间增长 + 派发延迟）内忽略；用户真实滚动持续多帧，窗后
    // 第一个事件恢复判定。
    if (performance.now() - lastProgrammaticPinAt < PROGRAMMATIC_PIN_WINDOW_MS)
        return;
    const el = event.target as HTMLElement;
    const atBottom =
        el.scrollTop + el.clientHeight >=
        el.scrollHeight - AT_BOTTOM_THRESHOLD_PX;
    if (atBottom) {
        requestAutoPin("scroll_at_bottom");
    } else {
        requestUserLock("scroll_away");
    }
}

/**
 * 折叠头点击（捕获阶段事件委托）：命中任一已知折叠头 ⇒ 抑制贴底并停循环。
 * RunBlocks／ToolRow 的折叠态在组件内部、不上报父层——委托监听免穿组件逐个
 * 接线；后续新折叠头只需把选择器补进列表。
 *
 * 注：仅停 rAF + 设 PIN_SUPPRESS 窗，**不**进 user_lock——这是用户对当前
 * 阅读位置的主动高度调整，不应因此锁死滚动。
 */
const COLLAPSIBLE_HEAD_SELECTOR =
    ".tool-group-head, .reasoning-head, .block-head, .tool-main";
function onCollapsibleHeadClick(event: Event) {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.(COLLAPSIBLE_HEAD_SELECTOR)) {
        suppressPin();
        stopPinLoop();
    }
}

// ==== §5  首帧测量遮罩 ====
//
// DynamicScroller 首次把消息渲染进可视区时，库内 RO 还在异步测高——「估高
// → 实测」跳变会出文字重叠等视觉残影。此窗口期盖一层轻量占位遮蔽；10 帧
// 后库内测量已完成，自动渐隐退场。流式期不进入（尾条常变且 rAF 在跑，遮罩
// 反而挡住流式输出）。

const startMeasurementOverlay = ref(false);
const measurementFading = ref(false);
let measurementRafId = 0;
let measurementFadeTimer = 0;

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

function runMeasurementOverlay() {
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
        if (streamingRuns.value.length > 0) {
            hideMeasurementOverlayNow();
            return;
        }
        if (++frames >= 10) {
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

// ==== §6  业务派生状态 ====

const activeId = computed(() => session.activeId);

/**
 * MSG-3236 ①：未决卡**脱离虚拟滚动复用**——虚拟列表只收普通消息，
 * 未决卡改由常驻区渲染（DOM 常在＋稳定 id/data-*）⇒ UIA／自动化可稳定命中「同意/拒绝」。
 */
const pendingApprovals = computed<ChatMessage[]>(() =>
    messages.list(activeId.value).filter(isPendingApproval),
);

const streamingRuns = computed(() => messages.activeRuns(activeId.value));

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

// 消息流展示分组（未决审批卡剥离＋工具链折叠，逻辑外迁 utils/displayItems.ts——
// 行数闸 MSG-3417 基线件只准减不准增）。工具组**附着**到该 run 落地的 assistant
// 消息上，由 AssistantMessage 在过程区之后、正文之前渲染；无落点 ⇒ 组原位兜底。
const {
    displayItems,
    streamingTailByTaskId,
    isToolGroup,
    groupExpanded,
    isGroupExpanded,
    attachedGroupOf,
    attachedGroupExpanded,
    sizeDeps,
} = useDisplayItems();

/** 流式期在飞项：按 taskId 取——避免模板里用 `[run.taskId] ?? []` 触发
 *  vue-tsc 对 ComputedRef 索引的类型推断死角（顶层模板直接渲染 #after
 *  scoped slot 内的嵌套 v-for 会被推断为 setup 对象） */
function inflightFor(taskId: string): ChatMessage[] {
    return streamingTailByTaskId.value[taskId] ?? [];
}

/** 切换折叠组：用户主动展开/收起——**不贴底**（抑制窗口吸收多跳高度重排） */
function toggleGroup(id: string) {
    groupExpanded.value = {
        ...groupExpanded.value,
        [id]: !groupExpanded.value[id],
    };
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
// 加载中＝`byConversation[id] === undefined`（与"加载完且为空"区分；后者是
// 合法空会话，应走 empty-state 不是骨架）。
const isLoadingMessages = computed(() => {
    const id = activeId.value;
    if (!id) return false;
    return loadingMessages.value && messages.byConversation[id] === undefined;
});

// ==== §7  watches：触发源 → 状态翻转入口 ====

/** 切会话：重置 pinMode → auto + 清残留；加载完贴底 */
watch(
    activeId,
    async (id) => {
        requestAutoPin("session_switch");
        groupExpanded.value = {};
        if (!id) return;
        loadingMessages.value = true;
        try {
            await messages.load(id);
        } finally {
            loadingMessages.value = false;
        }
        await nextTick();
        runMeasurementOverlay();
        // 用有限贴底循环保证最终真正贴住底部（消息全部渲染后 item 高度
        // 还要经 RO 多跳测量；MSG-3236 ②：走组件 API 禁直写 scrollTop）
        scrollToBottomWithSettle();
    },
    { immediate: true },
);

/** 用户消息入列即强制贴底：sendUserMessage 先 push user 消息（立即渲染）再
 *  await chatSend RPC（可达数百 ms~秒级）——ChatInput 的 submitted 要等 RPC
 *  回执，这段窗口期滚动条不动；且用户若之前上滚过（pinMode=user_locked），
 *  内容变化 watch 的贴底分支直接跳过。发送消息＝想看回复 ⇒ 即恢复贴底。 */
watch(
    () => displayItems.value.length,
    (len, prev) => {
        if (len > prev && displayItems.value[len - 1]?.kind === "user") {
            requestAutoPin("user_send");
            scrollToBottomWithSettle();
        }
    },
);

/** 内容变化（含流式增长）
 *  注意：贴底触发源要把**所有**流式字段算进去——`text` / `reasoning` /
 *  `trace` 任一变化都可能撑高 #after 槽位的 RunBlocks（思考块/工具块）。
 *  仅靠 `text.length` 在纯思考/工具阶段不更新 ⇒ rAF 不重启，思考块
 *  增高会顶起视口却不见回贴底；RO 兜底（见 §8）补 #after 槽位观察。 */
watch(
    () =>
        displayItems.value.length +
        (displayItems.value.at(-1)?.text ?? "").length +
        streamingRuns.value.reduce(
            (sum, run) =>
                sum +
                run.text.length +
                (run.reasoning?.length ?? 0) +
                (run.trace?.length ?? 0),
            0,
        ),
    async () => {
        // 内容变化（含流式增长）：通知外层刷新悬浮滑块（上滚脱离贴底时 scrollTop 不变，需手动 sync）
        emit("content-changed");
        if (pinMode.value !== "auto") return;
        if (streamingRuns.value.length > 0) {
            // 流式期：item 高度每帧异步测量，由 rAF 循环持续贴底
            startPinLoop();
            return;
        }
        await nextTick();
        scrollToBottomWithSettle(200);
    },
);

/** 流式 run 数量启停：起跑即开 rAF 贴底循环——尾条在 message-scroll 内增长时
 *  会压缩历史区高度，即使滚动内容本身未变（如纯 reasoning 帧）也需持续贴底；
 *  收口（归零）停循环并补一次贴底让最终内容落定。 */
watch(
    () => streamingRuns.value.length,
    (count, prev) => {
        if (count > 0 && pinMode.value === "auto") startPinLoop();
        if (count === 0 && prev > 0) {
            stopPinLoop();
            emit("content-changed");
            if (pinMode.value === "auto") scrollToBottomWithSettle();
        }
    },
);

// ==== §8  scroller watch：DOM 就绪时挂监听、卸载时清理 ====

watch(
    scroller,
    (s) => {
        if (scrollEl.value) {
            scrollEl.value.removeEventListener("scroll", onScroll);
            scrollEl.value.removeEventListener(
                "click",
                onCollapsibleHeadClick,
                true,
            );
            contentRo?.disconnect();
            contentRo = null;
        }
        scrollEl.value = (s?.$el as HTMLElement | undefined) ?? null;
        if (scrollEl.value) {
            scrollEl.value.addEventListener("scroll", onScroll, {
                passive: true,
            });
            // 折叠头点击委托（捕获阶段）：命中即抑制贴底，见 onCollapsibleHeadClick
            scrollEl.value.addEventListener(
                "click",
                onCollapsibleHeadClick,
                true,
            );
            // 高度观测挂接：① 滚动容器自身（流式尾条增高压缩视口、窗口缩放）；
            // ② 内容 wrapper（item 高度因异步渲染增长）；
            // ③ **#after 槽位**（`vue-recycle-scroller__slot`）——思考阶段
            // RunBlocks 增高发生在尾流槽内，wrapper 不变槽位变，槽位不观察
            // ⇒ 思考块顶起视口却不见回贴底（实测 bug）。高度变化时贴底态补贴底。
            if (typeof ResizeObserver !== "undefined") {
                contentRo = new ResizeObserver(() => {
                    // 抑制窗口内（用户刚点了折叠头）的高度重排不贴底——
                    // 该变化源于主动交互而非新内容，拽走视口即「跳到底」坏体验
                    if (pinMode.value !== "auto" || isPinSuppressed()) return;
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
                const afterSlot = scrollEl.value.querySelector(
                    ".vue-recycle-scroller__slot",
                );
                if (afterSlot) contentRo.observe(afterSlot);
            }
        }
        emit("scroller-ready", scrollEl.value ?? undefined);
    },
    { flush: "post" },
);

// ==== §9  组件卸载清理 ====

onBeforeUnmount(() => {
    stopPinLoop();
    hideMeasurementOverlayNow();
    if (pinStopTimer) {
        clearTimeout(pinStopTimer);
        pinStopTimer = 0;
    }
    contentRo?.disconnect();
    contentRo = null;
    if (scrollEl.value) {
        scrollEl.value.removeEventListener("scroll", onScroll);
        scrollEl.value.removeEventListener(
            "click",
            onCollapsibleHeadClick,
            true,
        );
    }
    scrollEl.value = null;
});

// ==== §10  对外暴露 ====

defineExpose({ scrollToBottom, scroller });

// ==== §11  其他业务函数 ====

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

/** 捎修一宗（MSG-1434，偏离②在册）：流式期链接/复制按钮点击面——
 *  streaming-tail 容器事件委托，逻辑与现盘 MarkdownView.onClick 同源
 *  （done 后 MarkdownView 自带处理恢复；此处只补流式期间交互面）。 */
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
                            class="streaming-block"
                        >
                            <div class="msg assistant streaming-block-inner">
                                <!-- 思考中... -->
                                <ActivityLine :text="activityText(run)" />  
                                <!-- 思考的过程渲染：RunBlocks 内含 reasoning /
                                     tool.call（来自 run.trace）/ 未决 approval（来自
                                     pendingApprovals）/ tool.result（来自 run.trace）
                                     ——覆盖"未决过程"路径。 -->
                                <RunBlocks
                                    :run="run"
                                    streaming
                                    :pending-approvals="approvalsOf(run.taskId)"
                                /> 
                                <InflightItems :items="inflightFor(run.taskId)" />
                                <!-- 思考结束后或思考期间,产出的内容渲染 -->
                                <StreamingMarkdownView :text="run.text" />
                                <span class="caret" />
                            </div>
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