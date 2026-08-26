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

/**
 * 按滚动容器状态同步滑块位置与高度：
 * - 高度：滑块/轨道 = 视口/内容（等比映射），最小 28px
 * - 位置：滑块位移 = 滑块可动余量 × (scrollTop / 内容可滚余量)
 */
function sync() {
  if (!el) return
  const { scrollTop, scrollHeight, clientHeight } = el
  if (scrollHeight <= clientHeight) {
    railVisible.value = false
    thumbHeight.value = 0
    return
  }
  const ratio = clientHeight / scrollHeight
  thumbHeight.value = Math.max(28, clientHeight * ratio)
  thumbTop.value = (clientHeight - thumbHeight.value) * (scrollTop / (scrollHeight - clientHeight))
  railVisible.value = true
}

function detach() {
  el?.removeEventListener('scroll', sync)
  observer?.disconnect()
  observer = null
  el = null
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
    sync()
  },
  { immediate: true },
)

onBeforeUnmount(detach)

defineExpose({ sync })
</script>

<template>
  <div class="scroll-area">
    <!-- 默认插槽：内容占位，对应 React 的 props.children -->
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
  background: rgba(128, 128, 128, 0.35);
}
</style>
