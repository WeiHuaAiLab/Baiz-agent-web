<script setup lang="ts">
// 聊天输入区：两段式结构——输入区（textarea 默认 98px、超出 300px 滚动）+
// 操作功能区（左侧「+」上传附件 / 语音 / 发送）。并承载输入草稿保存/恢复、pendingPrompt 处理，
// 以及定时任务创建的覆盖流程。发送成功后 emit('submitted')，由外层驱动内容体回到底部。
// 附件：点「+」调起本地文件选择（files.attachFromPicker），已选附件以 chip 展示在输入框上方、可单个移除，
// 发送时随消息一并提交（sendWith 携带 files.attachments）。
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../../stores/session";
import { useMessageStore } from "../../stores/message";
import { useSettingsStore } from "../../stores/settings";
import {
    useWorkspaceStore,
    createEmptyTaskDraft,
} from "../../stores/workspace";
import type { TaskDraft } from "../../stores/workspace";
import { useUiStore } from "../../stores/ui";
import { useFilesStore } from "../../stores/files";
import { useExecModeStore } from "../../stores/execMode";
import type { ExecMode } from "../../stores/execMode";
import { getBridge } from "../../bridge";
import { clearDraft, loadDraft, saveDraft } from "../../drafts";
import { formatFileSize, shortMime } from "../../utils/format";
import {
    commandRiskFlag,
    translateCommand,
} from "../../utils/commandTranslator";
import Icon from "../common/Icon.vue";
import TaskForm from "../common/TaskForm.vue";

const emit = defineEmits<{ (e: "submitted"): void }>();

const { t } = useI18n();
const session = useSessionStore();
const messages = useMessageStore();
const settings = useSettingsStore();
const workspace = useWorkspaceStore();
const ui = useUiStore();
const files = useFilesStore();
// MSG-3189 E1：介入方式（三档·当前档常显）
const execMode = useExecModeStore();
const execMenuOpen = ref(false);
const execModeOptions = computed<Array<{ value: ExecMode; label: string; hint: string }>>(() => [
    { value: "plan", label: t("execMode.plan"), hint: t("execMode.planHint") },
    { value: "confirm", label: t("execMode.confirm"), hint: t("execMode.confirmHint") },
    { value: "auto", label: t("execMode.auto"), hint: t("execMode.autoHint") },
]);
const execModeTitle = computed(() =>
    t("execMode.title", {
        mode: t(`execMode.${execMode.mode}`),
        hint: t(`execMode.${execMode.mode}Hint`),
    }),
);
async function chooseExecMode(mode: ExecMode) {
    execMenuOpen.value = false;
    await execMode.setMode(mode);
}
// DEBT-540-B：＋号门禁前置——能力门前置钮层（tauri 壳未注册时禁用＋
// 单条明示——勿点击后连 toast）
const attachSupported = computed(() => getBridge().has('fs.pickAttachment'));

const input = ref("");
const taskDraft = ref<TaskDraft>(createEmptyTaskDraft());
let draftTimer: ReturnType<typeof setTimeout> | null = null;

// 根容器：改为 absolute 定位后脱离文档流，消息区会完整占满 chat-body。
// 这里用 ResizeObserver 把自身高度同步为 :root 上的 --chat-input-h，
// 由 .chat-body 的 padding-bottom（--chat-input-h + 20px）为「滚动到最底部」预留空间，
// 最后一条消息恰好停在输入框上方、不被遮挡。
// 变量挂在 documentElement 而非 .chat-body：避免元素作用域/时序导致 CSS 拿不到值，
// CSS 侧还有默认值兜底（见 core.css .chat-body）。
const inputRoot = ref<HTMLElement>();
// composer 容器 ref：drag 事件挂在此处（不挂在 .chat-input 整个外层），
// 让遮罩精确覆盖 composer 本体、不沾染 .chat-input 的 padding/margin。
const composerRef = ref<HTMLElement>();
let heightObserver: ResizeObserver | null = null;

onMounted(() => {
    const root = inputRoot.value;
    if (!root) return;
    const syncHeight = () => {
        document.documentElement.style.setProperty(
            "--chat-input-h",
            `${root.offsetHeight}px`,
        );
    };
    syncHeight();
    heightObserver = new ResizeObserver(syncHeight);
    heightObserver.observe(root);
});

