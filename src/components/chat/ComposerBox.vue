<script setup lang="ts">
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
  <form class="composer" :class="{ centered: props.centered }" @submit.prevent="submit">
    <div v-if="files.attachments.length" class="attachment-row">
      <span v-for="att in files.attachments" :key="att.id" class="attachment-chip">
        <span class="att-name">{{ att.name }}</span>
        <button type="button" @click="files.removeAttachment(att.id)">
          <Icon name="x" :size="12" />
        </button>
      </span>
    </div>
    <div class="composer-box">
      <button
        type="button"
        class="attach"
        :title="t('files.upload')"
        @click="files.attachFromPicker()"
      >
        <Icon name="plus" :size="16" />
      </button>
      <textarea
        v-model="text"
        :placeholder="props.placeholder"
        rows="1"
        @keydown.enter.exact.prevent="submit"
      />
      <button type="button" class="voice-btn" @click="toggleVoice">
        <Icon name="mic" :size="16" />
        <span class="tooltip">{{ t('chat.voiceInput') }}</span>
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
