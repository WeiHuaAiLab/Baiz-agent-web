<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFilesStore } from '../stores/files'
import { useWorkingTreeStore } from '../stores/workingTree'
import { buildTree } from '../utils/tree'
import type { TreeNode } from '../utils/tree'
import { computeLineDiff, diffStats } from '../utils/diff'
import FileTreeItem from './files/FileTreeItem.vue'
import Icon from './common/Icon.vue'
import { useUiStore } from '../stores/ui'
import type { FileEntry } from '../bridge'

const { t } = useI18n()
const files = useFilesStore()
const working = useWorkingTreeStore()
const ui = useUiStore()

const treeRoots = computed<TreeNode[]>(() => buildTree(working.list))
const active = computed(() => working.active)
const stats = computed(() =>
  active.value ? diffStats(active.value.original, active.value.current) : null,
)
const lines = computed(() =>
  active.value ? computeLineDiff(active.value.original, active.value.current) : [],
)
const pathOpen = ref(false)
const authorizedOpen = ref<Record<string, boolean>>({})
const authorizedEntries = ref<Record<string, FileEntry[]>>({})
const otherFiles = computed(() => working.list.filter((file) => file.path !== active.value?.path))

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
  if (!active.value) return
  working.applyChanges(active.value.path)
  ui.toast(t('files.changesApplied'), 'success')
}

function revertChanges() {
  if (!active.value) return
  working.revertChanges(active.value.path)
  ui.toast(t('files.changesReverted'), 'info')
}

async function toggleAuthorized(key: string) {
  const willOpen = !authorizedOpen.value[key]
  authorizedOpen.value = { ...authorizedOpen.value, [key]: willOpen }
  if (willOpen && !authorizedEntries.value[key]) {
    authorizedEntries.value = {
      ...authorizedEntries.value,
      [key]: await files.loadAuthorizedDir(key),
    }
  }
}
</script>

<template>
  <aside class="files-panel">
    <header class="files-header">
      <span>{{ t('files.title') }}</span>
      <button type="button" :title="t('files.upload')" @click="files.attachFromPicker()">
        <Icon name="plus" :size="15" />
      </button>
    </header>
    <div class="files-body">
      <template v-if="active">
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
            <span v-if="stats" class="viewer-stats">
              <span class="stat-add">+{{ stats.added }}</span>
              <span class="stat-del">−{{ stats.removed }}</span>
            </span>
            <div
              v-if="stats && (stats.added > 0 || stats.removed > 0)"
              class="viewer-actions"
            >
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
      <template v-else>
        <div v-for="node in treeRoots" :key="node.path" class="tree-root">
          <FileTreeItem :node="node" :depth="0" @select="working.selectFile($event)" />
        </div>
        <div v-if="Object.keys(files.pickedDirs).length" class="authorized-dirs">
          <div class="authorized-head">{{ t('files.authorizedDirs') }}</div>
          <div v-for="(dir, key) in files.pickedDirs" :key="key" class="authorized-dir">
            <div class="authorized-dir-name" @click="toggleAuthorized(key)">
              <Icon name="chevron" :size="12" :class="{ open: authorizedOpen[key] }" />
              <span>{{ dir.name }}</span>
              <span class="authorized-badge">{{ t('files.authorized') }}</span>
            </div>
            <ul v-if="authorizedOpen[key]" class="authorized-files">
              <li v-for="entry in authorizedEntries[key] ?? []" :key="entry.path">
                {{ entry.isDir ? '▸ ' : '' }}{{ entry.name }}
              </li>
            </ul>
          </div>
        </div>
        <p v-if="treeRoots.length === 0" class="placeholder">{{ t('files.empty') }}</p>
      </template>
    </div>
    <div v-if="pathOpen" class="menu-mask" @click="pathOpen = false" />
  </aside>
</template>
