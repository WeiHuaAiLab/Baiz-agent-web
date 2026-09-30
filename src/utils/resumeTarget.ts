// MSG-2722 L3 编程 UI：Blocked 人工回传续跑（daemon `tool_loop.resume`）——
// 自 ChatInput 外迁（行数闸 MSG-3417：基线件只准减不准增，逻辑外迁新件）。
//
// 判据：编程模式会话 ＋ 本会话最近终态 failed 的 run（tool_loop 折回面——
// 1779 裁：Blocked 载 reason 可接续、以失败态收束于 UI）⇒ 显续跑输入行。
import { computed, ref } from "vue";
import type { RunState } from "../models";

/** 本会话最近终态 failed 的 run（无 ⇒ null） */
export function pickFailedRun(
    runs: Record<string, RunState>,
    conversationId: string | null,
): RunState | null {
    if (!conversationId) return null;
    const failed = Object.values(runs).filter(
        (r) => r.conversationId === conversationId && r.status === "failed",
    );
    if (failed.length === 0) return null;
    failed.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    return failed[0];
}

/** 续跑行的三件套：目标 run／note 输入／提交（非编程模式恒无目标） */
export function useResumeTarget(options: {
    enabled: () => boolean;
    runs: () => Record<string, RunState>;
    conversationId: () => string | null;
    resume: (taskId: string, note: string) => void;
}) {
    const note = ref("");
    const target = computed(() =>
        options.enabled()
            ? pickFailedRun(options.runs(), options.conversationId())
            : null,
    );

    function submit(): void {
        const run = target.value;
        if (!run || !note.value.trim()) return;
        const taskId = run.taskId;
        const text = note.value.trim();
        note.value = "";
        options.resume(taskId, text);
    }

    return { resumeNote: note, resumeTarget: target, submitResume: submit };
}
