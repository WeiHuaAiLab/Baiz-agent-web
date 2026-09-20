<script setup lang="ts">
// MSG-2413 思考过程折叠块：run.reasoning 累积渲染——WorkBuddy 式可折叠「深度思考」。
// 终态默认展开——思考过程是用户与 AI 协作的关键证据，落地后不应被藏起来；用户
// 点击 head 可手动折叠/展开；折叠态由本组件自持（原在 MessageItem 内）。
// 与流式期的区分（ChatContent.vue）：流式期默认展开 + 2 秒无新帧自动折叠，
// 终态即本组件——直接默认展开，不再随时间折叠。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ reasoning: string }>()

const { t } = useI18n()
const showReasoning = ref(true)
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
    <div v-if="showReasoning" class="reasoning-body">{{ reasoning }}</div>
  </div>
</template>
