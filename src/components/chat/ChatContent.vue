<script setup lang="ts">
// 聊天内容体：重连提示、空状态、虚拟滚动消息列表、流式渲染尾条与"回到最新"按钮。
// 暴露 scrollToBottom()（发送消息后强制回到底部）；滚动容器就绪/内容变化时通过
// scroller-ready / content-changed 事件通知外层 OverlayScrollArea 更新悬浮滚动条。
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../../stores/session";
import { useMessageStore, isRunTerminal } from "../../stores/message";
import { useSettingsStore } from "../../stores/settings";
import { useUiStore } from "../../stores/ui";
import { useApprovalStore } from "../../stores/approval";
import { getBridge } from "../../bridge";
import type { ChatMessage, RunState } from "../../models";
import MessageItem from "./MessageItem.vue";
// MSG-3513 并上游 1712993：工具调用折叠组（`StreamingMarkdownView` 我方第 24 行已 import
// 同径 ⇒ **不重复引入**，否则重复 import 报错）
import ToolCallGroup from "./ToolCallGroup.vue";
import SkeletonChatView from "./SkeletonChatView.vue";
// MSG-3335 G-4：RunBlocks 随 kind 分发迁入 chat/message/（本件随迁改 import，行为零改）
import RunBlocks from "./message/RunBlocks.vue";
import StreamingMarkdownView from "../markdown/StreamingMarkdownView.vue";
import Icon from "../common/Icon.vue";
// MSG-3575 P5（A 谱系补丁·非 372ae2f 面）：同类重复失败合并条分型与压缩
import {
    classifyRuntimeFailure,
    compactRuntimeFailures,
} from "../../utils/failureText";
import type { RuntimeFailureKind } from "../../utils/failureText";

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

let scrollEl: HTMLElement | null = null;
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

// 有限贴底循环的自动停止定时器
let pinStopTimer = 0;

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
/** MSG-3236 ①：未决审批卡（`kind==='approval'` 且未决）——判定与展示分离 */
function isPendingApproval(m: ChatMessage): boolean {
    return m.kind === "approval" && m.meta?.approved === undefined;
}
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

/** 连续工具调用折叠组：≥ TOOL_GROUP_MIN 条连续 tool_call 在收束后合并成一个虚拟 item */
interface ToolGroup {
    id: string;
    kind: "tool-group";
    /** 摘要文本（工具名去重）：与 ChatMessage.text 同形，让 size 依赖 / 贴底签名
     *  的取值表达式对两种 item 无需分支 */
    text: string;
    messages: ChatMessage[];
}

/**
 * **MSG-3575 · P5**（A 谱系补丁）：同类重复失败**合并条**——连续同类（外网取件／KB
 * 不可用）失败状态条折成一条（代表项＝首条，`repeat`＝条数）：**不刷屏**，且原文
 * 不上屏（见 `StatusMessage`）。
 */
interface StatusRepeat {
    id: string;
    kind: "status-repeat";
    message: ChatMessage;
    repeat: number;
}

type DisplayItem = ChatMessage | ToolGroup | StatusRepeat;

function isToolGroup(item: DisplayItem): item is ToolGroup {
    return item.kind === "tool-group";
}

function isStatusRepeat(item: DisplayItem): item is StatusRepeat {
    return item.kind === "status-repeat";
}

/** 本条是否是"外网取件／KB 不可用"失败状态条（本件分型；非本件 ⇒ null） */
function failureKindOf(item: DisplayItem): RuntimeFailureKind | null {
    if (item.kind !== "status") return null;
    if (item.meta?.status !== "error" && item.meta?.statusKey !== "taskError")
        return null;
    return classifyRuntimeFailure(item.text);
}

/** 取 item 的可读文本（三种 item 同形取值；滚动签名用） */
function itemText(item: DisplayItem | undefined): string {
    if (!item) return "";
    if (isToolGroup(item)) return item.text;
    if (isStatusRepeat(item)) return item.message.text;
    return item.text;
}

// 折叠门槛：连续 tool_call ≥ 3 条才收起（不足则逐条散开，行为与既有会话完全一致）
const TOOL_GROUP_MIN = 3;

/** 「思考完毕」判定：该 tool_call 所属 run 是否已收束（终态）。
 *  未收束 = 流式进行中 —— 此时保持逐条散开（尾流期不折叠，让用户看到实时操作）；
 *  run 已被 trim 或从未登记（从 DB 载入的历史消息）一律视为已收束。
 *  用终态黑名单而非 === 'running'：waiting_approval（审批等待期）仍是活 run
 *  ——该期间工具链不应折叠（与 activeRuns / stopRun 同源修复）。 */
function isRunSettled(taskId?: string): boolean {
    if (!taskId) return true;
    const run = messages.runs[taskId];
    if (!run) return true;
    return isRunTerminal(run.status);
}

