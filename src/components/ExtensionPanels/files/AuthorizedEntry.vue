<script setup lang="ts">
// MSG-3218 ②：授权目录树的递归节点——目录可**逐层展开**（点击 → files.toggleDir(子路径)）。
// 改前面板把 `isDir` 渲染成不可交互的 `▸ name`（单层平铺）⇒ 子目录里的 MD／视频
// 永不可达（真机"里面还有 MD、视频都没展示"的直接成因）。
// 失败面：该层读取失败时渲染 dirErrors 里的人话提示（禁静默空表／禁"暂无文件"糊弄）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFilesStore } from '../../../stores/files'
import Icon from '../../common/Icon.vue'
import type { FileEntry } from '../../../bridge'

const props = defineProps<{ entry: FileEntry; depth: number }>()
const emit = defineEmits<{ open: [{ path: string; name: string }] }>()
const { t } = useI18n()
const files = useFilesStore()

const open = computed(() => props.entry.isDir && files.dirOpen[props.entry.path] === true)
const children = computed(() => files.dirEntries[props.entry.path] ?? [])
const loading = computed(() => files.dirLoading[props.entry.path] === true)
const error = computed(() => files.dirErrors[props.entry.path] ?? '')
const indent = computed(() => `${props.depth * 14 + 6}px`)

function toggle() {
  if (!props.entry.isDir) return
  void files.toggleDir(props.entry.path)
}
</script>

<template>
  <div class="authorized-node">
    <button
      v-if="entry.isDir"
      type="button"
      class="authorized-dir-entry"
      :class="{ open }"
      :style="{ paddingLeft: indent }"
      :title="entry.path"
      @click="toggle"
    >
      <Icon name="chevron" :size="12" :class="{ open }" />
      <span class="authorized-entry-name">{{ entry.name }}</span>
    </button>
    <button
      v-else
      type="button"
      class="authorized-file-btn"
      :style="{ paddingLeft: indent }"
      :title="entry.path"
      @click="emit('open', { path: entry.path, name: entry.name })"
    >
      {{ entry.name }}
    </button>

    <template v-if="entry.isDir && open">
      <p v-if="loading" class="authorized-status">{{ t('files.dirLoading') }}</p>
      <p v-else-if="error" class="authorized-error">{{ error }}</p>
      <template v-else-if="children.length">
        <AuthorizedEntry
          v-for="child in children"
          :key="child.path"
          :entry="child"
          :depth="depth + 1"
          @open="emit('open', $event)"
        />
      </template>
      <p v-else class="authorized-status">{{ t('files.dirEmpty') }}</p>
    </template>
  </div>
</template>
