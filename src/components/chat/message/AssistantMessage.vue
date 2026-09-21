<script setup lang="ts">
// 助手消息：耗时 + 复制 / 重新生成 / 删除，正文 Markdown，
// 并内嵌 run 派生的过程区（RunBlocks：思考／执行命令／执行结果 三分离）。
// MSG-3335 G-4：结构取 main（message/ 分发），规格面取我方——
//   ★ 过程区用我方 RunBlocks（默认折叠的实时流＋跑马灯吐字），
//     不取上游 RunReasoning（终态默认展开）／RunTrace 两件。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessageStore } from '../../../stores/message'
import { getBridge } from '../../../bridge'
import { formatDuration } from '../../../utils/time'
import MarkdownView from '../../markdown/MarkdownView.vue'
import Icon from '../../common/Icon.vue'
import RunBlocks from './RunBlocks.vue'
import type { ChatMessage, RunState } from '../../../models'

const props = defineProps<{ message: ChatMessage; run?: RunState }>()
const { t } = useI18n()
const messages = useMessageStore()

const copied = ref(false)

const hasRun = computed(() => !!props.run)
const elapsedMs = computed(() => props.run?.elapsedMs ?? props.message.meta?.elapsedMs)
const elapsedText = computed(() =>
  elapsedMs.value ? formatDuration(elapsedMs.value) : '',
)
const running = computed(() => props.run?.status === 'running')
/** MSG-3001 ②／MSG-3216：有过程可看（思考／命令／结果／内部决策）才出过程区，空 run 不出空壳。 */
const showRunBlocks = computed(() => {
  const current = props.run
  if (!current) return false
  if (current.reasoning === '' && current.trace.length === 0 && !current.decision) return false
  return true
})

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

  <!-- MSG-2998 修②（DEBT-544 目二）：三分离归组——思考／执行命令／执行结果各自成区。
       思考区＝MSG-3229/3248 口径：**默认折叠的实时流**（跑马灯吐字），点击标题展开全文；
       上游 RunReasoning 的"终态默认展开"口径**不取**。 -->
  <RunBlocks v-if="showRunBlocks" :run="run!" />

  <MarkdownView v-if="message.text || running" :text="message.text" />
  <!-- MSG-2661 目③：content 空而 reasoning 有——思考区即输出面——
       不再显「（无输出）」（真无输出：无正文无思考无 running——照显） -->
  <p v-else-if="!run?.reasoning && !run?.decision" class="no-output">
    {{ t('chat.noOutput') }}
  </p>
</template>
