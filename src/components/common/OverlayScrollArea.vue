<script setup lang="ts">
// 通用 overlay 滚动条容器（对应 React 的 props.children 模式）：
// - 内容通过默认插槽 <slot /> 传入
// - 实际滚动容器由 props.target 传入（DOM 元素，或持有 $el 的组件实例，如 DynamicScroller）
// - 组件负责：监听 target 的 scroll 事件 + ResizeObserver，等比映射绘制悬浮滑块；
//   hover 淡入由纯 CSS 完成；内容高度变化（不触发 resize）时可手动调用 expose 的 sync()
import { computed, onBeforeUnmount, ref, watch } from 'vue'

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
      areaObserver = new ResizeObserver(() => sync())
      areaObserver.observe(area)
    }
    sync()
  },
  { immediate: true },
)

onBeforeUnmount(detach)

defineExpose({ sync })
</script>

<template>
  <div class="scroll-area">
    <slot />
    <div v-show="railVisible" class="scroll-rail">
      <div class="scroll-thumb" :style="thumbStyle" />
    </div>
  </div>
</template>

<style scoped>
.scroll-area {
  position: relative;
  width: 100%;
  height: 100%;
}

/* 悬浮滚动条：absolute 脱离文档流，不占空间、不拦截点击；hover 容器时淡入 */
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
}
</style>
