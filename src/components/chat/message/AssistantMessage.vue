<script setup lang="ts">
// 助手消息：耗时 / 轨迹入口 + 复制 / 重新生成 / 删除，正文 Markdown，
// 并内嵌 run 派生的思考折叠块（RunReasoning）与轨迹面板（RunTrace）。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessageStore } from '../../../stores/message'
import { getBridge } from '../../../bridge'
import { formatDuration } from '../../../utils/time'
import MarkdownView from '../../markdown/MarkdownView.vue'
import Icon from '../../common/Icon.vue'
import RunReasoning from './RunReasoning.vue'
import RunTrace from './RunTrace.vue'
import type { ChatMessage, RunState } from '../../../models'

const props = defineProps<{ message: ChatMessage; run?: RunState }>()
const { t } = useI18n()
const messages = useMessageStore()

const showTrace = ref(false)
const copied = ref(false)

const hasRun = computed(() => !!props.run)
const elapsedMs = computed(() => props.run?.elapsedMs ?? props.message.meta?.elapsedMs)
const elapsedText = computed(() =>
  elapsedMs.value ? formatDuration(elapsedMs.value) : '',
)
const running = computed(() => props.run?.status === 'running')

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

function remove() {
  void messages.removeMessage(props.message.conversationId, props.message.id)
}
</script>

<template>
  <div class="msg-head">
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

  <RunReasoning v-if="run?.reasoning" :reasoning="run.reasoning" />

  <MarkdownView v-if="message.text || running" :text="message.text" />
  <!-- MSG-2661 目③：content 空而 reasoning 有——思考区即输出面——
       不再显「（无输出）」（真无输出：无正文无思考无 running——照显） -->
  <p v-else-if="!run?.reasoning" class="no-output">
    {{ t('chat.noOutput') }}
  </p>

  <RunTrace v-if="showTrace && run" :run="run" />
</template>
