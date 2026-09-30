<script setup lang="ts">
// 滚动速览条（右侧缩略横杠浮栏，贴滚动轴左侧）：
//   1) **每段 ≈ 滚动容器总可滚动高度的 16%**（默认 N=7：100%/6 ≈ 16.67%≈16%）；
//      **最后一个 bar 映射到底部（100%）**——点击与高亮用同一公式 `i/(N-1)`，
//      点击 bar i 即跳到 scrollTop = i/(N-1) × (scrollHeight − clientHeight)，
//      跳后该 bar 即时点亮（公式自洽，无错位）；
//   2) 横杠在 100px 浮栏内以 flex space-between 分布，自动落在 0/16.67/…/100% 高度位；
//   3) 当前活动段＝**滚动条 thumb 顶部位置** `scrollTop / total` 落在哪段——
//      与浏览器原生滚动条 thumb 同步移动；
//   4) 横杠宽度按段位确定性取长短（"文本缩略"观感，非真随机以免重渲染闪跳）；
//   5) 点击任一段 ⇒ emit('seek', index)，父层**直写 scrollTop**（动态高度 item
//      用 scrollToItem 跳到 item 累计偏移，非用户意图的 X% 位置；
//      直写与高亮同源、零错位，DynamicScroller 不禁原生 scrollTop）；
//   6) 显示门槛：滚动内容高度 > 视口 × 3 才显示，避免短消息干扰；
//      **窄屏门**：滚动容器 clientWidth < 900px 时也不显示——窄屏左右已经很挤，
//      多挂一个 100px 浮栏会侵占消息列宽、与悬浮滚动条叠位更糟；
//   7) 用户点击/拖滚动条的非贴底位置后，自动 unpin（onScroll 走贴底判定）。
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = withDefaults(
  defineProps<{
    /** 实际滚动容器（提供 clientHeight/scrollHeight/scrollTop）；null 时不渲染 */
    scrollEl: HTMLElement | null;
    /** 分段数（横杠根数，默认 7：6 间隔 ≈ 16.67%，最后一段映射到底部 100%） */
    segments?: number;
  }>(),
  { segments: 7 },
);

const emit = defineEmits<{
  /** 用户点击第 i 段（0..segments-1）——父层映射到消息索引走 scrollToItem */
  (e: "seek", index: number): void;
}>();

const { t } = useI18n();

const clientHeight = ref(0);
const scrollHeight = ref(0);
const clientWidth = ref(0);
const scrollTop = ref(0);

let ro: ResizeObserver | null = null;
let onScrollEvt: (() => void) | null = null;
let attachedEl: HTMLElement | null = null;

function refreshMetrics(el: HTMLElement) {
  clientHeight.value = el.clientHeight;
  scrollHeight.value = el.scrollHeight;
  clientWidth.value = el.clientWidth;
  scrollTop.value = el.scrollTop;
}

function attach(el: HTMLElement | null) {
  detach();
  if (!el) return;
  attachedEl = el;
  refreshMetrics(el);
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => refreshMetrics(el));
    ro.observe(el);
    // 内容 wrapper 高度变化（异步渲染 Markdown/代码块等）也会撑大滚动总高
    const wrapper = el.querySelector(".vue-recycle-scroller__item-wrapper");
    if (wrapper) ro.observe(wrapper);
  }
  onScrollEvt = () => {
    scrollTop.value = el.scrollTop;
  };
  el.addEventListener("scroll", onScrollEvt, { passive: true });
}

function detach() {
  if (ro) {
    ro.disconnect();
    ro = null;
  }
  if (onScrollEvt && attachedEl) {
    attachedEl.removeEventListener("scroll", onScrollEvt);
  }
  onScrollEvt = null;
  attachedEl = null;
}

watch(
  () => props.scrollEl,
  (el) => attach(el),
);
onMounted(() => attach(props.scrollEl));
onBeforeUnmount(() => detach());

/** 显示门槛：① 滚动内容高度 > 视口 × 3；② 视口本身 0 也视为不可用；
 *  ③ **窄屏门**：滚动容器 clientWidth < 900px 不显示——窄屏再挂一个
 *  100px 浮栏侵占消息列宽，与悬浮滚动条叠位更糟。ResizeObserver 已经监
 *  听容器尺寸变化，窗口缩放/侧栏收展/扩展面板开合都会即时刷新。 */
const MIN_WIDTH_PX = 900;
const visible = computed(
  () =>
    clientHeight.value > 0 &&
    clientWidth.value >= MIN_WIDTH_PX &&
    scrollHeight.value > clientHeight.value * 3,
);

/** 当前活动段：与点击目标公式 `i / (segments-1)` 严格对齐——
 *  scrollTop / (scrollHeight − clientHeight) 是 thumb 顶部位置比，
 *  等分映射到段位 ⇒ 点击 bar i 跳到的位置恰好点亮 bar i（自洽、零错位）。
 *
 *  为何不用视口中心：(scrollTop + clientHeight/2)/scrollHeight 在贴顶/贴底时
 *  会有半段偏移——贴顶高亮本应是 bar 0、贴底应是最后 bar，但中心映射会让
 *  贴顶直接跳到 bar 1、贴底卡在次末 bar——与点击目标不一致。 */
const activeIndex = computed(() => {
  const total = scrollHeight.value - clientHeight.value;
  if (total <= 0 || props.segments <= 1) return 0;
  const ratio = scrollTop.value / total;
  const max = props.segments - 1;
  return Math.min(max, Math.max(0, Math.round(ratio * max)));
});

function jump(index: number) {
  emit("seek", Math.min(props.segments - 1, Math.max(0, index)));
}

/** 横杠宽度序列（参考样式：长短不一的"文本缩略"观感）。
 *  用**确定性**伪随机（FNV-1a 按段位哈希）而非 Math.random：同一段每次渲染同宽，
 *  否则滚动重渲染时横杠宽度会跳动闪烁。区间 45%~100%。 */
function barWidth(index: number): string {
  let hash = 0x811c9dc5 ^ index;
  hash = Math.imul(hash, 0x01000193);
  hash ^= hash >>> 13;
  const pct = 45 + (Math.abs(hash) % 56);
  return `${pct}%`;
}
</script>

<template>
  <div
    v-if="visible"
    class="scroll-scrubber"
    :aria-label="t('chat.scrollScrubber')"
    role="navigation"
    @click.stop
  >
    <button
      v-for="i in props.segments"
      :key="i - 1"
      type="button"
      class="scroll-scrubber-bar"
      :class="{ active: i - 1 === activeIndex }"
      :style="{ width: barWidth(i - 1) }"
      :title="t('chat.scrollToSegment', { n: i })"
      :aria-current="i - 1 === activeIndex ? 'true' : undefined"
      @click="jump(i - 1)"
    />
  </div>
</template>