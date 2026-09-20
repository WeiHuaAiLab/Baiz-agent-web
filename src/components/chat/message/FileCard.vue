<script setup lang="ts">
// 文件卡片：HTML/JS/TS/Vue/CSS/SVG/MD/Rust/Py…等可预览文件的入口卡。
// ToolRow 在 path 命中 fileCard.classifyFile() 时改用本组件替代原 .file-ref 链接。
//
// 交互：
// - 默认点击 = 在 ExtensionPanels 中预览（FilesPanel preview 模式：original 留空、纯内容展示）
// - 名称恰好为 index.html 时 = 直接运行（拉新窗口跑 HTML）——用户最常见意图
// - HTML/SVG 类型另起一个「运行」按钮，强制可触发，覆盖 index.html 之外的场景
//
// 内容来源（按优先级）：
//   1. 桥接层读盘（Tauri 真读 / mock demo 读；捕获 SSE 没带 content 的场景）
//   2. SSE 工具调用 argsPreview.content（fs.write 一类工具直接带回）
//   3. workingTree.files[path].current（agent 通过 tool result 回流过的版本）
// open 路径会把内容写进 workingTree，让 FilesPanel 预览（preview 模式）现形。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkingTreeStore } from '../../../stores/workingTree'
import { useUiStore } from '../../../stores/ui'
import { getBridge } from '../../../bridge'
import { classifyFile, basenameOf } from '../../../utils/fileCard'

const props = defineProps<{
  path: string
  content?: string
}>()

const { t } = useI18n()
const working = useWorkingTreeStore()
const ui = useUiStore()

const kind = computed(() => classifyFile(props.path))
const name = computed(() => basenameOf(props.path))
// 「默认运行 index.html」特殊约定：用户生成 index.html 时最自然的动作是直接打开看效果
const isIndexHtml = computed(() => name.value.toLowerCase() === 'index.html')
// 桥接层兜底读到的内容：命中后常驻缓存，避免下次运行重复 IO。
// empty 字符串视为「确认不可读」，不再请求。
const loadedBody = ref('')
const body = computed(() => {
  if (loadedBody.value) return loadedBody.value
  if (props.content !== undefined && props.content !== null) return props.content
  return working.files[props.path]?.current ?? ''
})
const lineCount = computed(() => (body.value ? body.value.split('\n').length : 0))

/** 桥接层兜底：读成功则常驻缓存 loadedBody（body computed 自然取到）；
 *  是否落 workingTree 由调用方决定（run 不切面板，由 open 写入）。
 *  失败返回 ''（视为确认不可读，不再重复请求），并把真实错误打到 console 便于排障。 */
async function loadFromDisk(): Promise<string> {
  if (loadedBody.value) return loadedBody.value
  if (!props.path) return ''
  try {
    const content = await getBridge().fs.readTextFile(props.path)
    if (!content) return ''
    loadedBody.value = content
    return content
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[FileCard] 读盘兜底失败 (${props.path}):`, message)
    return ''
  }
}

async function open() {
  // 兜底：open 走 FilesPanel 预览路径，更需要从磁盘预热（agent 用 bash heredoc
  // 写盘时 SSE 不会带回 argsPreview.content，单靠 upsert(path, '', '') 会留空）
  if (!body.value) await loadFromDisk()
  // preview 模式约定：original='' → FilesPanel 走 preview-lines 纯展示，无 diff 标记
  working.upsert(props.path, '', body.value)
  working.selectFile(props.path)
  // 确保右侧扩展面板展开：用户可能之前手动收起了面板
  ui.setExtensionOpen(true)
  ui.toast(t('chat.fileCard.open') + ' · ' + name.value, 'info')
}

async function run() {
  // SSE 没带回内容不代表磁盘没有——多为 agent 用 bash heredoc 写文件的场景
  if (!body.value) await loadFromDisk()
  if (!body.value) {
    // loadFromDisk 也拿不到（Web 形态无 fs.read / 文件确实不在）
    ui.toast(t('chat.fileCard.runNoContent'), 'info')
    return
  }
  // Blob URL 拉新窗口：Web 形态与 Tauri WebView2 均兼容，规避 data: URL 协议白名单
  const mime = kind.value?.ext === 'svg' ? 'image/svg+xml' : 'text/html'
  const blob = new Blob([body.value], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener')
  if (!win) {
    ui.toast(t('chat.fileCard.runBlocked'), 'info')
    URL.revokeObjectURL(url)
    return
  }
  // 1 分钟加载窗口期再回收 Blob URL，避免新窗口尚未取到内容就失效
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function onCardClick() {
  // 默认行为：index.html 直接跑；其他预览型默认打开面板（FilesPanel 预览模式）
  if (isIndexHtml.value) run()
  else open()
}
</script>

<template>
  <div v-if="kind" class="file-card" role="button" tabindex="0" @click="onCardClick" @keydown.enter="onCardClick">
    <div class="file-card-icon" :style="{ background: kind.color }">
      <!-- 通用文件折页图标：颜色由 kind.color 主导，标签作副信息 -->
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M13 3 L6 3 a2 2 0 0 0-2 2 l0 12 a2 2 0 0 0 2 2 l12 0 a2 2 0 0 0 2 -2 l0 -10.5 Z"
          fill="rgba(255,255,255,0.22)"
          stroke="rgba(255,255,255,0.85)"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
        <path d="M13 3 l0 4.5 4.5 0" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.4" stroke-linejoin="round" />
      </svg>
      <span class="file-card-label">{{ kind.label }}</span>
    </div>
    <div class="file-card-info">
      <div class="file-card-name" :title="path">{{ name }}</div>
      <div class="file-card-path" :title="path">{{ path }}</div>
    </div>
    <div class="file-card-meta">
      <span v-if="lineCount" class="file-card-lines">{{ lineCount }} 行</span>
      <button
        v-if="kind.runnable && !isIndexHtml"
        type="button"
        class="file-card-run"
        :title="t('chat.fileCard.run')"
        @click.stop="run"
      >
        <span aria-hidden="true">▶</span>
        <span>{{ t('chat.fileCard.run') }}</span>
      </button>
    </div>
  </div>
</template>