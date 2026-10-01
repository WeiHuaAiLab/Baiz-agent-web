<script setup lang="ts">
// W2（1.0.48）：模型服务三档 UI——welink 档接真 command（daemon 单源·key 零回显）。
// free／deepseek 档维持原语义不删不改；welink 档 base/model/key 一律走后端四 command。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../../stores/settings'
import type { ModelPref, ModelProvider } from '../../stores/settings'
import { modelService } from '../../client/modelService'
import type { ModelServiceProbe } from '../../client/modelService'
import { probeOutcome } from '../../utils/modelService'

const { t } = useI18n()
const settings = useSettingsStore()

// —— welink 后端真面（daemon 单源·key 只走掩码/新键输入）——
const base = ref('')
const model = ref('')
const keySet = ref(false)
const keyMasked = ref('')
const newKey = ref('')
const probe = ref<ModelServiceProbe | null>(null)
const usageMessage = ref('')
const loading = ref(false)
const saving = ref(false)
const errorText = ref('')

const outcome = computed(() => probeOutcome(probe.value))
const configured = computed(() => outcome.value.ready)

// 模型下拉：probe ready 态服务端清单实拉（禁写死）；当前值不在清单则并入（保持可见可选）
const modelOptions = computed(() => {
  const list = [...outcome.value.models]
  if (model.value && !list.includes(model.value)) list.unshift(model.value)
  return list
})

const statusText = computed(() => {
  switch (outcome.value.kind) {
    case 'ready':
      return t('settings.modelConfigured')
    case 'unauthorized':
      return t('settings.weLinkStateUnauthorized')
    case 'insufficientQuota':
      return t('settings.weLinkStateInsufficientQuota')
    case 'modelNotFound':
      return t('settings.weLinkStateModelNotFound')
    case 'modelNotAllowed':
      return t('settings.weLinkStateModelNotAllowed')
    case 'rateLimited':
      return outcome.value.retryAfterSecs != null
        ? t('settings.weLinkStateRateLimited', { sec: outcome.value.retryAfterSecs })
        : t('settings.weLinkStateRateLimitedNoWait')
    case 'httpError':
      return outcome.value.httpStatus != null
        ? t('settings.weLinkStateHttpError', { status: outcome.value.httpStatus })
        : t('settings.weLinkStateHttpErrorNoStatus')
    case 'unreachable':
      return t('settings.weLinkStateUnreachable')
    default:
      return ''
  }
})

function setProvider(value: ModelProvider) {
  settings.setProvider(value)
  if (value === 'welink') void load()
}

