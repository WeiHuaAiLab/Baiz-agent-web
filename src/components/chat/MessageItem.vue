<script setup lang="ts">
// 单条聊天消息「壳」：只做两件事——按 message.kind 分发到对应渲染组件、
// 拼装与 kind 无关的 run 派生块（人话字幕）与时间。
// 各 kind 的渲染体在 ./message/ 下；本文件保持原路径不变（ChatContent / 测试零联动）。
import { computed } from 'vue'
import { useMessageStore } from '../../stores/message'
import { formatTime } from '../../utils/time'
import AssistantMessage from './message/AssistantMessage.vue'
import UserMessage from './message/UserMessage.vue'
import StatusMessage from './message/StatusMessage.vue'
import ToolRow from './message/ToolRow.vue'
import ApprovalCard from './message/ApprovalCard.vue'
import RunReasoning from './message/RunReasoning.vue'
import RunSubtitles from './message/RunSubtitles.vue'
import type { ChatMessage } from '../../models'

const props = defineProps<{ message: ChatMessage }>()
const messages = useMessageStore()

const run = computed(() =>
  props.message.meta?.taskId ? messages.runs[props.message.meta.taskId] : undefined,
)
</script>

<template>
  <div
    :class="['msg', message.kind]"
    :data-streaming="message.meta?.streaming ? '1' : undefined"
  >
    <AssistantMessage
      v-if="message.kind === 'assistant'"
      :message="message"
      :run="run"
    />
    <UserMessage v-else-if="message.kind === 'user'" :message="message" />
    <template v-else>
      <!-- MSG-2413 思考过程折叠块：有 reasoning 即现形（流式累积照渲），默认收起 -->
      <RunReasoning v-if="run?.reasoning" :reasoning="run.reasoning" />
      <StatusMessage v-if="message.kind === 'status'" :message="message" />
      <ToolRow v-else-if="message.kind === 'tool_call'" :message="message" />
      <ApprovalCard v-else-if="message.kind === 'approval'" :message="message" />
    </template>

    <!-- 批0 人话字幕：工具调用全翻译成小白能看懂的一句话（默认隐藏，设置中开启） -->
    <RunSubtitles :run="run" />

    <div
      v-if="message.kind === 'user' || message.kind === 'assistant'"
      class="msg-time"
    >
      {{ formatTime(message.createdAt) }}
    </div>
  </div>
</template>