const voiceHint = ref(false);
// 批0 语音：浏览器形态用 Web Speech API 真转写；Tauri 形态后续接 sherpa-onnx
const listening = ref(false);
let recognizer: {
    start(): void;
    stop(): void;
    lang: string;
    onresult:
        | ((e: {
              results: ArrayLike<ArrayLike<{ transcript: string }>>;
          }) => void)
        | null;
    onend: (() => void) | null;
} | null = null;
const speechSupported =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

// IME 输入法状态：选词阶段的 Enter 是「确认候选词」而非「发送消息」，
// 若不加守卫，输入"你好"按 Enter 选词会意外触发发送。
// 用 ref 而非 let：模板里 @compositionstart/end 直接赋值会被 Vue
// 类型推断成 ref，模板自动 unwrap，无须 .value。
const composing = ref(false);

// 拖拽上传：dragOver 控制遮罩显隐；dragCounter 解决子元素进出闪屏
// （每进一个子元素触发一次 dragenter、离开触发 dragleave，靠引用计数平衡）
const dragOver = ref(false);
let dragCounter = 0;

const activeId = computed(() => session.activeId);
const streamingRuns = computed(() => messages.activeRuns(activeId.value));
const runningRun = computed(() => streamingRuns.value[0] ?? null);
// 批0 成本小字：当前会话最近一次完成的 run 的 usage 账
const lastUsage = computed(() => {
    const cid = activeId.value;
    if (!cid) return null;
    const completed = Object.values(messages.runs)
        .filter(
            (r) =>
                r.conversationId === cid && r.status === "completed" && r.usage,
        )
        .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    return completed[0]?.usage ?? null;
});
const costText = computed(() => {
    const u = lastUsage.value;
    if (!u) return null;
    // 标准 v1.0 §A3：计费展示改读后端值（usage.cost_usd／cost_per_mtok）——
    // 前端自备单价表已删；后端未给成本即不显示金额，禁前端另算一份。
    const parts: string[] = [];
    if (u.costUsd !== undefined) {
        parts.push(`本轮 $${u.costUsd.toFixed(4)}（¥${(u.costUsd * 7.1).toFixed(3)}）`);
    }
    parts.push(`${u.totalTokens.toLocaleString()} tokens`);
    if (u.costPerMtok !== undefined) parts.push(`$${u.costPerMtok}/MTok`);
    parts.push("验证 ✅");
    return parts.join(" · ");
});
// 批0 命令翻译：输入框里打命令时实时给一句人话 + 危险预警
const commandTranslation = computed(() => translateCommand(input.value));
const commandRisk = computed(() => commandRiskFlag(input.value.trim()));

// 进入定时任务创建模式时重置表单
watch(
    () => ui.createMode,
    (mode) => {
        if (mode === "scheduled") {
            taskDraft.value = createEmptyTaskDraft();
        }
    },
);

// 会话切换：保存旧会话草稿、恢复新会话草稿
watch(
    activeId,
    async (id, oldId) => {
        if (oldId) void saveDraft(oldId, input.value);
        if (id) input.value = await loadDraft(id);
    },
    { immediate: true },
);

// 输入防抖保存草稿
watch(input, () => {
    if (draftTimer) clearTimeout(draftTimer);
    const id = activeId.value;
    const text = input.value;
    draftTimer = setTimeout(() => {
        // 边界守护：会话切换瞬间 input 被清空触发本 watch，
        // 但此时 activeId 已切到新会话——若不校验，会把空字符串写到
        // 新会话草稿位、覆盖掉刚刚 loadDraft 恢复的内容
        if (activeId.value !== id) return;
        if (id) void saveDraft(id, text);
    }, 300);
});

onBeforeUnmount(() => {
    heightObserver?.disconnect();
    heightObserver = null;
    if (draftTimer) clearTimeout(draftTimer);
    if (activeId.value) void saveDraft(activeId.value, input.value);
});

