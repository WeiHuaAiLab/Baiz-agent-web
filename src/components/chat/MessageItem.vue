<script setup lang="ts">
// 单条聊天消息「壳」：只做两件事——按 message.kind 分发到对应渲染组件、
// 拼装 run 派生块（人话字幕，仅 assistant 条渲染一次）与时间。
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
import { isModelAuthFailure } from '../../utils/authFailure'
import { useMessageStore } from '../../stores/message'
import { formatTime } from '../../utils/time'
import AssistantMessage from './message/AssistantMessage.vue'
import UserMessage from './message/UserMessage.vue'
import StatusMessage from './message/StatusMessage.vue'
import AuthErrorCard from './message/AuthErrorCard.vue'
import ToolRow from './message/ToolRow.vue'
import ApprovalCard from './message/ApprovalCard.vue'
import RunBlocks from './message/RunBlocks.vue'
import RunSubtitles from './message/RunSubtitles.vue'
import type { ChatMessage, ToolGroup } from '../../models'

const props = defineProps<{
  message: ChatMessage
  /** 附着的工具调用折叠组（ChatContent displayState.attached）：本条为其 run 落地的
   *  assistant 消息时非空，由 AssistantMessage 在过程区之后渲染（透传，逻辑零沾） */
  toolGroup?: ToolGroup
  toolGroupExpanded?: boolean
}>()
defineEmits<{ (e: 'toggle-tool-group'): void }>()
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
  if (props.message.kind !== 'status' || props.message.meta?.status !== 'error') return false
  // MSG-3266 双渲修：本 run 已落地 assistant 消息 ⇒ 过程区由 AssistantMessage
  // 独占渲染。收口瞬间（onDone 先 push status.protocolLeak 再落 assistant）同一
  // run 的 RunBlocks 会在两条消息各渲一份（实测正文区上方出现双份「深度思考／
  // 执行命令／执行结果」）。assistant 缺失（纯失败径）时才由 status 条兜底。
  const taskId = props.message.meta?.taskId
  return !messages
    .list(props.message.conversationId)
    .some((m) => m.kind === 'assistant' && m.meta?.taskId === taskId)
})

/** MSG-3558：模型鉴权失败（`engine_error` 一类 ＋ 401/403/Unauthorized/invalid）⇒ 人话错误卡。
 *  判定放在**渲染层**（既有的 daemon `error` 帧原文即带该文案，无需改 store／动行数基线）。 */
const isAuthFailure = computed(
  () => props.message.kind === 'status' && isModelAuthFailure(props.message.text),
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
      :tool-group="toolGroup"
      :tool-group-expanded="toolGroupExpanded"
      @toggle-tool-group="$emit('toggle-tool-group')"
    />
    <!-- 用户提出的内容 -->
    <UserMessage v-else-if="message.kind === 'user'" :message="message" />
    <!-- AI返回出来的内容 -->
    <template v-else>
      <!-- MSG-3001 ②：失败径 status 消息的过程区（assistant 径见 AssistantMessage） -->
      <RunBlocks v-if="showStatusRunBlocks" :run="run!" />

      <!-- 模型鉴权失败 ⇒ **就地人话错误卡**（标题／掩码原因／模型名／设置入口／重试） -->
      <AuthErrorCard v-if="isAuthFailure" :message="message" />
      <!-- 状态消息 -->
      <StatusMessage v-else-if="message.kind === 'status'" :message="message" />
      <!-- 工具调用情况 -->
      <ToolRow v-else-if="message.kind === 'tool_call'" :message="message" />
      <!-- 审批卡的情况 -->
      <ApprovalCard v-else-if="message.kind === 'approval'" :message="message" />
    </template>

    <!-- 批0 人话字幕：工具调用全翻译成小白能看懂的一句话（默认隐藏，设置中开启）。  -->
    <RunSubtitles v-if="message.kind === 'assistant'" :run="run" />

    <!-- 消息的时间（用户提问的时间、AI回复的时间） -->
    <div
      v-if="message.kind === 'user' || message.kind === 'assistant'"
      class="msg-time"
    >
      {{ formatTime(message.createdAt) }}
    </div>
  </div>
</template>
