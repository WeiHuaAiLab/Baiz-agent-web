<script setup lang="ts">
// 通用 overlay 滚动条容器（对应 React 的 props.children 模式）：
// - 内容通过默认插槽 <slot /> 传入
// - 实际滚动容器由 props.target 传入（DOM 元素，或持有 $el 的组件实例，如 DynamicScroller）
// - 组件负责：监听 target 的 scroll 事件 + ResizeObserver，等比映射绘制悬浮滑块；
//   hover 淡入由纯 CSS 完成；内容高度变化（不触发 resize）时可手动调用 expose 的 sync()
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type ScrollTarget = HTMLElement | { $el?: HTMLElement } | null | undefined

const props = defineProps<{
  /** 实际滚动容器：DOM 元素，或组件实例（自动取其 $el） */
  target?: ScrollTarget
}>()

const railVisible = ref(false)
const thumbTop = ref(0)
const thumbHeight = ref(0)
const thumbStyle = computed(() => ({
  top: `${thumbTop.value}px`,
  height: `${thumbHeight.value}px`,
}))

let el: HTMLElement | null = null
let observer: ResizeObserver | null = null
// 监听 .scroll-area 自身尺寸（输入框变高 / 输入框拖拽 resize / 窗口变化都会改 area 高度），
// 用于驱动 rail 高度随之刷新，否则 thumb 在 rail 中的比例尺会失真
let areaObserver: ResizeObserver | null = null
// 拖拽支持：缓存 .scroll-area 引用供 drag 计算 rail 高度用；window 全局监听让鼠标
// 移出 thumb 也能继续拖。state 拆三段（dragStartY/dragStartScrollTop），
// 避免运行时反复计算、降低 mousemove 高频触发时的分配成本
let areaEl: HTMLElement | null = null
let dragging = false
let dragStartY = 0
let dragStartScrollTop = 0

function onDragMove(e: MouseEvent) {
    if (!dragging || !el) return
    if (!areaEl) return
    // rail 高度 = area 高度 - 12（与 sync 内的算法一致）
    const railHeight = Math.max(0, areaEl.clientHeight - 12)
    const usable = Math.max(0, railHeight - thumbHeight.value)
    const scrollable = el.scrollHeight - el.clientHeight
    if (usable <= 0 || scrollable <= 0) return
    const dy = e.clientY - dragStartY
    el.scrollTop = dragStartScrollTop + (dy / usable) * scrollable
}

function onDragEnd() {
    dragging = false
    // 拖动结束取消 body 的 user-select 屏蔽——见 startDrag 注释
    document.body.style.userSelect = ''
}

function startDrag(e: MouseEvent) {
    if (!el) return
    dragging = true
    dragStartY = e.clientY
    dragStartScrollTop = el.scrollTop
    // prevent 阻止默认行为：避免拖动期间浏览器选中下面文字 / 触发拖拽 ghost 图
    e.preventDefault()
    // 拖动期间屏蔽 body 文本选中——鼠标按下后未松开时若穿过文本节点，浏览器会插入选区
    document.body.style.userSelect = 'none'
}

/**
 * 按滚动容器状态同步滑块位置与高度：
 * - rail 高度 = area 高度 - 12（top:6 + bottom:6），覆盖整个 chat 区域（含输入框），
 *   让 thumb 在 rail 中的相对位置与"消息内容在消息区的相对位置"一致。
 * - 滑块高度按 (clientHeight / scrollHeight) × railHeight 缩放，最低 28px。
 * - 滑块位移 = (railHeight - thumbHeight) × (scrollTop / 内容可滚余量)。
 */
function sync() {
  if (!el) return
  const area = el.closest('.scroll-area') as HTMLElement | null
  const areaHeight = area?.clientHeight ?? el.clientHeight
  const railHeight = Math.max(0, areaHeight - 12)
  const { scrollTop, scrollHeight, clientHeight } = el
  if (scrollHeight <= clientHeight || railHeight <= 0) {
    railVisible.value = false
    thumbHeight.value = 0
    return
  }
  const ratio = clientHeight / scrollHeight
  thumbHeight.value = Math.max(28, railHeight * ratio)
  const maxOffset = Math.max(0, railHeight - thumbHeight.value)
  thumbTop.value =
    maxOffset * (scrollTop / Math.max(1, scrollHeight - clientHeight))
  railVisible.value = true
}

function detach() {
  el?.removeEventListener('scroll', sync)
  observer?.disconnect()
  observer = null
  el = null
  areaObserver?.disconnect()
  areaObserver = null
  areaEl = null
}

watch(
  () => props.target,
  (target) => {
    detach()
    const dom = target instanceof HTMLElement ? target : target?.$el ?? null
    if (!dom) return
    el = dom
    // scroll 事件驱动滑块跟随；ResizeObserver 兜底窗口/布局尺寸变化
    dom.addEventListener('scroll', sync, { passive: true })
    observer = new ResizeObserver(() => sync())
    observer.observe(dom)
    // rail 高度依赖 area 高度；输入框拖拽 resize / 输入框改变高度 / 窗口变化都会改 area
    const area = dom.closest('.scroll-area') as HTMLElement | null
    if (area) {
      areaEl = area
      areaObserver = new ResizeObserver(() => sync())
      areaObserver.observe(area)
    }
    sync()
  },
  { immediate: true },
)

onMounted(() => {
    // 全局监听：拖动期间鼠标可能移出 thumb，window 监听保证不丢事件
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
})

onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
})

onBeforeUnmount(detach)

defineExpose({ sync })
</script>

<template>
  <div class="scroll-area">
    <slot />
    <div v-show="railVisible" class="scroll-rail">
      <div
        class="scroll-thumb"
        :class="{ 'is-dragging': dragging }"
        :style="thumbStyle"
        @mousedown="startDrag"
    />
    </div>
  </div>
</template>

<style scoped>
.scroll-area {
  position: relative;
  width: 100%;
  height: 100%;
}

/* 悬浮滚动条：absolute 脱离文档流，不占空间；rail 整体 pointer-events: none 让点击穿透
   到下方内容，但 .scroll-thumb 单独开 auto 让用户能拖动滑块 */
.scroll-rail {
  position: absolute;
  top: 6px;
  right: 6px;
  bottom: 6px;
  width: 8px;
  border-radius: 4px;
  z-index: 30;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

.scroll-area:hover .scroll-rail {
  opacity: 1;
}

.scroll-thumb {
  position: absolute;
  right: 0;
  width: 8px;
  border-radius: 4px;
  /* 与全局滚动条滑块同色（内容区同色系浅灰），保持一致 */
  background: var(--scrollbar-thumb);
  /* 覆盖父 .scroll-rail 的 pointer-events: none，让 thumb 可被点击/拖动；
     grab 光标暗示「这里可拖」，按下后切 grabbing */
  pointer-events: auto;
  cursor: grab;
}

.scroll-thumb.is-dragging {
  cursor: grabbing;
  /* 拖动中：聚焦加深一档（与全局滚动条 active 一致），告知用户正在响应 */
  background: var(--scrollbar-thumb-active);
}
</style>
