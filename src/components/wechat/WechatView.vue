<script setup lang="ts">
// 微信消息展示页（MSG-2418 甲）：接收端归档消息单页浏览。
// 数据源：同源 /wechat-recv/messages?since=（nginx /wechat-view/ 与
// /wechat-recv/ 同站点——零 CORS）；契约照 2418 乙终态。
// 凭据纪律：token 配置占位（老板直注）——sessionStorage 内存态
// （零落盘零硬码——登录 token 同纪律）；空串不携带。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchAllWechatMessages,
  fetchWechatMessages,
  type WechatRecvMessage,
} from '../../utils/wechatView'

const { t } = useI18n()

const TOKEN_KEY = 'wechatViewToken'
const messages = ref<WechatRecvMessage[]>([])
const loading = ref(false)
const error = ref('')
const tokenInput = ref(sessionStorage.getItem(TOKEN_KEY) ?? '')

const lastId = computed(() => messages.value.at(-1)?.id ?? 0)

function persistToken() {
  const v = tokenInput.value.trim()
  if (v) sessionStorage.setItem(TOKEN_KEY, v)
  else sessionStorage.removeItem(TOKEN_KEY)
}

async function loadAll() {
  persistToken()
  loading.value = true
  error.value = ''
  try {
    messages.value = await fetchAllWechatMessages(tokenInput.value.trim())
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

/** 刷新增量：since=末 id——无重无漏（id 已在列则跳过兜底）。 */
async function refreshMore() {
  if (loading.value) return
  persistToken()
  loading.value = true
  error.value = ''
  try {
    const page = await fetchWechatMessages(lastId.value, tokenInput.value.trim())
    const known = new Set(messages.value.map((m) => m.id))
    for (const m of page) {
      if (!known.has(m.id)) {
        messages.value.push(m)
        known.add(m.id)
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

onMounted(loadAll)
</script>

<template>
  <div class="wechat-view">
    <header class="wv-head">
      <h2>{{ t('nav.wechat') }}</h2>
      <div class="wv-actions">
        <input
          v-model="tokenInput"
          class="wv-token"
          type="password"
          :placeholder="t('wechat.tokenPlaceholder')"
          @change="persistToken"
        />
        <button type="button" class="wv-btn" :disabled="loading" @click="loadAll">
          {{ t('wechat.reloadAll') }}
        </button>
        <button
          v-if="messages.length > 0"
          type="button"
          class="wv-btn primary"
          :disabled="loading"
          @click="refreshMore"
        >
          {{ t('wechat.refreshNew') }}
        </button>
      </div>
    </header>

    <p v-if="error" class="wv-error">{{ error }}</p>
    <p v-if="loading" class="wv-hint">{{ t('wechat.loading') }}</p>

    <div v-else-if="messages.length === 0" class="wv-empty">
      {{ t('wechat.empty') }}
    </div>

    <ul v-else class="wv-list">
      <li v-for="m in messages" :key="m.id" class="wv-row">
        <span class="wv-meta">
          <span class="wv-from">{{ m.from || '—' }}</span>
          <span class="wv-type">{{ m.type }}</span>
          <span class="wv-ts">{{ fmtTs(m.ts) }}</span>
        </span>
        <span class="wv-text">{{ m.text }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.wechat-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 16px 20px;
  overflow-y: auto;
}
.wv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.wv-head h2 {
  margin: 0;
  font-size: 17px;
}
.wv-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wv-token {
  width: 200px;
  padding: 5px 8px;
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  background: transparent;
  color: inherit;
}
.wv-btn {
  padding: 5px 12px;
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.wv-btn.primary {
  border-color: var(--accent, #4a7dff);
  color: var(--accent, #4a7dff);
}
.wv-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.wv-hint,
.wv-empty {
  margin: auto;
  color: #888;
}
.wv-error {
  color: #e05;
}
.wv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wv-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border, #333);
  border-radius: 8px;
}
.wv-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #888;
}
.wv-type {
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(127, 127, 127, 0.15);
}
.wv-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
}
</style>
