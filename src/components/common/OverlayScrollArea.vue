<script setup lang="ts">
// 通用滚动容器（v2，性能优先版）：
// - 内容通过默认插槽 <slot /> 传入
// - 不再维护悬浮滚动条 / scroll 监听 / ResizeObserver / 拖拽逻辑——
//   这些运行时都让给浏览器原生滚动条（内置 overflow + scrollbar-width: thin）。
// - 保留 .scroll-area DOM 结构（外层 ChatView 的 .chat-body 仍挂此 class），
//   保证升级为普通容器时外层 CSS / 布局零变动。
//
// 历史：本组件曾作为「悬浮滚动条容器」使用（监听 target 的 scroll + ResizeObserver × 2
//   + 拖拽滑块），但 chat 场景实测显示：原滚动层（DynamicScroller）的滚动事件触发
//   高频，悬浮条同步反而抢占主线程、并触发回流；改用原生滚动条后，浏览器自身处理
//   滚动 + 滚动条绘制，零 JS 成本，且 macOS/Windows 都默认细滚动条，体验一致。
//
// prop `target` 保留为可选 noop 兼容位（外部仍可能传入，不报错即兼容）。
defineProps<{
  /** 已废弃：原悬浮滚动条 target。保留仅为兼容外部调用，新代码不应再使用。 */
  target?: unknown
}>()
</script>

<template>
  <div class="scroll-area">
    <slot />
  </div>
</template>

<style scoped>
.scroll-area {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>