/** 折叠组摘要：工具名去重保序（同一工具反复调用时不重复堆字） */
function summarizeTools(items: ChatMessage[]): string {
    const names = items
        .map((message) => message.meta?.toolName)
        .filter((name): name is string => !!name);
    return [...new Set(names)].join(" · ");
}

/**
 * **MSG-3513 合流**（我方 `MSG-3236` ① ＋ 上游 `1712993`「连续工具调用折叠」）：
 * 源＝消息流**去掉未决审批卡**（未决卡走常驻区，见 `pendingApprovals`）
 * ⇒ 再对剩余流做「同 run 连续 `tool_call` ≥ `TOOL_GROUP_MIN` ⇒ 折成一个 `ToolGroup`」。
 * **两侧合取并集**：我方"审批卡常驻区"与上游"工具链折叠"语义各自保留，**零丢弃**。
 */
const displayItems = computed<DisplayItem[]>(() => {
    const source = messages
        .list(activeId.value)
        .filter((m) => !isPendingApproval(m));
    const out: DisplayItem[] = [];
    let buffer: ChatMessage[] = [];

    const flush = () => {
        const head = buffer[0];
        // 段内必定同 run（下方断组保证），故只需看首条所属 run 是否收束
        if (
            head &&
            buffer.length >= TOOL_GROUP_MIN &&
            isRunSettled(head.meta?.taskId)
        ) {
            // id 由首条消息 id 派生：段尾追加新条目时 id 不变，虚拟列表不重建
            out.push({
                id: `tg:${head.id}`,
                kind: "tool-group",
                text: summarizeTools(buffer),
                messages: buffer,
            });
        } else {
            out.push(...buffer);
        }
        buffer = [];
    };

    for (const message of source) {
        if (message.kind === "tool_call") {
            // 同一 run 的连续 tool_call 才归一组：换 run 即断组——否则「上一个 run
            // 已完成、下一个 run 还在跑」两段相邻时会被并成一段，导致已收束的那半
            // 也一直不折叠（违背「已完成的默认折叠」）
            if (
                buffer.length > 0 &&
                buffer[0]?.meta?.taskId !== message.meta?.taskId
            )
                flush();
            buffer.push(message);
            continue;
        }
        flush();
        out.push(message);
    }
    flush();
    // **MSG-3575 · P5**（A 谱系补丁）：再走一道**同类失败合并**（连续同类 ⇒ 一条 ＋ ×N）——
    // 工具链折叠组与非本件分型项一律原样透传（零误伤）。
    return compactRuntimeFailures(out, failureKindOf).map(({ item, repeat }) =>
        repeat > 1 && item.kind === "status"
            ? {
                  id: `sf:${item.id}`,
                  kind: "status-repeat" as const,
                  message: item,
                  repeat,
              }
            : item,
    );
});

// 折叠组展开态：默认收起（「思考完毕后」自动折叠，用户点击可展开）。
// 存父层而非组组件内部——DynamicScroller 会回收 item 组件，
// 状态若存组件内，滚出视口再滚回来就丢了。
const groupExpanded = ref<Record<string, boolean>>({});

function isGroupExpanded(id: string): boolean {
    return groupExpanded.value[id] === true;
}

function toggleGroup(id: string) {
    groupExpanded.value = {
        ...groupExpanded.value,
        [id]: !groupExpanded.value[id],
    };
    // 整组展开/收起是高度突变，且组内工具行的高度还要等 ResizeObserver 落地——
    // 交给贴底循环吸收「展开 → 重测 → 落定」的多跳；非吸附态不动，尊重阅读位置
    if (pinned.value) startPinLoop();
}

/** size 依赖（v3 已 deprecated，ResizeObserver 才是正路）：仅保证两种 item 都取得到值 */
function sizeDeps(item: DisplayItem): unknown[] {
    if (isToolGroup(item))
        return [item.messages.length, isGroupExpanded(item.id)];
    // A 谱系补丁（MSG-3575 P5）：合并条的高度随条数与原文变化
    if (isStatusRepeat(item)) return [item.repeat, item.message.text];
    return [
        item.text,
        item.meta?.taskId,
        item.meta?.attachments?.length,
        item.meta?.streaming,
    ];
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
    // 两口径同时成立才盖骨架：
    //   ① 我方 MSG-3233 ④：load **在途**（loadingMessages，可被测试显式控制起止）；
    //   ② main f793908：数据**尚未载入**（`byConversation[id] === undefined`）。
    // 只留 ① 会在「键已存在但为空」的合法空会话上误盖骨架（main 新增用例 B 反证）；
    // 只留 ② 会在 load 已收口但键仍缺（如 load 被替身/失败）时永远盖着（我方 MSG-3233 ③ 反证）。
    return loadingMessages.value && messages.byConversation[id] === undefined;
});

