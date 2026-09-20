<script setup lang="ts">
// 文件面板（工作区右栏）：工作树 diff 预览＋已授权目录浏览＋外部文件预览。
// MSG-3218：授权目录面改为「逐层可展开的树」（原为单层平铺、目录项不可点开），
// 且列目录失败一律给人话提示（禁静默兜空／禁「暂无文件」糊弄）。
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
import AuthorizedEntry from './files/AuthorizedEntry.vue'
import { isHtmlPath } from '../../utils/htmlPreview'
import Icon from '../common/Icon.vue'
import { useUiStore } from '../../stores/ui'

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
const otherFiles = computed(() => working.list.filter((file) => file.path !== active.value?.path))
// MSG-2998 修③（DEBT-619）：目录点开 → 预览；接口未接入时诚实降级。
const previewPath = ref('')
const previewName = ref('')
// MSG-3187 档一：`.html`／`.htm` 走沙箱静态预览（看页面而非源码），其余走源码预览。
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

/**
 * MSG-3218 ②：授权目录展开走 store——逐层缓存／展开态／失败文案同一处；
 * 失败不再兜空（文案入 `files.dirErrors`，由模板的人话提示面呈现）。
 */
function toggleAuthorized(key: string) {
  void files.toggleDir(key)
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
      <!-- MSG-2998 修③：预览面（目录点开进入）——接口未接入时诚实降级 -->
      <!-- MSG-3187 档一：HTML 走沙箱预览（三按钮：刷新／在浏览器打开／只读来源） -->
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
              <span class="stat-del">-{{ stats.removed }}</span>
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
              <span class="cl-marker">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : '' }}</span>
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
              <Icon name="chevron" :size="12" :class="{ open: files.dirOpen[key] }" />
              <span>{{ dir.name }}</span>
              <span class="authorized-badge">{{ t('files.authorized') }}</span>
            </div>
            <!-- MSG-3218 ②：逐层可展开树（原为单层平铺、目录项不可点开）
                 ①失败面：dirErrors 人话提示（禁静默空表／禁「暂无文件」糊弄） -->
            <ul v-if="files.dirOpen[key]" class="authorized-files">
              <li v-if="files.dirLoading[key]" class="authorized-status">
                {{ t('files.dirLoading') }}
              </li>
              <li v-else-if="files.dirErrors[key]" class="authorized-error">
                {{ files.dirErrors[key] }}
              </li>
              <template v-else>
                <li v-for="entry in files.dirEntries[key] ?? []" :key="entry.path">
                  <AuthorizedEntry
                    :entry="entry"
                    :depth="0"
                    @open="openPreview($event.path, $event.name)"
                  />
                </li>
                <li v-if="!(files.dirEntries[key] ?? []).length" class="authorized-status">
                  {{ t('files.dirEmpty') }}
                </li>
              </template>
            </ul>
          </div>
        </div>
        <p v-if="treeRoots.length === 0" class="placeholder">{{ t('files.empty') }}</p>
      </template>
    </div>
    <div v-if="pathOpen" class="menu-mask" @click="pathOpen = false" />
  </aside>
</template>
