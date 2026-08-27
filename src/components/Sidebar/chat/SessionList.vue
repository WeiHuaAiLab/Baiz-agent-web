<script setup lang="ts">
// 对话列表：会话项（选中/置顶/预览/时间）、内联重命名、⋯ 操作菜单与全局遮罩。
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../../../stores/session";
import { useMessageStore } from "../../../stores/message";
import { useUiStore } from "../../../stores/ui";
import type { Conversation } from "../../../models";
import { formatRelativeTime } from "../../../utils/time";
import Icon from "../../common/Icon.vue";

const props = defineProps<{ items: Conversation[] }>();

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const messages = useMessageStore();
const ui = useUiStore();

/** 选中会话：若当前不在 / 聊天路由（如设置页），先跳回 / 再渲染会话内容。
 * 若正处于创建流程（新建会话/任务/创建项目表单），点击会话即放弃创建并切回会话视图。 */
function selectSession(id: string) {
    if (router.currentRoute.value.path !== "/") {
        void router.push("/");
    }
    if (ui.createMode) ui.closeCreate();
    session.select(id);
}

const menuFor = ref("");
const renameTarget = ref<Conversation | null>(null);
const renameTitle = ref("");

/** 取会话最后一条有内容的文本，截断 48 字作预览 */
function lastPreview(conversationId: string): string {
    const list = messages.byConversation[conversationId];
    if (!list || list.length === 0) return "";
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const text = list[i].text?.trim();
        if (text) return text.length > 48 ? `${text.slice(0, 48)}…` : text;
    }
    return "";
}

function messageCount(conversationId: string): number {
    return messages.byConversation[conversationId]?.length ?? 0;
}

function openSessionMenu(id: string) {
    menuFor.value = menuFor.value === id ? "" : id;
}

function startRename(item: Conversation) {
    // 弹窗编辑（不用 window.prompt——规范 §4.1）
    renameTarget.value = item;
    renameTitle.value = item.title;
    menuFor.value = "";
}

function cancelRename() {
    renameTarget.value = null;
    renameTitle.value = "";
}

async function commitRename() {
    const target = renameTarget.value;
    const title = renameTitle.value.trim();
    renameTarget.value = null;
    renameTitle.value = "";
    if (target && title) await session.rename(target.id, title);
}

function togglePin(item: Conversation) {
    void session.togglePin(item.id);
    menuFor.value = "";
}

function removeFromMenu(id: string) {
    void session.remove(id);
    menuFor.value = "";
}

// 监听 items 变化：deep 监听数组内部元素的增删/字段修改（引用不变也会触发）
watch(
    () => props.items,
    (newVal, oldVal) => {
        console.log("items changed", newVal, oldVal);
    },
    { deep: true },
);
</script>

<template>
    <ul class="session-list">
        <li
            v-for="item in props.items"
            :key="item.id"
            :class="{
                active: item.id === session.activeId,
                pinned: !!item.pinnedAt,
            }"
        >
            <div class="session-title-box">
                <span
                    class="session-title"
                    :title="item.title"
                    @click.stop="selectSession(item.id)"
                >
                    {{ item.title }}
                </span>
                <span class="session-time" @click.stop>
                    {{ formatRelativeTime(item.updatedAt) }}
                    <template v-if="messageCount(item.id)">
                        · {{ messageCount(item.id) }} 条</template
                    >
                </span>
                <span
                    v-if="item.id === session.activeId && lastPreview(item.id)"
                    class="session-preview"
                    @click.stop
                >
                    {{ lastPreview(item.id) }}
                </span>
            </div>
            <div
                class="session-more-wrap"
                :title="t('chat.sessionMenu')"
                @click.stop="openSessionMenu(item.id)"
            >
                <button type="button" class="session-more">⋯</button>
            </div>
            <Icon
                v-if="item.pinnedAt"
                name="pin"
                :size="12"
                class="pin-badge"
                @click.stop
            />
            <div v-if="menuFor === item.id" class="session-menu" @click.stop>
                <button type="button" @click="startRename(item)">
                    <Icon name="pen" :size="14" />
                    <span>{{ t("chat.renameTitle") }}</span>
                </button>
                <button type="button" @click="togglePin(item)">
                    <Icon name="pin" :size="14" />
                    <span>{{
                        item.pinnedAt ? t("chat.unpin") : t("chat.pin")
                    }}</span>
                </button>
                <button
                    type="button"
                    class="danger"
                    @click="removeFromMenu(item.id)"
                >
                    <Icon name="trash" :size="14" />
                    <span>{{ t("common.delete") }}</span>
                </button>
            </div>
        </li>
    </ul>

    <div v-if="menuFor" class="menu-mask" @click="menuFor = ''" />

    <div v-if="renameTarget" class="modal-mask" @click.self="cancelRename">
        <div class="modal-card">
            <h3>{{ t("chat.renameTitle") }}</h3>
            <input
                v-model="renameTitle"
                class="rename-input"
                :placeholder="renameTarget.title"
                autofocus
                @keyup.enter="commitRename"
                @keyup.esc="cancelRename"
            />
            <div class="modal-actions">
                <button type="button" class="btn-ghost" @click="cancelRename">
                    {{ t("common.cancel") }}
                </button>
                <button
                    type="button"
                    class="btn-primary"
                    :disabled="!renameTitle.trim()"
                    @click="commitRename"
                >
                    {{ t("chat.createConfirm") }}
                </button>
            </div>
        </div>
    </div>
</template>
