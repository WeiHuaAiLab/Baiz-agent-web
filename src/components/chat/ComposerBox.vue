<script setup lang="ts">
// 聊天输入框（创建流程版）：与 ChatInput 同款两段式结构——输入区（textarea 固定 98px、
// 超出 300px 滚动）+ 操作功能区（+ / 语音 / 发送）。centered 模式用于创建流程的居中布局。
// 附件行保留展示与移除；「+」按钮暂时不做功能（占位，后续接入上传等能力）。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFilesStore } from '../../stores/files'
import Icon from '../common/Icon.vue'

const props = defineProps<{
  placeholder: string
  running?: boolean
  centered?: boolean
}>()
const emit = defineEmits<{ submit: []; stop: [] }>()
const text = defineModel<string>({ required: true })

const { t } = useI18n()
const files = useFilesStore()
const voiceHint = ref(false)

function toggleVoice() {
  voiceHint.value = true
  setTimeout(() => {
    voiceHint.value = false
  }, 1800)
}

function submit() {
  emit('submit')
}
</script>

<template>
  <form
    class="composer composer-block"
    :class="{ centered: props.centered }"
    @submit.prevent="submit"
  >
    <div v-if="files.attachments.length" class="attachment-row">
      <span v-for="att in files.attachments" :key="att.id" class="attachment-chip">
        <span class="att-name">{{ att.name }}</span>
        <button type="button" @click="files.removeAttachment(att.id)">
          <Icon name="x" :size="12" />
        </button>
      </span>
    </div>

    <!-- 输入区：固定 98px，超出 300px 滚动（与 ChatInput 一致） -->
    <div class="composer-input">
      <textarea
        v-model="text"
        class="input-area"
        :placeholder="props.placeholder"
        @keydown.enter.exact.prevent="submit"
      />
    </div>

    <!-- 操作功能区：+（暂时不做功能，仅占位）/ 语音 / 发送 -->
    <div class="composer-actions">
      <button type="button" class="act-btn" :title="t('files.upload')">
        <Icon name="plus" :size="16" />
      </button>

      <span class="actions-spacer" />

      <button type="button" class="act-btn" :title="t('chat.voiceInput')" @click="toggleVoice">
        <Icon name="mic" :size="16" />
      </button>

      <button
        v-if="props.running"
        type="button"
        class="send-btn stop"
        :title="t('chat.stop')"
        @click="emit('stop')"
      >
        <Icon name="stop" :size="15" />
      </button>
      <button v-else type="submit" class="send-btn" :disabled="!text.trim()" :title="t('chat.send')">
        <Icon name="send" :size="16" />
      </button>
    </div>

    <span v-if="voiceHint" class="voice-hint">{{ t('chat.voiceComing') }}</span>
  </form>
</template>
