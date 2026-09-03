<script setup lang="ts">
// 工具调用行：展示工具名、运行状态（运行中/成功/失败）、文件引用与 diff 统计、可展开参数预览。
import { computed, ref } from 'vue'
import type { ChatMessage } from '../../models'
import { useWorkingTreeStore } from '../../stores/workingTree'
import { diffStats } from '../../utils/diff'
import { translateTool } from '../../utils/commandTranslator'
import { extractFilePath, extractShellCommand, extractUrl } from '../../utils/traceText'
import Icon from '../common/Icon.vue'

const props = defineProps<{ message: ChatMessage }>()
const working = useWorkingTreeStore()
const open = ref(false)
const running = computed(() => props.message.meta?.success === undefined)
// 批0 命令翻译：工具调用行的人话说明
const toolHuman = computed(() => translateTool(props.message.meta?.toolName ?? '', props.message.meta?.success))

// MSG-2413 执行行现形：shell 命令 / 文件路径 / URL——跑了什么、碰了哪些文件逐项现形
const filePath = computed(() => extractFilePath(props.message.meta?.argsPreview))
const shellCommand = computed(() => extractShellCommand(props.message.meta?.argsPreview))
const toolUrl = computed(() => extractUrl(props.message.meta?.argsPreview))
// 双族归一（架构铁律3：下划线族为规范名）：fs_read/fs_write/code_edit 等
// 下划线族与点号兼容别名俱收——文件引用现形不漏生产径
const isFileTool = computed(() =>
  /^(fs\.|code\.|fs_|code_|read_file)/.test(props.message.meta?.toolName ?? ''),
)
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
      <span v-if="message.text" class="tool-preview">{{ message.text }}</span>
      <span class="tool-toggle">{{ open ? '▾' : '▸' }}</span>
    </div>
    <!-- MSG-2413 执行行：shell 命令 / URL——跑了什么现形（文件路径在下 file-ref 区） -->
    <code v-if="shellCommand" class="tool-cmd">$ {{ shellCommand }}</code>
    <code v-else-if="toolUrl" class="tool-cmd">↗ {{ toolUrl }}</code>
    <div v-if="isFileTool && filePath" class="file-ref" @click.stop="openFile">
      <Icon name="copy" :size="12" />
      <span class="file-ref-path">{{ filePath }}</span>
      <span v-if="refStats" class="file-ref-stats">
        +{{ refStats.added }} −{{ refStats.removed }}
      </span>
    </div>
    <div v-if="toolHuman" class="xp-tool-human">
      <span class="xp-subtitle-tag">人话</span>
      <span>{{ toolHuman }}</span>
    </div>
    <pre v-if="open && message.meta?.argsPreview" class="tool-args">{{
      message.meta.argsPreview
    }}</pre>
  </div>
</template>
