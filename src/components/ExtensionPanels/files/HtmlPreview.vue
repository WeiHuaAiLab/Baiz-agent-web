<script setup lang="ts">
// MSG-3187 · 档一「HTML 静态预览」（与 FilePreview.vue 并列）：
// 沙箱 iframe 渲染工作区／授权目录内的 `.html`——**看到的是界面，不是源码**。
// 三按钮：**刷新／在浏览器打开／只读来源**；**脚本开关**默认开（关 ⇒ 纯静态）。
//
// 安全三条（见 utils/htmlPreview.ts）：沙箱化（无 allow-* 特权）／高风险 API 一律拦
// （CSP：connect-src 'none' 等）／**只读**（字节来自既有 file.preview 路径闸——越界即取不到）。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DOMPurify from 'dompurify'
import { getBridge } from '../../../bridge'
import {
  buildExternalPreviewDocument,
  buildPreviewDocument,
  previewSandbox,
} from '../../../utils/htmlPreview'
import { decodePreview, highlightPreview, formatBytes } from '../../../utils/filePreview'
import type { PreviewDecode, PreviewLoader } from '../../../utils/filePreview'
import Icon from '../../common/Icon.vue'

const props = defineProps<{
  path: string
  name: string
  /** 未注入（undefined）= 接口未接入——诚实降级文案 */
  loader?: PreviewLoader
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const loading = ref(false)
/** 失败人话（**不白屏无提示**——验收⑤） */
const errorText = ref('')
/** 已取到的 HTML 原文（**只读**：仅来自 loader） */
const html = ref('')
const decode = ref<PreviewDecode | null>(null)
/** 脚本开关：默认开（沙箱内脚本） */
const scripts = ref(true)
/** 视图：渲染（iframe）／只读来源（源码） */
const mode = ref<'render' | 'source'>('render')
/** 「在浏览器打开」的运行期提示（壳不支持时——不假装成功） */
const openHint = ref('')

/** iframe 的 srcdoc（CSP ＋ 原文）；脚本关 ⇒ CSP `script-src 'none'` */
const doc = computed(() => (html.value ? buildPreviewDocument(html.value, { scripts: scripts.value }) : ''))
const sandbox = computed(() => previewSandbox({ scripts: scripts.value }))
/** 源码视图（转义/高亮＋净化——与 FilePreview 同法） */
const sourceHtml = computed(() =>
  decode.value ? DOMPurify.sanitize(highlightPreview(decode.value.text, props.path, decode.value.shownBytes)) : '',
)
/** 越界/失败 ⇒ 无内容 ⇒ 外开与来源两键均不可用（**外开也走同一闸**） */
const hasContent = computed(() => html.value.length > 0)

let loadSeq = 0

async function load(): Promise<void> {
  const seq = ++loadSeq
  errorText.value = ''
  openHint.value = ''
  html.value = ''
  decode.value = null
  const loader = props.loader
  if (!loader) {
    errorText.value = t('files.previewUnavailable')
    return
  }
  loading.value = true
  try {
    const result = await loader(props.path)
    if (seq !== loadSeq) return
    if (result === null) {
      // 越界/不存在/过大等——既有路径闸在此表现为取不到：人话提示，绝不白屏
      errorText.value = t('files.htmlPreviewFailed')
      return
    }
    const isPayload =
      typeof result === 'object' &&
      result !== null &&
      'bytes' in (result as unknown as Record<string, unknown>)
    const bytes = isPayload ? (result as { bytes: Uint8Array }).bytes : (result as Uint8Array)
    const hints = isPayload
      ? (result as { totalBytes: number; truncated: boolean; binary: boolean })
      : undefined
    const decoded = decodePreview(bytes, undefined, hints)
    if (decoded.kind !== 'text' || !decoded.text.trim()) {
      errorText.value = t('files.htmlPreviewFailed')
      return
    }
    decode.value = decoded
    html.value = decoded.text
  } catch (error) {
    if (seq !== loadSeq) return
    errorText.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () => [props.path, props.loader] as const,
  () => {
    mode.value = 'render'
    void load()
  },
  { immediate: true },
)

/**
 * 「在浏览器打开」——**先过同一闸**：只有上面那次**闸后只读读取**成功（`html` 非空）
 * 才可能触发；越界文件根本取不到字节 ⇒ 本钮禁用（不得因交给系统浏览器而绕过校验）。
 * 机制：闸后字节 → `blob:` 文档（**同策略沙箱包装**）→ 既有外开桥；桥不支持
 * （协议白名单只放行 https/mailto，或壳未提供该命令）⇒ 回落应用内新窗；
 * 新窗也开不出 ⇒ **明说**（不假装成功）。
 */
async function openInBrowser(): Promise<void> {
  if (!hasContent.value) return
  openHint.value = ''
  const page = buildExternalPreviewDocument(html.value, { scripts: scripts.value })
  const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }))
  // 外开桥的协议白名单**原样未动**（只放行 https?:|mailto:）——`blob:` 文档一律
  // 走应用内新窗；若该协议恰在白名单内（未来扩展）则优先走桥。
  if (/^(https?:|mailto:)/i.test(url)) {
    try {
      await getBridge().openExternal.open(url)
      return
    } catch {
      /* 壳未提供外开命令——落下方新窗兜底 */
    }
  }
  const opened = window.open(url, '_blank', 'noopener')
  if (!opened) openHint.value = t('files.htmlOpenUnsupported')
  // blob 生命期交浏览器（新窗持有引用）；此处不 revoke，避免新窗空白
}

