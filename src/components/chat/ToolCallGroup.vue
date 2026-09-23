<script setup lang="ts">
// 连续工具调用折叠组：≥3 条「连续 tool_call」在思考完毕后自动收起为一行摘要，
// 点击可展开逐条查看（组内仍是原样的 MessageItem → ToolRow，样式零改动）。
//
// 展开态由父层（ChatContent）持有并下传，不在本组件内自持：
// DynamicScroller 会回收 item 组件，状态存组件内部会在滚出视口后被重置。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MessageItem from './MessageItem.vue'
import type { ChatMessage } from '../../models'

const props = defineProps<{
  messages: ChatMessage[]
  expanded: boolean
}>()
defineEmits<{ (e: 'toggle'): void }>()

const { t } = useI18n()

const failedCount = computed(
  () => props.messages.filter((message) => message.meta?.success === false).length,
)
// 摘要里的工具名去重保序；过长交给 CSS 省略号
const toolNames = computed(() => {
  const names = props.messages
    .map((message) => message.meta?.toolName)
    .filter((name): name is string => !!name)
  return [...new Set(names)].join(' · ')
})
</script>

<template>
  <div class="tool-group" :class="{ expanded }">
    <button
      type="button"
      class="tool-group-head"
      :title="expanded ? t('chat.toolGroupCollapse') : t('chat.toolGroupExpand')"
      @click="$emit('toggle')"
    >
      <span class="tool-group-caret">{{ expanded ? '▾' : '▸' }}</span>
      <span class="tool-group-count">
        {{ t('chat.toolGroupSummary', { count: messages.length }) }}
      </span>
      <span v-if="toolNames" class="tool-group-names">{{ toolNames }}</span>
      <span v-if="failedCount" class="tool-group-failed">
        {{ t('chat.toolGroupFailed', { count: failedCount }) }}
      </span>
    </button>

    <!-- v-show 而非 v-if：展开/收起不重建组内 ToolRow 的 FileCard / diff 统计，
         也避免每次切换都重新解析 argsPreview -->
    <div v-show="expanded" class="tool-group-body">
      <MessageItem v-for="message in messages" :key="message.id" :message="message" />
    </div>
  </div>
</template>
