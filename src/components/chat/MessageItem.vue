<script setup lang="ts">
// 单条聊天消息：用户/助手消息内容（Markdown）、工具调用行、审批卡，耗时显示与复制/重新生成/重试操作。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessageStore } from '../../stores/message'
import { useSettingsStore } from '../../stores/settings'
import { getBridge } from '../../bridge'
import { formatDuration, formatTime } from '../../utils/time'
import { formatFileSize, shortMime } from '../../utils/format'
import MarkdownView from '../markdown/MarkdownView.vue'
import ToolRow from './ToolRow.vue'
import ApprovalCard from './ApprovalCard.vue'
import RunBlocks from './RunBlocks.vue'
import Icon from '../common/Icon.vue'
import type { ChatMessage } from '../../models'

const props = defineProps<{ message: ChatMessage }>()
const { t } = useI18n()
const router = useRouter()
const messages = useMessageStore()
const settings = useSettingsStore()

const copied = ref(false)

const run = computed(() =>
  props.message.meta?.taskId ? messages.runs[props.message.meta.taskId] : undefined,
)
const hasRun = computed(() => !!run.value)
const elapsedMs = computed(() => run.value?.elapsedMs ?? props.message.meta?.elapsedMs)
const elapsedText = computed(() =>
  elapsedMs.value ? formatDuration(elapsedMs.value) : '',
)
const running = computed(() => run.value?.status === 'running')
/** MSG-3001 ②：三区显示门——assistant 消息或**失败径 status 消息**（run 同显）；
 *  窄化门（assistant-only）会丢失败 run 的思考/trace（旧件 kind-agnostic 可渲）；
 *  空 run（无思考无 trace）不渲（勿出空区）。 */
const showRunBlocks = computed(() => {
  const current = run.value
  if (!current) return false
  // MSG-3216：内部决策载荷（decision）也算"有过程可看"——只进折叠区不算无输出
  if (current.reasoning === '' && current.trace.length === 0 && !current.decision) return false
  if (props.message.kind === 'assistant') return true
  return props.message.kind === 'status' && props.message.meta?.status === 'error'
})
// 批0 人话字幕：本次运行里所有工具调用的白话翻译（按时间顺序）
const subtitles = computed(() => run.value?.subtitles ?? [])

async function copy() {
  try {
    await getBridge().clipboard.writeText(props.message.text)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1200)
  } catch {
    /* clipboard unavailable */
  }
}

function regenerate() {
  void messages.regenerate(props.message.conversationId, props.message.id)
}

function retry() {
  void messages.retryFrom(props.message.conversationId, props.message.id)
}

function remove() {
  void messages.removeMessage(props.message.conversationId, props.message.id)
}

function goSettings() {
  void router.push('/settings')
}

/** DEBT-742：会话失效 ⇒ 明确入口回到登录页（自愈已在 store 侧清 token） */
function goLogin() {
  void router.push('/login')
}

/** 标准 v1.0 §A3：队列单条取消（chat.queue_cancel） */
function cancelQueued() {
  void messages.cancelQueued(props.message.conversationId, props.message.id)
}
</script>