onBeforeUnmount(() => {
  loadSeq += 1
})
</script>

<template>
  <section
    class="html-preview"
    :data-mode="mode"
    :data-state="errorText ? 'error' : loading ? 'loading' : hasContent ? 'ready' : 'empty'"
  >
    <header class="hp-head">
      <button type="button" class="hp-back" :title="t('files.backToTree')" @click="emit('close')">
        <Icon name="chevron" :size="12" />
      </button>
      <span class="hp-name" :title="path">{{ name }}</span>
      <span v-if="decode" class="hp-size">{{ formatBytes(decode.totalBytes) }}</span>
    </header>

    <div class="hp-bar">
      <button type="button" class="hp-btn" :disabled="loading" @click="load">
        {{ loading ? t('files.htmlRefreshing') : t('files.htmlRefresh') }}
      </button>
      <button
        type="button"
        class="hp-btn"
        :disabled="!hasContent"
        :title="t('files.htmlOpenHint')"
        @click="openInBrowser"
      >
        {{ t('files.htmlOpenInBrowser') }}
      </button>
      <button type="button" class="hp-btn" @click="mode = mode === 'render' ? 'source' : 'render'">
        {{ mode === 'render' ? t('files.htmlViewSource') : t('files.htmlViewRendered') }}
      </button>
      <label class="hp-toggle">
        <input v-model="scripts" type="checkbox" :disabled="loading" />
        <span>{{ scripts ? t('files.htmlScriptsOn') : t('files.htmlScriptsOff') }}</span>
      </label>
    </div>

    <!-- 失败/越界：人话提示（不白屏） -->
    <p v-if="errorText" class="hp-error" role="alert">{{ errorText }}</p>
    <p v-else-if="openHint" class="hp-hint" role="status">{{ openHint }}</p>

    <!-- 渲染面：沙箱 iframe（无 allow-* 特权；CSP 拦高风险 API） -->
    <div v-else-if="mode === 'render' && hasContent" class="hp-frame-wrap">
      <iframe
        class="hp-frame"
        :sandbox="sandbox"
        :srcdoc="doc"
        :data-scripts="String(scripts)"
        referrerpolicy="no-referrer"
      />
    </div>

    <!-- 只读来源（源码） -->
    <div v-else-if="mode === 'source' && hasContent" class="hp-source">
      <pre class="hp-source-pre"><code v-html="sourceHtml" /></pre>
    </div>

    <p v-else-if="loading" class="hp-hint">{{ t('files.htmlLoading') }}</p>
  </section>
</template>

<style scoped>
/* MSG-3187：全 token／圆角 ⊆{4,8,12,16,9999}／间距全 4 倍数（DESIGN.md §10） */
.html-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
}

.hp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 8px;
}

.hp-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  color: var(--muted);
  transform: rotate(180deg);
}

.hp-back:hover {
  color: var(--text);
  background: var(--hover);
}

.hp-back:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.hp-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text);
}

.hp-size {
  color: var(--muted);
  font-size: 11px;
}

.hp-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hp-btn {
  position: relative;
  min-height: 28px;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* 热区 ≥44×44（视觉高 28 ⇒ 上下各扩 8；不撑视觉高度） */
.hp-btn::after {
  content: '';
  position: absolute;
  inset: -8px -4px;
}

.hp-btn:hover:not(:disabled) {
  background: var(--hover);
}

.hp-btn:active:not(:disabled) {
  filter: brightness(0.95);
}

.hp-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.hp-btn:disabled {
  border-color: var(--border);
  background: var(--surface-2);
  color: var(--text-disabled);
  cursor: default;
}

.hp-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.hp-toggle input:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.hp-error {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
}

.hp-hint {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-secondary);
  font-size: 13px;
}

.hp-frame-wrap {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
}

.hp-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.hp-source {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--code-bg);
}

.hp-source-pre {
  margin: 0;
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
}
</style>
