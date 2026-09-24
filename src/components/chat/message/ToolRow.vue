<script setup lang="ts">
// 工具调用行：展示工具名、运行状态（运行中/成功/失败）、文件引用与 diff 统计、可展开参数预览。
// MSG-3233 ③（自 origin/main 挑件）：文件类工具的 path 命中**预览型扩展**
// （HTML/JS/CSS/Vue/TS/SVG/MD…）时改用 FileCard 渲染；其余扩展保留原 `.file-ref`（最小侵入）。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatMessage } from '../../../models'
import { useWorkingTreeStore } from '../../../stores/workingTree'
import { useSettingsStore } from '../../../stores/settings'
import { diffStats } from '../../../utils/diff'
import { translateTool } from '../../../utils/commandTranslator'
import { extractFilePath, extractShellCommand, extractUrl, parseTraceArgs } from '../../../utils/traceText'
import { classifyFile } from '../../../utils/fileCard'
import Icon from '../../common/Icon.vue'
import FileCard from './FileCard.vue'

const props = defineProps<{ message: ChatMessage }>()
const { t } = useI18n()
const working = useWorkingTreeStore()
const settings = useSettingsStore()
const open = ref(false)
const running = computed(() => props.message.meta?.success === undefined)
// 批0 命令翻译：工具调用行的人话说明（DEBT-873：失败缘由随行——策略拒绝与网络失败分说）
const toolHuman = computed(() =>
  translateTool(props.message.meta?.toolName ?? '', props.message.meta?.success, props.message.text),
)

// MSG-2413 执行行现形：shell 命令 / 文件路径 / URL——跑了什么、碰了哪些文件逐项现形
const filePath = computed(() => extractFilePath(props.message.meta?.argsPreview))
const shellCommand = computed(() => extractShellCommand(props.message.meta?.argsPreview))
const toolUrl = computed(() => extractUrl(props.message.meta?.argsPreview))
/**
 * MSG-3503 A10（DEBT-874／T9「搜索很慢·几十秒」）：取件**在途**人话——
 * 抓网页期间把"静止"显成"进行中"（耗时／上界见结果行正文：
 * daemon 侧 `[取件 X.Xs／上界 Ns]` 前置行）。**不新增帧型**（协议面未动）。
 *
 * R2 波三补：**族面归正**——旧判式只认 `web_fetch`（抓网页），而本债原文是
 * 「T9 **搜索**体验（几十秒～近 1 分钟）」⇒ **搜索族（`web.search`／`web_search`）
 * 反而没有在途人话**，点下去正是"像死住"。今按 `utils/failureText.ts` 既有**取件分型**
 * 同族收口（`web[._](fetch|search)`）。**零扩散不变**：非取件族照旧不出本行。
 */
const FETCH_FAMILY_RE = /^web[._](fetch|search)$/
const runningHint = computed(() => {
  if (!running.value) return ''
  const name = props.message.meta?.toolName ?? ''
  if (!FETCH_FAMILY_RE.test(name)) return ''
  return /search/i.test(name) ? t('chat.searchingWeb') : t('chat.fetchingWeb')
})
/**
 * R2 波三：**在途耗时读数**——"几十秒无反馈"的另一半是"没有任何数在动"。
 * 起点取本条消息落库时刻（`createdAt`＝发起时刻），每秒一跳；`running` 归假即停，
 * 卸载必清（不给测试/切会话留后台定时器）。
 */
const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
const waitedSeconds = computed(() => {
  if (!runningHint.value) return 0
  return Math.max(0, Math.floor((nowTick.value - props.message.createdAt) / 1000))
})
function stopTick() {
  if (tickTimer) clearInterval(tickTimer)
  tickTimer = null
}
watch(
  running,
  (isRunning) => {
    stopTick()
    if (!isRunning) return
    nowTick.value = Date.now()
    tickTimer = setInterval(() => {
      nowTick.value = Date.now()
    }, 1000)
  },
  { immediate: true },
)
onBeforeUnmount(stopTick)
// 双族归一（架构铁律3：下划线族为规范名）：fs_read/fs_write/code_edit 等
// 下划线族与点号兼容别名俱收——文件引用现形不漏生产径
const isFileTool = computed(() =>
  /^(fs\.|code\.|fs_|code_|read_file)/.test(props.message.meta?.toolName ?? ''),
)
/** MSG-3233 ③：预览型扩展判定——命中走 FileCard，未命中走原 .file-ref */
const previewKind = computed(() => (filePath.value ? classifyFile(filePath.value) : null))
/** 文件内容兜底：fs.write 一类 argsPreview 直接带 content；否则回退 workingTree 已落盘版本 */
const fileContent = computed(() => {
  const args = parseTraceArgs(props.message.meta?.argsPreview)
  if (args && typeof args.content === 'string') return args.content
  return working.files[filePath.value]?.current
})
const refStats = computed(() => {
  const file = working.files[filePath.value]
  if (!file) return null
  return diffStats(file.original, file.current)
})

function openFile() {
  if (filePath.value) working.selectFile(filePath.value)
}
</script>

<template>
  <div class="tool-row" :class="{ running, failed: message.meta?.success === false }">
    <div class="tool-main" @click="open = !open">
      <span class="tool-status">{{ running ? '⟳' : message.meta?.success ? '✓' : '✗' }}</span>
      <span class="tool-name">{{ message.meta?.toolName }}</span>
      <span v-if="runningHint" class="tool-hint">{{ runningHint }}</span>
      <!-- R2 波三：在途耗时读数（有数在动＝不是死住；独立元素，不动 .tool-hint 文案契约） -->
      <span v-if="runningHint" class="tool-elapsed">{{ t('chat.waitingSeconds', { n: waitedSeconds }) }}</span>
      <span v-if="message.text" class="tool-preview">{{ message.text }}</span>
      <span class="tool-toggle">{{ open ? '▾' : '▸' }}</span>
    </div>
    <!-- MSG-2413 执行行：shell 命令 / URL——跑了什么现形（文件路径在下 file-ref 区） -->
    <code v-if="shellCommand" class="tool-cmd">$ {{ shellCommand }}</code>
    <code v-else-if="toolUrl" class="tool-cmd">↗ {{ toolUrl }}</code>
    <!-- MSG-3233 ③：预览型扩展走 FileCard（图标＋文件名＋行数，点击进右侧面板预览）；
         其余走原 .file-ref。多卡场景容器 flex 自动换行。
         ★ 本件 FileCard 取**我方口径**——不带上游的「运行」按钮（Blob 新窗跑 HTML，
         与我方 MSG-3187 沙箱策略双轨），故上游此处关于「可运行按钮／index.html 默认直接跑」
         的注释不适用，按我方口径照录。 -->
    <div v-if="isFileTool && filePath && previewKind" class="file-cards">
      <FileCard :path="filePath" :content="fileContent" />
    </div>
    <div v-else-if="isFileTool && filePath" class="file-ref" @click.stop="openFile">
      <Icon name="copy" :size="12" />
      <span class="file-ref-path">{{ filePath }}</span>
      <span v-if="refStats" class="file-ref-stats">
        +{{ refStats.added }} −{{ refStats.removed }}
      </span>
    </div>
    <div v-if="settings.showHuman && toolHuman" class="xp-tool-human">
      <span class="xp-subtitle-tag">人话</span>
      <span>{{ toolHuman }}</span>
    </div>
    <pre v-if="open && message.meta?.argsPreview" class="tool-args">{{
      message.meta.argsPreview
    }}</pre>
  </div>
</template>
