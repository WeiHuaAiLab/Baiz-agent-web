<script setup lang="ts">
// MSG-2998 修③（DEBT-619 文件预览 web 面）：目录树点件 → 预览抽屉内容。
// 语法高亮（highlight.js）＋大件截断明示＋GBK/UTF-16 编码兜底＋二进制件
// 示「不可预览」＋凭据件（.env 等）遮罩二次确认方示。
//
// 数据来源：loader 注入面——预览内容接口属 daemon 侧只读 RPC（另令俟颁），
// 本件只做前端组件与交互，勿擅定 wire；未注入时诚实降级（不装懂）。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DOMPurify from 'dompurify'
import {
  decodePreview,
  formatBytes,
  highlightPreview,
  isCredentialFile,
} from '../../../utils/filePreview'
import type { PreviewDecode, PreviewLoader } from '../../../utils/filePreview'
import Icon from '../../common/Icon.vue'
import { getBridge } from '../../../bridge'

const props = defineProps<{
  path: string
  name: string
  /** 未注入（undefined）= 接口未接入——诚实降级文案 */
  loader?: PreviewLoader
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const loading = ref(false)
const errorText = ref('')
const decode = ref<PreviewDecode | null>(null)
/** 凭据件二次确认（安全钉：默认遮罩——确认后方示） */
const revealed = ref(false)
// MSG-3218 ③（能力面·兜底）：二进制／视频无内嵌播放，也无"用系统播放器打开"能力
// （壳侧 `proxy_open_external` 只放行 http/https/mailto，见 host.rs:115-118）——
// 故给**复制文件路径**兜底出口（用户可粘到播放器/编辑器打开），并如实照录缺失。
const copiedPath = ref(false)

async function copyPath(): Promise<void> {
  try {
    await getBridge().clipboard.writeText(props.path)
    copiedPath.value = true
    setTimeout(() => {
      copiedPath.value = false
    }, 1200)
  } catch {
    /* clipboard unavailable */
  }
}

const credential = computed(() => isCredentialFile(props.path))
const masked = computed(() => credential.value && !revealed.value)

/** 代际守卫：快速连点/切件时，过期回包不得覆盖新件结果（乱序竞态） */
let loadSeq = 0

async function load(): Promise<void> {
  const seq = ++loadSeq
  errorText.value = ''
  decode.value = null
  revealed.value = false
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
      errorText.value = t('files.previewFailed')
      return
    }
    // MSG-3014：daemon 载荷（size/truncated/binary 标记随行）与裸字节面兼容。
    // 判式走鸭子型（'bytes' in result——勿用 instanceof Uint8Array：
    // 跨 realm 构造面失准——jsdom TextEncoder 面实证）
    const isPayload =
      typeof result === 'object' &&
      result !== null &&
      'bytes' in (result as Record<string, unknown>)
    const bytes = isPayload ? (result as { bytes: Uint8Array }).bytes : (result as Uint8Array)
    const hints = isPayload
      ? (result as { totalBytes: number; truncated: boolean; binary: boolean })
      : undefined
    decode.value = decodePreview(bytes, undefined, hints)
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
    void load()
  },
  { immediate: true },
)

// 安全钉：预览内容按不可信输入处理——highlight.js 输出再经 DOMPurify 清洗
const highlighted = computed(() => {
  if (!decode.value || decode.value.kind !== 'text') return ''
  return DOMPurify.sanitize(
    highlightPreview(decode.value.text, props.path, decode.value.shownBytes),
  )
})
</script>

<template>
  <div class="file-preview">
    <div class="preview-head">
      <span class="preview-name" :title="path">{{ name }}</span>
      <span v-if="decode?.encoding" class="preview-encoding">{{ decode.encoding }}</span>
      <span v-if="decode" class="preview-size">{{ formatBytes(decode.totalBytes) }}</span>
      <button
        type="button"
        class="preview-close"
        :title="t('files.backToTree')"
        @click="emit('close')"
      >
        <Icon name="x" :size="14" />
      </button>
    </div>

    <div v-if="loading" class="preview-status">{{ t('files.previewLoading') }}</div>
    <div v-else-if="errorText" class="preview-status error">{{ errorText }}</div>
    <template v-else-if="decode">
      <div v-if="decode.truncated" class="preview-truncated">
        {{
          t('files.previewTruncated', {
            shown: formatBytes(decode.shownBytes),
            total: formatBytes(decode.totalBytes),
          })
        }}
      </div>

      <div v-if="masked" class="preview-mask">
        <div class="mask-icon">🔒</div>
        <div class="mask-title">{{ t('files.credentialMaskTitle') }}</div>
        <p class="mask-desc">{{ t('files.credentialMaskDesc') }}</p>
        <button type="button" class="mask-reveal" @click="revealed = true">
          {{ t('files.credentialReveal') }}
        </button>
      </div>

      <template v-else>
        <div v-if="decode.kind === 'binary'" class="preview-status">
          {{ t('files.previewBinary') }}
          <!-- MSG-3218 ③：无系统播放器外开能力（壳侧 scheme 白名单）——给复制路径兜底 -->
          <button type="button" class="binary-copy" @click="copyPath">
            {{ copiedPath ? t('common.copied') : t('files.copyPath') }}
          </button>
        </div>
        <div v-else-if="decode.kind === 'empty'" class="preview-status">
          {{ t('files.previewEmpty') }}
        </div>
        <pre v-else class="preview-code"><code v-html="highlighted" /></pre>
      </template>
    </template>
  </div>
</template>
