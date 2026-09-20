<script setup lang="ts">
// 文件面板（抽屉内容）：工作区文件树 + 当前文件 diff 预览与行级变更，支持授权目录浏览外部文件。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFilesStore } from '../../stores/files'
import { useWorkingTreeStore } from '../../stores/workingTree'
import { buildTree } from '../../utils/tree'
import type { TreeNode } from '../../utils/tree'
import { computeLineDiff, diffStats } from '../../utils/diff'
import FileTreeItem from './files/FileTreeItem.vue'
import FilePreview from './files/FilePreview.vue'
import HtmlPreview from './files/HtmlPreview.vue'
import { isHtmlPath } from '../../utils/htmlPreview'
import Icon from '../common/Icon.vue'
import { useUiStore } from '../../stores/ui'
import type { FileEntry } from '../../bridge'

const { t } = useI18n()
const files = useFilesStore()
const working = useWorkingTreeStore()
const ui = useUiStore()

const emit = defineEmits<{ close: [] }>()

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
// MSG-2998 修③（DEBT-619）：目录树点件 → 预览（抽屉内预览面；接口未接入时诚实降级）
const previewPath = ref('')
const previewName = ref('')
/** MSG-3187 档一：`.html`／`.htm` 走**沙箱静态预览**（看到界面而非源码）；其余件走源码预览 */
const previewIsHtml = computed(() => isHtmlPath(previewPath.value))

function openPreview(path: string, name: string) {
  previewPath.value = path
  previewName.value = name || basename(path)
  pathOpen.value = false
}

function closePreview() {
  previewPath.value = ''
  previewName.value = ''
}

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
      <div class="files-head-actions">
        <button type="button" :title="t('files.upload')" @click="files.attachFromPicker()">
          <Icon name="plus" :size="15" />
        </button>
        <button type="button" :title="t('files.collapse')" @click="emit('close')">
          <Icon name="x" :size="14" />
        </button>
      </div>
    </header>
    <div class="files-body">
      <!-- MSG-2998 修③：预览面（目录树点件进入）——接口未接入时降级文案由组件内诚实呈现 -->
      <!-- MSG-3187 档一：HTML 件走沙箱预览（三按钮：刷新／在浏览器打开／只读来源＋脚本开关） -->
      <HtmlPreview
        v-if="previewPath && previewIsHtml"
        :path="previewPath"
        :name="previewName"
        :loader="files.previewLoader ?? undefined"
        @close="closePreview"
      />
      <FilePreview
        v-else-if="previewPath"
        :path="previewPath"
        :name="previewName"
        :loader="files.previewLoader ?? undefined"
        @close="closePreview"
      />
      <template v-else-if="active">
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
                <!-- MSG-2998 修③：目录条目仍为列项（单层列面）；文件条目可点开预览 -->
                <span v-if="entry.isDir" class="authorized-dir-entry">▸ {{ entry.name }}</span>
                <button
                  v-else
                  type="button"
                  class="authorized-file-btn"
                  @click="openPreview(entry.path, entry.name)"
                >
                  {{ entry.name }}
                </button>
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
