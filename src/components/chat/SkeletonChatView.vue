<script setup lang="ts">
// 对话骨架屏（MSG-2662）：会话切换/初次加载消息时占位，避免空帧闪 empty-state。
</script>

<template>
    <div class="skeleton-chat" aria-busy="true" aria-label="加载会话中">
        <!-- 1. 用户消息：右对齐灰色气泡（单条短问） -->
        <div class="message-inner">
            <div class="msg user">
                <span class="sk-line sk-elapsed" style="width: 32%" />
            </div>
        </div>
        <!-- 2. AI 消息：左对齐 .msg-head + 段落 + 时间戳 -->
        <div class="message-inner">
            <div class="msg assistant">
                <div class="msg-head">
                    <span class="sk-line sk-elapsed" />
                </div>
                <div class="sk-content">
                    <span class="sk-line" style="width: 92%" />
                    <span class="sk-line" style="width: 80%" />
                    <span class="sk-line" style="width: 66%" />
                </div>
                <div class="sk-msg-time" />
            </div>
        </div>

        <!-- 1. 用户消息：右对齐灰色气泡（单条短问） -->
        <div class="message-inner">
            <div class="msg user">
                <span class="sk-line sk-elapsed" style="width: 32%" />
            </div>
        </div>
        <!-- 2. AI 消息：左对齐 .msg-head + 段落 + 时间戳 -->
        <div class="message-inner">
            <div class="msg assistant">
                <div class="msg-head">
                    <span class="sk-line sk-elapsed" />
                </div>
                <div class="sk-content">
                    <span class="sk-line" style="width: 92%" />
                    <span class="sk-line" style="width: 80%" />
                    <span class="sk-line" style="width: 66%" />
                </div>
                <div class="sk-msg-time" />
            </div>
        </div>
    </div>
</template>
