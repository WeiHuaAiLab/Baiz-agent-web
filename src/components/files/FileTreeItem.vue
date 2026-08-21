<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TreeNode } from '../../utils/tree'
import { diffStats } from '../../utils/diff'
import Icon from '../common/Icon.vue'

const props = defineProps<{ node: TreeNode; depth: number }>()
const emit = defineEmits<{ select: [path: string] }>()
const open = ref(false)

const fileStats = computed(() => {
  const file = props.node.file
  if (!file) return null
  const stats = diffStats(file.original, file.current)
  return stats.added + stats.removed > 0 ? stats : null
})
</script>

<template>
  <div>
    <div
      v-if="props.node.type === 'dir'"
      class="tree-dir"
      :style="{ paddingLeft: props.depth * 14 + 8 + 'px' }"
      @click="open = !open"
    >
      <Icon name="chevron" :size="12" :class="{ open }" />
      <span>{{ props.node.name }}</span>
    </div>
    <template v-if="props.node.type === 'dir' && open">
      <FileTreeItem
        v-for="child in props.node.children"
        :key="child.path"
        :node="child"
        :depth="props.depth + 1"
        @select="emit('select', $event)"
      />
    </template>
    <div
      v-else-if="props.node.type === 'file'"
      class="tree-file"
      :style="{ paddingLeft: props.depth * 14 + 8 + 'px' }"
      @click="emit('select', props.node.path)"
    >
      <span class="tree-file-name">{{ props.node.name }}</span>
      <span v-if="fileStats" class="tree-file-stats">
        +{{ fileStats.added }} −{{ fileStats.removed }}
      </span>
      <span v-if="!props.node.file?.viewed" class="tree-dot" />
    </div>
  </div>
</template>
