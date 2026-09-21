<script setup lang="ts">
// MSG-2413 思考过程折叠块：run.reasoning 累积渲染——WorkBuddy 式可折叠「深度思考」。
// 终态默认展开——思考过程是用户与 AI 协作的关键证据，落地后不应被藏起来；用户
// 点击 head 可手动折叠/展开；折叠态由本组件自持（原在 MessageItem 内）。
// 与流式期的区分（ChatContent.vue）：流式期默认展开 + 2 秒无新帧自动折叠，
// 终态即本组件——直接默认展开，不再随时间折叠。
//
// MSG-XXXX 终态 reasoning 局部贴底：reasoning-body 是 max-height 320px 的滚动区，
// 折叠→展开时贴底让用户看到完整思考轨迹（最新追加在末尾）；reasoning 是 prop
// 一次性传入，不存在流式增长，所以只处理「挂载 + 折叠→展开」两种时机。流式期
// 在 ChatContent 的 streaming-tail 内有同源实现并被本组件复用。
import { nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ reasoning: string }>()

const { t } = useI18n()
const showReasoning = ref(true)
const bodyRef = ref<HTMLElement | null>(null)

function pinToBottom() {
  const el = bodyRef.value
  if (!el) return
  // v-show=false→true 后容器的真实高度要等 nextTick 才稳定（style 应用 + 内容排版）
  el.scrollTop = el.scrollHeight
}

onMounted(() => {
  // 默认展开：挂载后立刻贴底，确保打开就能看到思考过程的末尾（最新内容）
  if (showReasoning.value) nextTick(pinToBottom)
})

// v-if 卸载/重建：折叠→展开时元素被重建、ref 重新指向新节点，
// flush: 'post' 确保 watcher 在 DOM patch 之后再读 bodyRef
watch(
  showReasoning,
  (open) => {
    if (!open) return
    nextTick(pinToBottom)
  },
  { flush: 'post' },
)
</script>

<template>
  <div class="reasoning-block">
    <button
      type="button"
      class="reasoning-head"
      :class="{ open: showReasoning }"
      @click="showReasoning = !showReasoning"
    >
      <span class="reasoning-dots">⋯</span>
      <span>{{ t('chat.deepThink') }}</span>
      <span class="reasoning-toggle">{{ showReasoning ? '▾' : '▸' }}</span>
    </button>
    <div v-if="showReasoning" ref="bodyRef" class="reasoning-body">{{ reasoning }}</div>
  </div>
</template>
