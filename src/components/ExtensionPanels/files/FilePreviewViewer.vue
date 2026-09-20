<script setup lang="ts">
// 预览结果视图：当 active.original === '' 时，FileCard 注入的纯内容展示——
// 无 diff 标记、无应用/回滚按钮，仅逐行渲染 current；路径切换菜单保留，
// 便于在已加载的预览文件之间跳转或返回文件树。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkingTreeStore } from '../../../stores/workingTree'
import type { WorkingFile } from '../../../stores/workingTree'
import Icon from '../../common/Icon.vue'

const props = defineProps<{ active: WorkingFile }>()
const { t } = useI18n()
const working = useWorkingTreeStore()

const previewLines = computed(() => props.active.current.split('\n'))
const pathOpen = ref(false)
const otherFiles = computed(() => working.list.filter((file) => file.path !== props.active.path))

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

function basename(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}

function pickFile(path: string) {
  working.selectFile(path)
  pathOpen.value = false
}

function backToTree() {
  working.closeViewer()
  pathOpen.value = false
}
</script>

<template>
  <div class="code-viewer preview-mode">
    <div class="viewer-head">
      <div class="viewer-path-wrap">
        <button type="button" class="viewer-path" @click.stop="pathOpen = !pathOpen">
          <span class="viewer-path-text">{{ active.path }}</span>
          <Icon name="chevron" :size="12" :class="{ open: pathOpen }" />
        </button>
        <span class="preview-tag" :title="t('files.preview')">{{ t('files.preview') }}</span>
        <div v-if="pathOpen" class="path-menu">
          <div class="path-menu-title">{{ t('files.pathFiles') }}</div>
          <button
            v-for="file in otherFiles"
            :key="file.path"
            type="button"
            class="path-menu-item"
            @click="pickFile(file.path)"
          >
            <span class="pm-name">{{ basename(file.path) }}</span>
            <span class="pm-dir">{{ dirname(file.path) }}</span>
          </button>
          <button type="button" class="path-menu-tree" @click="backToTree">
            {{ t('files.backToTree') }}
          </button>
        </div>
      </div>
    </div>
    <div class="preview-lines">
      <div v-for="(line, i) in previewLines" :key="i" class="code-line preview">
        <span class="cl-no">{{ i + 1 }}</span>
        <span class="cl-text">{{ line }}</span>
      </div>
      <p v-if="!previewLines.length || (previewLines.length === 1 && !previewLines[0])" class="placeholder">
        {{ t('files.previewEmpty') }}
      </p>
    </div>
  </div>
</template>