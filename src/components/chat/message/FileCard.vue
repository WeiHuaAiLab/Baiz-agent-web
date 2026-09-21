<script setup lang="ts">
// 文件卡片（MSG-3233 ②：自 origin/main 挑件移植，**按我方口径适配**）。
// 上游原件位于 `chat/message/FileCard.vue`；我方无 `chat/message/` 目录 ⇒ 落 `chat/`（平铺）。
//
// 适配差异（逐条照录）：
//   1) import 层级 −1（`../../stores/*`／`../../bridge`／`../../utils/fileCard`）；
//   2) **点击行为改挂我方既有口径**——`working.upsert(path,'',body)` + `working.selectFile(path)`
//      ⇒ 右侧面板既有 code-viewer 现形（我方 `.file-ref` 点击同源）；
//      **不用**上游的「FilesPanel preview 模式 + ui.setExtensionOpen」新径（那要改 FilesPanel，
//      与本令"明令不挑 FilesPanel.vue"冲突）；
//   3) **不移植上游的「运行」按钮**（Blob 新窗口跑 HTML）——与我方 MSG-3187 沙箱 HtmlPreview
//      形成双轨，且新窗口绕过我方沙箱策略；`kind.runnable` 仅作数据保留（取舍照录于讫报）。
//
// 内容来源（按优先级，与上游一致）：props.content（SSE argsPreview.content）
// → workingTree.files[path].current → 桥接层读盘兜底。
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
// 桥接层兜底读到的内容：命中后常驻缓存，避免下次重复 IO；'' 视为「确认不可读」。
const loadedBody = ref('')
const body = computed(() => {
  if (loadedBody.value) return loadedBody.value
  if (props.content !== undefined && props.content !== null) return props.content
  return working.files[props.path]?.current ?? ''
})
const lineCount = computed(() => (body.value ? body.value.split('\n').length : 0))

/** 桥接层兜底：读成功则常驻缓存；失败返 ''（不再重复请求）＋ console 留痕便于排障。 */
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
  // 我方口径：内容预热后 upsert + selectFile ⇒ 右侧面板 code-viewer 现形（original='' 纯展示）
  if (!body.value) await loadFromDisk()
  working.upsert(props.path, '', body.value)
  working.selectFile(props.path)
  ui.toast(t('chat.fileCard.open') + ' · ' + name.value, 'info')
}
</script>

<template>
  <div v-if="kind" class="file-card" role="button" tabindex="0" @click="open" @keydown.enter="open">
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
    </div>
  </div>
</template>
