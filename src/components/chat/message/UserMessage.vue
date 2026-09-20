<script setup lang="ts">
// 用户消息：头部删除操作 + 附件缩略图 / 文件概要 + 纯文本正文。
import { useI18n } from 'vue-i18n'
import { useMessageStore } from '../../../stores/message'
import { formatFileSize, shortMime } from '../../../utils/format'
import Icon from '../../common/Icon.vue'
import type { ChatMessage } from '../../../models'

const props = defineProps<{ message: ChatMessage }>()
const { t } = useI18n()
const messages = useMessageStore()

function remove() {
  void messages.removeMessage(props.message.conversationId, props.message.id)
}
</script>

<template>
  <div class="msg-head user-head">
    <span />
    <div class="msg-actions">
      <button type="button" class="icon-btn" :title="t('common.delete')" @click="remove">
        <Icon name="trash" :size="14" />
      </button>
    </div>
  </div>

  <div class="user-block">
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
</template>
