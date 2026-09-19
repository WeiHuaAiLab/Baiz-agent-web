<script setup lang="ts">
// DEBT-743（MSG-3168）「连接知识库」设置卡：base URL ＋ API key ⇒ `weknora.set_config`。
// 契约先行：daemon 侧端点未实装时显式「服务端未就绪」，**绝不静默成功**。
// 钉：**API key 保存后永不回显**（输入框即清，界面只留「已配置」＋指纹）。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useKbStore } from '../../stores/kb'

const { t } = useI18n()
const kb = useKbStore()
const baseUrl = ref('')
const apiKey = ref('')

/** 九态落点：idle(默认)／loading／unconfigured(空)／ready／saving／saved／error／notReady／invalid */
const state = computed(() => kb.status)

function reload() {
  void kb.load().then(() => {
    if (kb.baseUrl) baseUrl.value = kb.baseUrl
  })
}

async function submit() {
  if (kb.saving || kb.notReady) return
  await kb.save(baseUrl.value, apiKey.value)
  // 保存成功／未就绪：**立即清空输入**——key 零残留、零回显
  if (kb.status === 'saved' || kb.status === 'notReady') {
    apiKey.value = ''
    if (kb.baseUrl) baseUrl.value = kb.baseUrl
  }
}

onMounted(reload)
</script>

<template>
  <div class="settings-card kb-card" :data-state="state">
    <h2>{{ t('settings.kb.title') }}</h2>
    <p class="section-desc">{{ t('settings.kb.hint') }}</p>

    <!-- notReady：契约先行期主态——明说，且禁用保存（禁静默成功） -->
    <p v-if="kb.notReady" class="kb-msg err" role="status" data-state="notReady">
      {{ t('settings.kb.notReady') }}
      <button type="button" class="btn-ghost kb-retry" @click="reload">
        {{ t('settings.kb.retry') }}
      </button>
    </p>

    <form class="kb-form" @submit.prevent="submit">
      <label class="kb-field">
        <span class="kb-label">{{ t('settings.kb.baseUrl') }}</span>
        <input
          v-model="baseUrl"
          type="url"
          name="kb-base-url"
          class="kb-input"
          :placeholder="t('settings.kb.baseUrlPlaceholder')"
          :disabled="kb.saving"
          aria-describedby="kb-base-url-help"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <p id="kb-base-url-help" class="kb-help">{{ t('settings.kb.baseUrlHelp') }}</p>

      <label class="kb-field">
        <span class="kb-label">{{ t('settings.kb.apiKey') }}</span>
        <input
          v-model="apiKey"
          type="password"
          name="kb-api-key"
          class="kb-input"
          :placeholder="
            kb.configured ? t('settings.kb.apiKeyPlaceholderSet') : t('settings.kb.apiKeyPlaceholder')
          "
          :disabled="kb.saving"
          autocomplete="new-password"
        />
      </label>

      <p class="kb-state" :class="{ ok: kb.configured }">
        {{ kb.configured ? `✓ ${t('settings.kb.configured')}` : t('settings.kb.notConfigured') }}
        <span v-if="kb.keyFp" class="kb-meta">{{ t('settings.kb.keyFp', { fp: kb.keyFp }) }}</span>
        <span v-if="kb.source" class="kb-meta">{{ t(`settings.kb.source.${kb.source}`) }}</span>
      </p>

      <div class="kb-actions">
        <button
          type="submit"
          class="btn-primary"
          :disabled="kb.saving || kb.notReady || !baseUrl.trim() || !apiKey.trim()"
        >
          {{ kb.saving ? t('settings.kb.saving') : t('settings.kb.save') }}
        </button>
        <button type="button" class="btn-ghost" :disabled="kb.saving" @click="reload">
          {{ kb.loading ? t('settings.kb.loading') : t('settings.kb.reload') }}
        </button>
      </div>

      <!-- success：明确反馈（显归一后域名） -->
      <p v-if="kb.status === 'saved'" class="kb-msg ok" role="status">
        {{ t('settings.kb.saved', { url: kb.savedBaseUrl }) }}
      </p>
      <!-- error：失败可重试（不静默、不假装成功） -->
      <p v-else-if="kb.status === 'error'" class="kb-msg err" role="alert">
        {{ t('settings.kb.failed', { msg: kb.error }) }}
        <button type="button" class="btn-ghost kb-retry" @click="submit">
          {{ t('settings.kb.retry') }}
        </button>
      </p>
      <!-- invalid：前端校验（域名形态／key 必填） -->
      <p v-else-if="kb.status === 'invalid'" class="kb-msg err" role="alert">
        {{ t(`settings.kb.invalid.${kb.errorKey}`) }}
      </p>
    </form>
  </div>
</template>

<style scoped>
/* DEBT-743：本卡样式走既有 settings 卡片族＋全 token（DESIGN.md §10 四条机判） */
.kb-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kb-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kb-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.kb-input {
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-primary);
  font-size: 15px;
}

.kb-input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

.kb-input:disabled {
  background: var(--surface-2);
  color: var(--text-disabled);
}

.kb-help,
.kb-meta {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.kb-state {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.kb-state.ok {
  color: var(--success-text);
}

.kb-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.kb-actions .btn-primary:disabled,
.kb-actions .btn-ghost:disabled {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text-disabled);
  cursor: default;
}

.kb-msg {
  margin: 8px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.kb-msg.ok {
  background: var(--success-soft);
  color: var(--success-text);
}

.kb-msg.err {
  background: var(--danger-soft);
  color: var(--danger);
}

.kb-retry {
  margin-left: 8px;
}
</style>
