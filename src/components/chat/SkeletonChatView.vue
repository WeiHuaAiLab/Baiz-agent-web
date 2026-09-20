<script setup lang="ts">
// 对话骨架屏（MSG-3233 ④：自 origin/main 逐字挑件）。
// 挂点：**加载中且消息为空**时盖骨架（避免空帧闪 empty-state）。
//
// 设计原则（上游原文照录）：
// 1. 宽度/居中/底部呼吸全部复用真实消息的 .message-inner（720px 居中 + padding-bottom
//    10px），落定后骨架被替换成真实消息时不发生位移。
// 2. 真实 AssistantMessage 的结构是 .msg-head（耗时 + 操作）+ 正文——没有头像。
//    骨架也跟着去掉头像、去掉 .sk-assistant-body 的 padding-left，保证正文左边缘
//    与真实消息完全对齐（之前有 avatar 时骨架正文右偏 34px，肉眼可辨）。
// 3. 占位块使用比 --surface-2 更深一度的灰色（color-mix 混入少量 --text），
//    在浅色/深色背景下都有可见对比，避免原来"一片白"的丑陋感。
// 4. 仅占视觉，不响应交互：aria-busy="true" + aria-label，鼠标事件全部吞掉。
</script>

<template>
  <div class="skeleton-chat" aria-busy="true" aria-label="加载会话中">
    <div class="message-inner">
      <div class="msg user">
        <div class="user-text">
          <div class="sk-line sk-user-bubble" />
        </div>
      </div>
    </div>

    <div class="message-inner">
      <div class="msg assistant sk-assistant">
        <div class="sk-line sk-meta" style="width: 72px" />
        <div class="sk-assistant-body">
          <div class="sk-line" style="width: 92%" />
          <div class="sk-line" style="width: 78%" />
          <div class="sk-line" style="width: 64%" />
        </div>
      </div>
    </div>

    <div class="message-inner">
      <div class="msg assistant sk-assistant">
        <div class="sk-line sk-meta" style="width: 72px" />
        <div class="sk-assistant-body">
          <div class="sk-line" style="width: 88%" />
          <div class="sk-line" style="width: 55%" />
        </div>
      </div>
    </div>

    <div class="message-inner">
      <div class="msg user">
        <div class="user-text">
          <div class="sk-line sk-user-bubble" />
        </div>
      </div>
    </div>
  </div>
</template>
