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
import { clearDraft, loadDraft, saveDraft } from "../../drafts";
import { formatFileSize, shortMime } from "../../utils/format";
import { estimateCostUsd } from "../../stores/message";
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
    const cny = (u.costUsd * 7.1).toFixed(3);
    return `本轮 ¥${cny} · ${u.totalTokens.toLocaleString()} tokens · 验证 ✅`;
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
            } catch {
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

function sendWith(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const attachments = [...files.attachments];
    void messages.sendUserMessage(
        activeId.value,
        trimmed,
        settings.activeWorkspace || undefined,
        attachments,
    );
    void files.clearAttachments();
    void session.touch(activeId.value);
    void clearDraft(activeId.value);
    input.value = "";
    emit("submitted");
}

/** Enter：发送 */
function onEnter() {
    send();
}

function stopCurrent() {
    if (runningRun.value) messages.stopRun(runningRun.value.taskId);
}

async function submitCreate() {
    if (!taskDraft.value.title.trim()) return;
    workspace.addTask({ ...taskDraft.value });
    ui.closeCreate();
}

// pendingPrompt（新手引导"试玩"等）：填入输入框并直接发送
watch(
    () => ui.pendingPrompt,
    (prompt) => {
        if (prompt) {
            input.value = prompt;
            sendWith(prompt);
            ui.setPendingPrompt("");
        }
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
        <form class="composer composer-block" @submit.prevent="send()">
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
                    :class="{ active: files.attachments.length > 0 }"
                    :title="t('chat.attachFile')"
                    @click="files.attachFromPicker()"
                >
                    <Icon name="plus" :size="16" />
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

            <div class="composer-hint">
                <span>Enter 发送</span>
            </div>

            <span v-if="voiceHint" class="voice-hint">{{
                t("chat.voiceComing")
            }}</span>
        </form>
        <!-- 批0 成本小字：真实 usage 记账（done 帧回填） -->
        <div v-if="costText" class="xp-cost">{{ costText }}</div>
    </div>
</template>