watch(
    activeId,
    async (id) => {
        // 切换会话：重置贴底状态；消息加载完毕后默认滚动到底部
        pinned.value = true;
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
    pinned.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    // 用户上滚脱离贴底：停止流式贴底循环（下一帧起不再强制回底）
    if (!pinned.value) stopPinLoop();
}

// 虚拟滚动容器就绪/销毁时：
// 1) 手动绑定 scroll（组件 @scroll 不会转发到内部根元素 —— inheritAttrs:false，此前贴底判断从未执行）；
// 2) 上报容器给外层 OverlayScrollArea 作为滚动条 target。
watch(
    scroller,
    (s) => {
        if (scrollEl) {
            scrollEl.removeEventListener("scroll", onScroll);
            contentRo?.disconnect();
            contentRo = null;
        }
        scrollEl = (s?.$el as HTMLElement | undefined) ?? null;
        if (scrollEl) {
            scrollEl.addEventListener("scroll", onScroll, { passive: true });
            // 高度观测挂接：① 滚动容器自身（流式尾条增高压缩视口、窗口缩放）；
            // ② 内容 wrapper（item 高度因异步渲染增长）。高度变化时贴底态补贴底。
            if (typeof ResizeObserver !== "undefined") {
                contentRo = new ResizeObserver(() => {
                    if (!pinned.value) return;
                    // 流式期由 rAF 贴底循环持续贴底（startPinLoop），勿重复起定时器
                    if (streamingRuns.value.length > 0) {
                        startPinLoop();
                        return;
                    }
                    scrollToBottomWithSettle(600);
                });
                contentRo.observe(scrollEl);
                const wrapper = scrollEl.querySelector(
                    ".vue-recycle-scroller__item-wrapper",
                );
                if (wrapper) contentRo.observe(wrapper);
            }
        }
        emit("scroller-ready", scrollEl ?? undefined);
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
    contentRo?.disconnect();
    contentRo = null;
    if (scrollEl) scrollEl.removeEventListener("scroll", onScroll);
    scrollEl = null;
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
        itemText(displayItems.value.at(-1)).length +
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

        <!-- 标准 v1.0 §C B5：`pending_total` 角标＋常驻入口——「另有 N 张卡」 -->
        <button
            v-if="approvals.badgeCount > 0"
            type="button"
            class="approval-banner"
            @click="ui.openInbox()"
        >
            <Icon name="inbox" :size="14" />
            {{ t("approval.inboxBanner", { n: approvals.badgeCount }) }}
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
                displayItems.length === 0 &&
                pendingApprovals.length === 0 &&
                streamingRuns.length === 0
            "
            class="empty-state"
        >
            <p class="empty">{{ t("chat.empty") }}</p>
            <button
                type="button"
                class="empty-start"
                @click="ui.openCreate('session')"
            >
                {{ t("chat.emptyStart") }}
            </button>
        </div>

        <!-- 未决审批卡**孤儿兜底区**：不属于任何在跑 run 的未决卡（后台任务/
             历史遗留）仍以常驻区呈现（原九态卡面）；归属尾流 run 的已迁入
             RunBlocks 审批卡容器（编号选项直点决策）。稳定 id/data-* 保留。 -->
        <!-- <div
            v-if="orphanApprovals.length"
            class="pending-approvals"
            data-uia="pending-approvals"
        >
            <div
                v-for="card in orphanApprovals"
                :key="card.id"
                class="pending-approval-slot"
                :id="`approval-${card.meta?.requestId ?? card.id}`"
                :data-approval-request-id="card.meta?.requestId ?? ''"
                data-uia="pending-approval"
            >
                <MessageItem :message="card" />
            </div>
        </div> -->

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
                            <!-- MSG-3575 P5（A 谱系补丁）：同类重复失败合并条（代表项 ＋ ×N；原文不上屏） -->
                            <MessageItem
                                v-else-if="isStatusRepeat(item)"
                                :message="item.message"
                                :repeat="item.repeat"
                            />
                            <MessageItem v-else :message="item" />
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
                        <div
                            v-for="run in streamingRuns"
                            :key="run.taskId"
                            class="msg assistant streaming-block"
                        >
                            <div class="activity-line">
                                <span class="activity-dot" />
                                {{ activityText(run) }}
                            </div>
                            <!-- MSG-2998 修②（DEBT-544 目二）：三分离归组——思考/执行命令/  执行结果各自成区（流式态与终态同构，RunBlocks 两态一源）；
                                 未决审批卡容器（本 run 的待审批权限卡）挂在执行命令/执行结果之间 -->
                            <RunBlocks
                                :run="run"
                                streaming
                                :pending-approvals="approvalsOf(run.taskId)"
                            />
                            <StreamingMarkdownView :text="run.text" />
                            <span class="caret" />
                        </div>
                    </div>
                </template>
            </DynamicScroller>

            <div
                v-if="startMeasurementOverlay"
                class="measure-overlay"
                :class="{ 'measure-fading': measurementFading }"
                aria-hidden="true"
            />
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