<template>
  <div
    :class="['msg', message.kind]"
    :data-streaming="message.meta?.streaming ? '1' : undefined"
  >
    <div v-if="message.kind === 'assistant'" class="msg-head">
      <span v-if="elapsedMs !== undefined && !hasRun" class="elapsed static">
        ⏱ {{ t('chat.elapsed') }} {{ elapsedText }}
      </span>
      <span v-else-if="hasRun" class="elapsed static">
        <template v-if="running">{{ t('chat.running') }}</template>
        <template v-else>⏱ {{ t('chat.elapsed') }} {{ elapsedText }}</template>
      </span>
      <div class="msg-actions">
        <button type="button" class="icon-btn" :title="t('common.copy')" @click="copy">
          <Icon :name="copied ? 'check' : 'copy'" :size="15" />
        </button>
        <button type="button" class="icon-btn" :title="t('common.regenerate')" @click="regenerate">
          <Icon name="refresh" :size="15" />
        </button>
        <button type="button" class="icon-btn" :title="t('common.delete')" @click="remove">
          <Icon name="trash" :size="14" />
        </button>
      </div>
    </div>

    <div v-if="message.kind === 'user'" class="msg-head user-head">
      <span />
      <div class="msg-actions">
        <button type="button" class="icon-btn" :title="t('common.delete')" @click="remove">
          <Icon name="trash" :size="14" />
        </button>
      </div>
    </div>

    <!-- MSG-2998 修②（DEBT-544 目二）：三分离归组——思考（reasoning／
         折叠，MSG-2413 交互保留）＋执行命令（tool.call）＋执行结果
         （tool.result）各自成区、互不混入；与流式态同构（RunBlocks 两态）。
         归属钉：三区系 assistant 呈现面——tool_call/approval 条目继续走
         各自组件（ToolRow/ApprovalCard），勿重复渲染致混排。 -->
    <RunBlocks v-if="showRunBlocks" :run="run" />

    <MarkdownView
      v-if="message.kind === 'assistant' && (message.text || running)"
      :text="message.text"
    />
    <!-- MSG-2661 目③：content 空而 reasoning 有——思考区即输出面——
         不再显「（无输出）」（真无输出：无正文无思考无 running——照显） -->
    <p
      v-else-if="message.kind === 'assistant' && !run?.reasoning && !run?.decision"
      class="no-output"
    >
      {{ t('chat.noOutput') }}
    </p>
    <div v-else-if="message.kind === 'user'" class="user-block">
      <div
        v-if="message.meta?.attachments?.length"
        class="user-attachments"
      >
        <div
          v-for="att in message.meta.attachments"
          :key="att.id"
          class="attachment-chip"
          :class="{ 'is-image': att.kind === 'image', 'is-file': att.kind === 'file' }"
        >
          <img
            v-if="att.kind === 'image' && att.dataUrl"
            class="att-thumb"
            :src="att.dataUrl"
            :alt="att.name"
            :title="att.name"
          />
          <div v-else class="att-meta">
            <div class="att-name" :title="att.name">{{ att.name }}</div>
            <div class="att-tag">{{ shortMime(att.mimeType) }} · {{ formatFileSize(att.size) }}</div>
          </div>
        </div>
      </div>
      <pre v-if="message.text" class="user-text">{{ message.text }}</pre>
    </div>
    <ToolRow v-else-if="message.kind === 'tool_call'" :message="message" />
    <ApprovalCard v-else-if="message.kind === 'approval'" :message="message" />
    <!-- 标准 v1.0 §A3／§C：队列条——「排队中·第 N 位」＋单条取消 -->
    <div
      v-else-if="message.kind === 'status' && (message.meta?.queued || message.meta?.queueCancelled)"
      class="status-text queued"
    >
      <template v-if="message.meta?.queueCancelled">
        {{ t('chat.queueCancelled') }}
      </template>
      <template v-else>
        <span class="queue-text">
          {{ t('chat.queuePosition', { n: message.meta?.queuePosition ?? 1 }) }}
        </span>
        <button type="button" class="queue-cancel" @click="cancelQueued">
          {{ t('chat.queueCancel') }}
        </button>
      </template>
    </div>
    <div v-else-if="message.kind === 'status'" class="status-text" :class="message.meta?.status">
      <template v-if="message.meta?.statusKey">
        {{ t('status.' + message.meta.statusKey) }}
        <template v-if="message.meta?.errorKey">：{{ t('errors.' + message.meta.errorKey) }}</template>
        <span v-if="message.text">（{{ message.text }}）</span>
      </template>
      <template v-else>{{ message.text }}</template>
      <button
        v-if="
          message.meta?.statusKey === 'sendFailed' || message.meta?.statusKey === 'taskError'
        "
        type="button"
        class="retry-btn"
        @click="retry"
      >
        {{ t('common.retry') }}
      </button>
      <button
        v-if="message.meta?.errorKey === 'unauthorized'"
        type="button"
        class="retry-btn"
        @click="goSettings"
      >
        {{ t('errors.goSettings') }}
      </button>
      <button
        v-if="message.meta?.errorKey === 'sessionExpired'"
        type="button"
        class="retry-btn"
        @click="goLogin"
      >
        {{ t('errors.relogin') }}
      </button>
    </div>

    <!-- 批0 人话字幕：工具调用全翻译成小白能看懂的一句话（默认隐藏，设置中开启）
         —— 团队线开关原样保留；上方「过程回看」旧面板按本地线撤除
         （MSG-2998 修② 三分离归组 RunBlocks 已取代之——见本文件 117-122 行）。 -->
    <div v-if="settings.showHuman && subtitles.length" class="xp-subtitles">
      <div
        v-for="(sub, i) in subtitles"
        :key="i"
        class="xp-subtitle"
      >
        <span class="xp-subtitle-tag">人话</span>
        <span class="xp-subtitle-text">{{ sub.text }}</span>
      </div>
    </div>

    <div
      v-if="message.kind === 'user' || message.kind === 'assistant'"
      class="msg-time"
    >
      {{ formatTime(message.createdAt) }}
    </div>
  </div>
</template>
