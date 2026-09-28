<script setup lang="ts">
// MSG-2413 思考过程块（终态）：run.reasoning 累积渲染。
// 按需求调整：头部行（reasoning-head）已移除，内容区**默认展开常驻**（非折叠），
// 超 220px 局部滚动；reasoning 是 prop 一次性传入（不存在流式增长），
// 挂载时贴底一次让用户先看到思考轨迹末尾（最新内容）。流式期贴底在
// ChatContent 的 streaming-tail 内（RunBlocks）有同源实现。
import { nextTick, onMounted, ref } from 'vue'

defineProps<{ reasoning: string }>()

const bodyRef = ref<HTMLElement | null>(null)

onMounted(() => {
  // 挂载后贴底：默认展开的滚动区先展示末尾（最新思考内容）
  void nextTick(() => {
    const el = bodyRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
})
</script>

<template>
  <div class="reasoning-block">
    <div ref="bodyRef" class="reasoning-body">{{ reasoning }}</div>
  </div>
</template>