function setModel(value: ModelPref) {
  settings.setModel(value)
}

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const [face, p, usage] = await Promise.all([
      modelService.get(),
      modelService.probe(),
      modelService.usage(),
    ])
    base.value = face.base ?? ''
    model.value = face.model ?? ''
    keySet.value = !!face.keySet
    keyMasked.value = face.keyMasked ?? ''
    probe.value = p
    usageMessage.value = usage?.message ?? ''
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function persist(args: { base?: string; model?: string; key?: string }) {
  saving.value = true
  errorText.value = ''
  try {
    const face = await modelService.set(args)
    base.value = face.base ?? base.value
    model.value = face.model ?? model.value
    keySet.value = !!face.keySet
    keyMasked.value = face.keyMasked ?? keyMasked.value
    await refreshProbe()
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

function onBaseChange(e: Event) {
  persist({ base: (e.target as HTMLInputElement).value })
}

function onModelChange(e: Event) {
  persist({ model: (e.target as HTMLSelectElement).value })
}

function onKeyChange(e: Event) {
  const key = (e.target as HTMLInputElement).value.trim()
  if (!key) return
  persist({ key })
  newKey.value = ''
}

async function refreshProbe() {
  errorText.value = ''
  try {
    probe.value = await modelService.probe()
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : String(e)
  }
}

onMounted(() => {
  if (settings.provider === 'welink') void load()
})
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.model') }}</h2>
    <p class="section-desc">{{ t('settings.modelHint') }}</p>
    <div class="model-options">
      <label class="model-option" :class="{ active: settings.provider === 'free' }">
        <input type="radio" value="free" :checked="settings.provider === 'free'" @change="setProvider('free')" />
        <span class="model-name">{{ t('settings.modelFree') }}</span>
        <span v-if="settings.provider === 'free'" class="model-check">✓ {{ t('settings.modelConfigured') }}</span>
      </label>

      <label class="model-option" :class="{ active: settings.provider === 'welink' }">
        <input type="radio" value="welink" :checked="settings.provider === 'welink'" @change="setProvider('welink')" />
        <span class="model-name">WeLinkOS</span>
        <span v-if="settings.provider === 'welink' && configured" class="model-check">✓ {{ t('settings.modelConfigured') }}</span>
      </label>
      <div v-if="settings.provider === 'welink'" class="welink-fields">
        <p class="w2-status" :class="{ ok: configured }">
          <span v-if="loading">{{ t('settings.weLinkLoading') }}</span>
          <span v-else>{{ statusText }}</span>
        </p>

        <div class="field">
          <span>{{ t('settings.weLinkBase') }}</span>
          <input :value="base" type="text" :disabled="saving" @change="onBaseChange" />
        </div>

        <div class="field">
          <span>{{ t('settings.weLinkKey') }}</span>
          <span v-if="keySet" class="key-masked">{{ keyMasked }}</span>
          <span v-else class="key-empty">{{ t('settings.weLinkKeyEmpty') }}</span>
          <input
            v-model="newKey"
            type="password"
            autocomplete="off"
            :placeholder="t('settings.weLinkKeyNew')"
            :disabled="saving"
            @change="onKeyChange"
          />
        </div>

        <div class="field">
          <span>{{ t('settings.weLinkModel') }}</span>
          <select :value="model" :disabled="saving || loading" @change="onModelChange">
            <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
          </select>
          <span v-if="modelOptions.length === 0" class="field-hint">{{ t('settings.weLinkModelEmpty') }}</span>
        </div>

        <div class="w2-actions">
          <button type="button" class="btn-ghost" :disabled="loading || saving" @click="refreshProbe">
            {{ t('settings.weLinkProbe') }}
          </button>
        </div>

        <p class="field-hint">{{ t('settings.weLinkUsage') }}：{{ usageMessage || t('settings.weLinkUsageLoading') }}</p>
        <p v-if="errorText" class="field-error">{{ errorText }}</p>
      </div>

      <label class="model-option" :class="{ active: settings.provider === 'deepseek' }">
        <input type="radio" value="deepseek" :checked="settings.provider === 'deepseek'" @change="setProvider('deepseek')" />
        <span class="model-name">DeepSeek</span>
      </label>
      <div v-if="settings.provider === 'deepseek'" class="model-options">
        <button
          type="button"
          class="model-option"
          :class="{ active: settings.model === 'deepseek-v4-pro' }"
          @click="setModel('deepseek-v4-pro')"
        >
          <span class="model-name">DeepSeek V4 Pro</span>
        </button>
        <button
          type="button"
          class="model-option"
          :class="{ active: settings.model === 'deepseek-v4-flash' }"
          @click="setModel('deepseek-v4-flash')"
        >
          <span class="model-name">DeepSeek V4 Flash</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.welink-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field > span:first-child {
  font-size: 12px;
  color: var(--muted);
}
.field input,
.field select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
  background: var(--panel);
  color: var(--text);
}
.w2-status {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.w2-status.ok {
  color: var(--success);
}
.key-masked {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  color: var(--text);
}
.key-empty {
  font-size: 12px;
  color: var(--muted);
}
.w2-actions {
  display: flex;
  gap: 8px;
}
.field-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.field-error {
  margin: 0;
  font-size: 12px;
  color: var(--risk-high-text);
}
</style>