/** 语音按钮：暂时展示"即将上线"提示 */
function toggleVoice() {
    // 浏览器形态：真实语音转写；不支持时保留"即将上线"占位
    if (speechSupported && !listening.value) {
        const SR = window as unknown as {
            SpeechRecognition?: new () => NonNullable<typeof recognizer>;
            webkitSpeechRecognition?: new () => NonNullable<typeof recognizer>;
        };
        const Ctor = SR.SpeechRecognition ?? SR.webkitSpeechRecognition;
        if (Ctor) {
            // 容错：构造/启动可能抛错（权限被拒、环境不支持等），失败回退占位提示
            try {
                const rec: NonNullable<typeof recognizer> = new Ctor();
                rec.lang = "zh-CN";
                rec.onresult = (e) => {
                    const transcript = e.results[0]?.[0]?.transcript ?? "";
                    if (transcript)
                        input.value =
                            (input.value ? input.value + " " : "") + transcript;
                };
                rec.onend = () => {
                    listening.value = false;
                };
                rec.start();
                recognizer = rec;
                listening.value = true;
                return;
            } catch (error) {
                // 麦克风权限被拒/环境不支持等：静默回退到占位提示，但留日志便于排查
                console.warn('[baiz] speech recognition init failed:', error);
                recognizer = null;
            }
        }
    }
    voiceHint.value = true;
    setTimeout(() => {
        voiceHint.value = false;
    }, 1800);
}

function stopVoice() {
    recognizer?.stop();
    listening.value = false;
}

function send() {
    const trimmed = input.value.trim();
    if (!trimmed) return;
    sendWith(trimmed);
}

/**
 * 异步发送：
 * 1) 同步乐观清理（附件/草稿/输入框立刻清，避免连击重复）；
 * 2) await sendUserMessage → 等 chat.send RPC 受理回执（{task_id, status, model}）；
 *    失败已被 sendUserMessage 内部 try/catch 兜住为红条 status 消息；
 * 3) emit("submitted") 由 ChatView 驱动 scrollToBottom，此时 user 消息与可能的
 *    错误消息都已同步入响应式数组（push 先于 IndexedDB await 同步写入），nextTick
 *    后 DOM 渲染完成再贴底。
 * 4) SSE 流式期间 ChatContent 的 startPinLoop（rAF）持续贴底，无需此处再触。
 */
async function sendWith(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const attachments = [...files.attachments];
    void files.clearAttachments();
    void session.touch(activeId.value);
    void clearDraft(activeId.value);
    input.value = "";
    await messages.sendUserMessage(
        activeId.value,
        trimmed,
        settings.activeWorkspace || undefined,
        attachments,
        // MSG-2722：编程模式（ui.programmingMode）→ mode=programming——
        // daemon ToolLoop 真件链分流（缺省 chat 旧路零变）
        ui.programmingMode ? "programming" : undefined,
    );
    emit("submitted");
}

// ── MSG-2722 L3 编程 UI：Blocked 人工回传续跑行 ──
// 判据：编程模式会话＋最近任务终态失败/回执含 Blocked（tool_loop 折回
// 面——1779 裁：Blocked 载 reason 可接续）——显续跑输入行
const resumeNote = ref("");
const resumeTarget = computed(() => {
    if (!ui.programmingMode) return null;
    const cid = activeId.value;
    if (!cid) return null;
    // 本会话最近终态 failed 的 run——续跑目标（Blocked 折回以失败态
    // 收束于 UI——1779 裁：可人工回传续跑）
    const failed = Object.values(messages.runs).filter(
        (r) => r.conversationId === cid && r.status === "failed",
    );
    if (failed.length === 0) return null;
    failed.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    return failed[0];
});
function submitResume() {
    const run = resumeTarget.value;
    if (!run || !resumeNote.value.trim()) return;
    const taskId = run.taskId;
    const note = resumeNote.value.trim();
    resumeNote.value = "";
    void messages.resumeRun(taskId, note);
}

/** Enter：发送（IME 选词阶段不发送，避免中文输入误触） */
function onEnter() {
    if (composing.value) return;
    send();
}

function stopCurrent() {
    if (runningRun.value) messages.stopRun(runningRun.value.taskId);
}

// 拖拽上传——仅 ChatInput 区接收；非文件类型（纯文本/URL）直接忽略，
// 不抢用户「拖文本进输入框」的体验。
function onDragEnter(e: DragEvent) {
    // 仅识别文件拖入，避免文本/链接误触发遮罩
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragCounter++;
    dragOver.value = true;
}

function onDragOver(e: DragEvent) {
    // 必须 preventDefault 否则 drop 不触发；同时声明 dropEffect 让光标显示为「复制」
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
}

function onDragLeave(e: DragEvent) {
    // 用 relatedTarget 判「真离开容器」：relatedTarget 不在 composer 子树内才计数
    const root = composerRef.value;
    if (root && e.relatedTarget && root.contains(e.relatedTarget as Node)) return;
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) dragOver.value = false;
}

