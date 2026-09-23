<script setup lang="ts">
// 单条聊天消息「壳」：只做两件事——按 message.kind 分发到对应渲染组件、
// 拼装与 kind 无关的 run 派生块（人话字幕）与时间。
// 各 kind 的渲染体在 ./message/ 下；本文件保持原路径不变（ChatContent / 测试零联动）。
//
// MSG-3335 G-4（与 origin/main 合流）：**结构取 main**（壳＋kind 分发），
// **规格面取我方**——分发后的各件承载我方口径：
//   ①AssistantMessage → 我方 RunBlocks（三分离／默认折叠实时流＋跑马灯）；
//   ②UserMessage → MSG-3270 ② 附件首行预览；
//   ③StatusMessage → §A3 队列条／MSG-3266 ② protocolLeak 重试／DEBT-742 重登；
//   ④ToolRow／FileCard → MSG-3233 ③ 预览型走我方 FileCard（不带上游「运行」按钮）；
//   ⑤ApprovalCard → 我方 1.0.17 九态规格卡（694 行，非上游 116 行旧卡）。
import { computed } from 'vue'
import { useMessageStore } from '../../stores/message'
import { formatTime } from '../../utils/time'
import AssistantMessage from './message/AssistantMessage.vue'
import UserMessage from './message/UserMessage.vue'
import StatusMessage from './message/StatusMessage.vue'
import ToolRow from './message/ToolRow.vue'
import ApprovalCard from './message/ApprovalCard.vue'
import RunBlocks from './message/RunBlocks.vue'
import RunSubtitles from './message/RunSubtitles.vue'
import type { ChatMessage } from '../../models'

const props = defineProps<{ message: ChatMessage }>()
const messages = useMessageStore()

const run = computed(() =>
  props.message.meta?.taskId ? messages.runs[props.message.meta.taskId] : undefined,
)
/** MSG-3001 ②／MSG-3216：**失败径 status 消息**的过程区（run 同显）；
 *  assistant 径的过程区由 AssistantMessage 自持（同一判定），此处只补 status 径。
 *  窄化门（assistant-only）会丢失败 run 的思考/trace（旧件 kind-agnostic 可渲）；
 *  空 run（无思考无 trace 无决策）不渲（勿出空区）。 */
const showStatusRunBlocks = computed(() => {
  const current = run.value
  if (!current) return false
  if (current.reasoning === '' && current.trace.length === 0 && !current.decision) return false
  return props.message.kind === 'status' && props.message.meta?.status === 'error'
})
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
      <!-- MSG-3001 ②：失败径 status 消息的过程区（assistant 径见 AssistantMessage） -->
      <RunBlocks v-if="showStatusRunBlocks" :run="run!" />
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