// 消息流展示分组（自 ChatContent 抽出——行数闸 MSG-3417：基线件只准减不准增，
// 逻辑外迁新件）：① 未决审批卡判定；② 连续工具调用折叠组（displayState）。
import { computed, ref } from "vue";
import type { ChatMessage, RunState, ToolGroup } from "../models";
import { useMessageStore } from "../stores/message";
import { useSessionStore } from "../stores/session";

/** 连续工具调用折叠组：≥ TOOL_GROUP_MIN 条连续 tool_call 在收束后合并成一个虚拟 item
 *  （类型定义在 models.ts——MessageItem / AssistantMessage 附着渲染同源引用） */
export type DisplayItem = ChatMessage | ToolGroup;

/** MSG-3236 ①：未决审批卡（kind==='approval' 且未决）——判定与展示分离 */
export function isPendingApproval(m: ChatMessage): boolean {
    return m.kind === "approval" && m.meta?.approved === undefined;
}

export function isToolGroup(item: DisplayItem): item is ToolGroup {
    return item.kind === "tool-group";
}

// 折叠门槛：连续 tool_call ≥ 3 条才收起（不足则逐条散开，行为与既有会话完全一致）
const TOOL_GROUP_MIN = 3;

/** 「思考完毕」判定：该 tool_call 所属 run 是否已收束（不再 running/queued）。
 *  未收束 = 流式进行中 —— 此时保持逐条散开（尾流期不折叠，让用户看到实时操作）；
 *  run 已被 trim 或从未登记（从 DB 载入的历史消息）一律视为已收束。 */
function isRunSettled(runs: Record<string, RunState>, taskId?: string): boolean {
    if (!taskId) return true;
    const run = runs[taskId];
    if (!run) return true;
    return run.status !== "running" && run.status !== "queued";
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
 * 源＝消息流**去掉未决审批卡**（未决卡走常驻区，见 ChatContent `pendingApprovals`）
 * ⇒ 再对剩余流做「同 run 连续 `tool_call` ≥ `TOOL_GROUP_MIN` ⇒ 折成一个 `ToolGroup`」。
 * **两侧合取并集**：我方"审批卡常驻区"与上游"工具链折叠"语义各自保留，**零丢弃**。
 *
 * **位置口径（工具组附着渲染）**：组不再原地渲染在消息流里（原地＝assistant 消息
 * 之前，深度思考/执行命令/审批卡反倒落在组后面，顺序颠倒）；改为**附着**到该 run
 * 落地的 assistant 消息上，由 AssistantMessage 在过程区（RunBlocks：深度思考/
 * 执行命令/审批卡/执行结果）之后、正文之前渲染——时间顺序复原。无落点（消息被删/
 * 失败径未落 assistant）⇒ 组按原位兜底渲染为独立 item，行为与旧版一致。
 */
export function useDisplayItems() {
    const messages = useMessageStore();
    const session = useSessionStore();
    const activeId = computed(() => session.activeId);

    const displayState = computed<{
        items: DisplayItem[];
        /** assistant 消息 id → 附着其上的工具组（AssistantMessage 过程区之后渲染） */
        attached: Record<string, ToolGroup>;
    }>(() => {
        const source = messages
            .list(activeId.value)
            .filter((m) => !isPendingApproval(m));
        const out: DisplayItem[] = [];
        const attached: Record<string, ToolGroup> = {};
        let buffer: ChatMessage[] = [];
        /** 已成组但还没等到落点的组：taskId → { 组, 原位兜底插入下标 }。
         *  用 Map 而非单值：续跑/多 run 交错时同刻可有多个待落点组，单值会丢组。 */
        const pendings = new Map<string, { group: ToolGroup; anchor: number }>();

        const flush = () => {
            const head = buffer[0];
            // 段内必定同 run（下方断组保证），故只需看首条所属 run 是否收束
            if (
                head &&
                buffer.length >= TOOL_GROUP_MIN &&
                isRunSettled(messages.runs, head.meta?.taskId)
            ) {
                // id 由首条消息 id 派生：段尾追加新条目时 id 不变，虚拟列表不重建
                pendings.set(head.meta!.taskId!, {
                    group: {
                        id: `tg:${head.id}`,
                        kind: "tool-group",
                        text: summarizeTools(buffer),
                        messages: buffer,
                    },
                    // 原位兜底插入点：组首条消息原本所在处（assistant 落点丢失时回退）
                    anchor: out.length,
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
            // 落点：本 run 落地的 assistant 消息（消息流顺序上必在组之后——
            // tool_call 逐帧先落、assistant 收束时才落地；queued status 在组之前，
            // 不会误命中）
            if (message.kind === "assistant" && message.meta?.taskId) {
                const pending = pendings.get(message.meta.taskId);
                if (pending) {
                    attached[message.id] = pending.group;
                    pendings.delete(message.meta.taskId);
                }
            }
            out.push(message);
        }
        flush();
        // 兜底：始终没等到落点的组（assistant 被删/失败径未落条）⇒ 原位回退独立渲染。
        // 多组并存时按 anchor 降序插入，避免先插的组顶掉后面组的下标。
        const leftovers = [...pendings.values()].sort((a, b) => b.anchor - a.anchor);
        for (const { group, anchor } of leftovers) out.splice(anchor, 0, group);
        return { items: out, attached };
    });

    const displayItems = computed<DisplayItem[]>(() => displayState.value.items);

    /** 附着组查询：模板对 assistant item 取其附着工具组（无则 undefined，不渲染组） */
    function attachedGroupOf(item: DisplayItem): ToolGroup | undefined {
        return displayState.value.attached[item.id];
    }

    // 折叠组展开态：默认收起（「思考完毕后」自动折叠，用户点击可展开）。
    // 存本组合式函数（父层作用域）而非组组件内部——DynamicScroller 会回收 item
    // 组件，状态若存组件内，滚出视口再滚回来就丢了。
    const groupExpanded = ref<Record<string, boolean>>({});

    function isGroupExpanded(id: string): boolean {
        return groupExpanded.value[id] === true;
    }

    /** 附着组展开态（无附着组恒 false） */
    function attachedGroupExpanded(item: DisplayItem): boolean {
        const group = attachedGroupOf(item);
        return group ? isGroupExpanded(group.id) : false;
    }

    /** size 依赖（v3 已 deprecated，ResizeObserver 才是正路）：仅保证两种 item 都取得到值；
     *  附着组的展开态会改 assistant item 高度，一并纳入（RO 兜底不受影响） */
    function sizeDeps(item: DisplayItem): unknown[] {
        if (isToolGroup(item))
            return [item.messages.length, isGroupExpanded(item.id)];
        return [
            item.text,
            item.meta?.taskId,
            item.meta?.attachments?.length,
            item.meta?.streaming,
            attachedGroupExpanded(item),
        ];
    }

    return {
        displayItems,
        isToolGroup,
        groupExpanded,
        isGroupExpanded,
        attachedGroupOf,
        attachedGroupExpanded,
        sizeDeps,
    };
}