async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragCounter = 0;
    dragOver.value = false;
    const list = e.dataTransfer?.files;
    if (!list || list.length === 0) return;
    if (!attachSupported.value) {
        // 与「+」按钮 attachUnsupported 路径对齐：能力缺失时即时 toast
        ui.toast(t("chat.dropUnsupported"), "error");
        return;
    }
    await files.attachFromFiles(Array.from(list));
}

async function submitCreate() {
    if (!taskDraft.value.title.trim()) return;
    workspace.addTask({ ...taskDraft.value });
    ui.closeCreate();
}

// pendingPrompt（新手引导"试玩"等）：仅在输入框为空时填入并发送，
// 避免覆盖用户正在打字的内容——保护用户已输入数据
watch(
    () => ui.pendingPrompt,
    (prompt) => {
        if (!prompt) return;
        if (input.value === "") {
            input.value = prompt;
            sendWith(prompt);
        }
        // 输入框非空时：直接消费掉 prompt，不打扰用户
        ui.setPendingPrompt("");
    },
);
</script>

<template>
    <div v-if="ui.createMode === 'scheduled'" class="create-overlay">
        <div class="create-card">
            <h3>
                {{ t("tasks.addScheduled") }}
            </h3>
            <TaskForm v-model="taskDraft" />
            <div class="create-actions">
                <button
                    type="button"
                    class="btn-ghost"
                    @click="ui.closeCreate()"
                >
                    {{ t("common.cancel") }}
                </button>
                <button
                    type="button"
                    class="btn-primary"
                    :disabled="!taskDraft.title.trim()"
                    @click="submitCreate"
                >
                    {{ t("chat.createConfirm") }}
                </button>
            </div>
        </div>
    </div>

    <div ref="inputRoot" class="chat-input">
        <!-- MSG-2722 L3 编程 UI：Blocked/失败任务人工回传续跑行（daemon
            tool_loop.resume——note 回传文本） -->
        <form
            v-if="resumeTarget"
            class="resume-bar"
            @submit.prevent="submitResume()"
        >
            <span class="resume-label">{{ t("chat.resumeHint") }}</span>
            <input
                v-model="resumeNote"
                class="resume-note"
                type="text"
                :placeholder="t('chat.resumePlaceholder')"
                :aria-label="t('chat.resumePlaceholder')"
            />
            <button type="submit" class="send-btn" :disabled="!resumeNote.trim()">
                <Icon name="refresh" :size="15" />
            </button>
        </form>
        <form
            ref="composerRef"
            class="composer composer-block"
            :class="{ 'is-dragover': dragOver }"
            @submit.prevent="send()"
            @dragenter="onDragEnter"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
        >
            <div v-if="files.attachments.length" class="attachment-row">
                <div
                    v-for="att in files.attachments"
                    :key="att.id"
                    class="attachment-chip"
                    :class="{
                        'is-image': att.kind === 'image',
                        'is-file': att.kind === 'file',
                    }"
                >
                    <img
                        v-if="att.kind === 'image' && att.dataUrl"
                        class="att-thumb"
                        :src="att.dataUrl"
                        :alt="att.name"
                        :title="att.name"
                    />
                    <div v-else class="att-meta">
                        <div class="att-name" :title="att.name">
                            {{ att.name }}
                        </div>
                        <div class="att-tag">
                            {{ shortMime(att.mimeType) }} ·
                            {{ formatFileSize(att.size) }}
                        </div>
                    </div>
                    <button
                        type="button"
                        class="att-remove"
                        :title="t('common.delete')"
                        @click="files.removeAttachment(att.id)"
                    >
                        <Icon name="x" :size="12" />
                    </button>
                </div>
            </div>

            <div class="composer-input">
                <textarea
                    v-model="input"
                    class="input-area"
                    :placeholder="t('chat.placeholder')"
                    @keydown.enter.exact.prevent="onEnter"
                    @compositionstart="composing = true"
                    @compositionend="composing = false"
                />
            </div>

            <!-- 批0 命令翻译条：认出命令就给一句人话 -->
            <div v-if="commandTranslation" class="xp-cmd-translate">
                <span class="xp-subtitle-tag">翻译</span>
                <span class="xp-cmd-text">{{ commandTranslation }}</span>
                <span v-if="commandRisk" class="xp-cmd-risk">{{
                    commandRisk
                }}</span>
            </div>

            <!-- 操作功能区：+（项目菜单）/ 语音 / 发送 -->
            <div class="composer-actions">
                <button
                    type="button"
                    class="act-btn"
                    :class="{ active: files.attachments.length > 0, disabled: !attachSupported }"
                    :disabled="!attachSupported"
                    :title="attachSupported ? t('chat.attachFile') : t('chat.attachUnsupported')"
                    :aria-label="attachSupported ? t('chat.attachFile') : t('chat.attachUnsupported')"
                    @click="files.attachFromPicker()"
                >
                    <Icon name="plus" :size="16" />
                </button>

                <!-- MSG-3189 E1：介入方式选择器（`+` 旁·**当前档常显**·默认「每次确认」） -->
                <div class="exec-mode">
                    <button
                        type="button"
                        class="act-btn exec-mode-btn"
                        :class="{ active: execMode.isAuto }"
                        :title="execModeTitle"
                        :aria-label="execModeTitle"
                        aria-haspopup="menu"
                        :aria-expanded="execMenuOpen"
                        data-exec-mode="button"
                        @click="execMenuOpen = !execMenuOpen"
                    >
                        <Icon name="shield" :size="16" />
                        <span class="exec-mode-label">{{ t(`execMode.${execMode.mode}`) }}</span>
                    </button>
                    <div v-if="execMenuOpen" class="exec-mode-menu" role="menu">
                        <button
                            v-for="option in execModeOptions"
                            :key="option.value"
                            type="button"
                            role="menuitemradio"
                            class="exec-mode-item"
                            :class="{ active: execMode.mode === option.value }"
                            :aria-checked="execMode.mode === option.value"
                            :data-mode="option.value"
                            @click="chooseExecMode(option.value)"
                        >
                            <span class="em-name">{{ option.label }}</span>
                            <span class="em-hint">{{ option.hint }}</span>
                        </button>
                        <!-- E2④ 三层正交：介入方式（本档）× 记住范围（卡上四档）× 授权目录 -->
                        <p class="em-note">{{ t('execMode.orthogonal') }}</p>
                    </div>
                </div>

                <!-- MSG-2722 L3 编程 UI：编程模式钮（mode=programming——
                    ToolLoop 真件链——发送侧消费 ui.programmingMode） -->
                <button
                    type="button"
                    class="act-btn"
                    :class="{ active: ui.programmingMode }"
                    :title="ui.programmingMode ? t('chat.programModeOn') : t('chat.programModeOff')"
                    :aria-label="ui.programmingMode ? t('chat.programModeOn') : t('chat.programModeOff')"
                    @click="ui.programmingMode = !ui.programmingMode"
                >
                    <Icon name="tools" :size="16" />
                </button>

                <span class="actions-spacer" />

                <button
                    type="button"
                    class="act-btn"
                    :class="{ 'voice-listening': listening }"
                    :title="
                        listening ? t('chat.voiceStop') : t('chat.voiceInput')
                    "
                    @click="listening ? stopVoice() : toggleVoice()"
                >
                    <Icon :name="listening ? 'stop' : 'mic'" :size="16" />
                </button>

                <button
                    v-if="runningRun"
                    type="button"
                    class="send-btn stop"
                    :title="t('chat.stop')"
                    :aria-label="t('chat.stop')"
                    @click="stopCurrent"
                >
                    <Icon name="stop" :size="15" />
                </button>
                <button
                    v-else
                    type="submit"
                    class="send-btn"
                    :disabled="!input.trim()"
                    :title="t('chat.send')"
                >
                    <Icon name="send" :size="16" />
                </button>
            </div>

            <span v-if="voiceHint" class="voice-hint">{{
                t("chat.voiceComing")
            }}</span>

            <!-- 拖拽上传遮罩：仅覆盖 composer 本体（不含 chat-input 的 padding/margin）；
                 pointer-events: none 让底层 drop 仍能命中容器 -->
            <div v-if="dragOver" class="drag-overlay" aria-hidden="true">
                <div class="drag-overlay-text">
                    {{ t('chat.dropHint') }}
                </div>
            </div>
        </form>
        <!-- 批0 成本小字：真实 usage 记账（done 帧回填） -->
        <div v-if="costText" class="xp-cost">{{ costText }}</div>
    </div>
</template>
