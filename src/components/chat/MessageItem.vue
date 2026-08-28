<script setup lang="ts">
// 单条聊天消息：用户/助手消息内容（Markdown）、工具调用行、审批卡，耗时显示与复制/重新生成/重试操作。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessageStore } from '../../stores/message'
import { getBridge } from '../../bridge'
import { formatDuration, formatTime } from '../../utils/time'
import { formatFileSize, shortMime } from '../../utils/format'
import MarkdownView from '../markdown/MarkdownView.vue'
import ToolRow from './ToolRow.vue'
import ApprovalCard from './ApprovalCard.vue'
import Icon from '../common/Icon.vue'
import type { ChatMessage } from '../../models'

const props = defineProps<{ message: ChatMessage }>()
const { t } = useI18n()
const router = useRouter()
const messages = useMessageStore()

const showTrace = ref(false)
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
      <button
        v-else-if="hasRun"
        type="button"
        class="elapsed"
        :class="{ open: showTrace }"
        @click="showTrace = !showTrace"
      >
        <template v-if="running">{{ t('chat.running') }}</template>
        <template v-else>⏱ {{ t('chat.elapsed') }} {{ elapsedText }} ›</template>
      </button>
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

    <MarkdownView
      v-if="message.kind === 'assistant' && (message.text || running)"
      :text="message.text"
    />
    <p v-else-if="message.kind === 'assistant'" class="no-output">
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
    </div>

    <div v-if="showTrace && run" class="trace-panel">
      <div v-if="run.reasoning" class="trace-reasoning">
        <span>{{ t('chat.thinking') }}</span>
        {{ run.reasoning }}
      </div>
      <div v-for="(item, i) in run.trace" :key="i" class="trace-item" :class="item.kind">
        <template v-if="item.kind === 'tool.call'">
          {{ t('chat.toolCall') }} {{ item.toolName }}
          <span v-if="item.argsPreview" class="trace-args">{{ item.argsPreview }}</span>
        </template>
        <template v-else-if="item.kind === 'tool.result'">
          {{ t('chat.toolResult') }} {{ item.preview }}
        </template>
        <template v-else>{{ t('chat.thinking') }}</template>
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
