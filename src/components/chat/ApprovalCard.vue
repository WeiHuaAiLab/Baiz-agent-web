<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApprovalStore } from '../../stores/approval'
import type { ChatMessage } from '../../models'

const props = defineProps<{ message: ChatMessage }>()
const { t } = useI18n()
const approval = useApprovalStore()
const working = ref(false)

const risk = computed(() => props.message.meta?.risk ?? 'medium')
const resolved = computed(() => props.message.meta?.approved !== undefined)

async function decide(approved: boolean) {
  if (!props.message.meta?.requestId || working.value) return
  working.value = true
  await approval.respond(props.message.meta.requestId, approved)
  working.value = false
}
</script>

<template>
  <div class="approval-card">
    <div class="approval-head">
      <span class="approval-title">{{ t('approval.title') }}</span>
      <span class="risk" :class="risk">
        {{ risk === 'high' ? t('approval.highRisk') : risk === 'low' ? t('approval.lowRisk') : t('approval.mediumRisk') }}
      </span>
    </div>
    <div class="approval-body">
      <div class="approval-action">{{ message.meta?.toolName }}</div>
      <pre v-if="message.meta?.argsPreview" class="approval-args">{{
        message.meta.argsPreview
      }}</pre>
    </div>
    <div v-if="resolved" class="approval-result" :class="{ denied: !message.meta?.approved }">
      {{ message.meta?.approved ? t('approval.approved') : t('approval.denied') }}
    </div>
    <div v-else class="approval-actions">
      <button type="button" class="approve" :disabled="working" @click="decide(true)">
        {{ t('approval.approve') }}
      </button>
      <button type="button" class="deny" :disabled="working" @click="decide(false)">
        {{ t('approval.deny') }}
      </button>
    </div>
  </div>
</template>
