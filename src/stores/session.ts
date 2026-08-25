// 会话 store：会话 CRUD、置顶排序、草稿清理，IndexedDB 持久化。
import { defineStore } from "pinia";
import { db } from "../db";
import type { Conversation } from "../models";

function cloneForDb<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(): string {
    try {
        if (
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
        ) {
            return crypto.randomUUID();
        }
    } catch {
        /* fall through */
    }
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useSessionStore = defineStore("session", {
    state: () => ({
        conversations: [] as Conversation[],
        activeId: "",
    }),
    getters: {
        active(state): Conversation | null {
            return (
                state.conversations.find(
                    (item) => item.id === state.activeId,
                ) ?? null
            );
        },
    },
    actions: {
        async load() {
            const rows = await db.conversations.toArray();
            rows.sort((a, b) => {
                const pinnedA = a.pinnedAt ?? 0;
                const pinnedB = b.pinnedAt ?? 0;
                if (pinnedA !== pinnedB) return pinnedB - pinnedA;
                return b.updatedAt - a.updatedAt;
            });
            this.conversations = rows;
            if (!this.activeId && this.conversations.length > 0) {
                this.activeId = this.conversations[0].id;
            }
        },
        async create(title?: string) {
            const now = Date.now();
            const conversation: Conversation = {
                id: makeId(),
                title: title?.trim() || "新会话",
                createdAt: now,
                updatedAt: now,
            };
            await db.conversations.add(cloneForDb(conversation));
            this.conversations.unshift(conversation);
            this.activeId = conversation.id;
            return conversation.id;
        },
        async remove(id: string) {
            await db.conversations.delete(id);
            await db.messages.where("conversationId").equals(id).delete();
            await db.drafts.delete(id);
            this.conversations = this.conversations.filter(
                (item) => item.id !== id,
            );
            if (this.activeId === id) {
                this.activeId = this.conversations[0]?.id ?? "";
            }
        },
        async rename(id: string, title: string) {
            const item = this.conversations.find((entry) => entry.id === id);
            if (!item) return;
            const next = title.trim();
            if (next && next !== item.title) {
                item.title = next;
                await db.conversations.put(cloneForDb(item));
            }
        },
        async togglePin(id: string) {
            const item = this.conversations.find((entry) => entry.id === id);
            if (!item) return;
            if (item.pinnedAt) {
                delete item.pinnedAt;
            } else {
                item.pinnedAt = Date.now();
            }
            await db.conversations.put(cloneForDb(item));
            await this.load();
        },
        select(id: string) {
            console.log("切换会话内容", id);
            this.activeId = id;
        },
        async touch(id: string) {
            const item = this.conversations.find((entry) => entry.id === id);
            if (item) {
                item.updatedAt = Date.now();
                await db.conversations.put(cloneForDb(item));
            }
        },
    },
});
