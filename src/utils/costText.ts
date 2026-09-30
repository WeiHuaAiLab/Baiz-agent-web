// 批0 成本小字：本会话最近一次**已完成** run 的 usage 记账（done 帧回填）→ 展示文案。
// 自 ChatInput 外迁（行数闸 MSG-3417：基线件只准减不准增，逻辑外迁新件）——
// 纯函数、零组件依赖，可单测。
//
// 标准 v1.0 §A3：计费展示改读后端值（usage.cost_usd／cost_per_mtok）——
// 前端自备单价表已删；后端未给成本即不显示金额，禁前端另算一份。
import type { RunState, UsageCost } from "../models";

/** 本会话最近一次完成的 run 的 usage（无 ⇒ null） */
export function lastCompletedUsage(
    runs: Record<string, RunState>,
    conversationId: string | null,
): UsageCost | null {
    if (!conversationId) return null;
    const completed = Object.values(runs)
        .filter(
            (r) =>
                r.conversationId === conversationId &&
                r.status === "completed" &&
                r.usage,
        )
        .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    return completed[0]?.usage ?? null;
}

/** usage → 成本小字（无账 ⇒ null，调用方据此整行不渲染） */
export function formatRunCost(
    runs: Record<string, RunState>,
    conversationId: string | null,
): string | null {
    const u = lastCompletedUsage(runs, conversationId);
    if (!u) return null;
    const parts: string[] = [];
    if (u.costUsd !== undefined) {
        parts.push(
            `本轮 $${u.costUsd.toFixed(4)}（¥${(u.costUsd * 7.1).toFixed(3)}）`,
        );
    }
    parts.push(`${u.totalTokens.toLocaleString()} tokens`);
    if (u.costPerMtok !== undefined) parts.push(`$${u.costPerMtok}/MTok`);
    parts.push("验证 ✅");
    return parts.join(" · ");
}
