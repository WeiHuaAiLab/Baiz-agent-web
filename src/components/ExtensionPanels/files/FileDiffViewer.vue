<script setup lang="ts">
// 修改过程视图：当 active.original 非空时，渲染 original → current 的逐行 diff，
// 暴露「应用」「回滚」操作；路径切换菜单（其它文件 / 返回树）也在内部维护。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '../../../stores/ui'
import { useWorkingTreeStore } from '../../../stores/workingTree'
import type { WorkingFile } from '../../../stores/workingTree'
import { computeLineDiff, diffStats } from '../../../utils/diff'
import Icon from '../../common/Icon.vue'

const props = defineProps<{ active: WorkingFile }>()
const { t } = useI18n()
const working = useWorkingTreeStore()
const ui = useUiStore()

const stats = computed(() => diffStats(props.active.original, props.active.current))
const lines = computed(() => computeLineDiff(props.active.original, props.active.current))
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

function applyChanges() {
  working.applyChanges(props.active.path)
  ui.toast(t('files.changesApplied'), 'success')
}

function revertChanges() {
  working.revertChanges(props.active.path)
  ui.toast(t('files.changesReverted'), 'info')
}
</script>

<template>
  <div class="code-viewer">
    <div class="viewer-head">
      <div class="viewer-path-wrap">
        <button type="button" class="viewer-path" @click.stop="pathOpen = !pathOpen">
          <span class="viewer-path-text">{{ active.path }}</span>
          <Icon name="chevron" :size="12" :class="{ open: pathOpen }" />
        </button>
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
      <span v-if="stats.added > 0 || stats.removed > 0" class="viewer-stats">
        <span class="stat-add">+{{ stats.added }}</span>
        <span class="stat-del">−{{ stats.removed }}</span>
      </span>
      <div v-if="stats.added > 0 || stats.removed > 0" class="viewer-actions">
        <button type="button" class="apply-btn" @click="applyChanges">
          {{ t('files.applyChanges') }}
        </button>
        <button type="button" class="revert-btn" @click="revertChanges">
          {{ t('files.revertChanges') }}
        </button>
      </div>
    </div>
    <div class="viewer-lines">
      <div v-for="(line, i) in lines" :key="i" class="code-line" :class="line.type">
        <span class="cl-marker">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '−' : '' }}</span>
        <span class="cl-no">{{ line.newNo ?? line.oldNo ?? '' }}</span>
        <span class="cl-text">{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>