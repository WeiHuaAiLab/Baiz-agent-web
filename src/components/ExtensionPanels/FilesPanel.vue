<script setup lang="ts">
// 文件面板（抽屉内容）：工作区文件树 + 当前文件视图；active 存在时按 preview 语义
// 分流到 diff / preview 两个 viewer 子组件，无 active 时显示文件树与授权目录。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFilesStore } from '../../stores/files'
import { useWorkingTreeStore } from '../../stores/workingTree'
import { buildTree } from '../../utils/tree'
import type { TreeNode } from '../../utils/tree'
import FileTreeItem from './files/FileTreeItem.vue'
import FileDiffViewer from './files/FileDiffViewer.vue'
import FilePreviewViewer from './files/FilePreviewViewer.vue'
import Icon from '../common/Icon.vue'
import type { FileEntry } from '../../bridge'

const { t } = useI18n()
const files = useFilesStore()
const working = useWorkingTreeStore()

const emit = defineEmits<{ close: [] }>()

const treeRoots = computed<TreeNode[]>(() => buildTree(working.list))
const active = computed(() => working.active)
// 预览模式判定：FileCard 落 preview 时把 original 留空——与「写过但未落原版」语义一致。
const previewMode = computed(() => active.value?.original === '')

const authorizedOpen = ref<Record<string, boolean>>({})
const authorizedEntries = ref<Record<string, FileEntry[]>>({})

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
      <FileDiffViewer v-if="active && !previewMode" :active="active" />
      <FilePreviewViewer v-else-if="active" :active="active" />
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
  </aside>
</template>