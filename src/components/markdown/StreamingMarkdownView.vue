<script setup lang="ts">
// 流式 Markdown 视图：增量渲染 + 表格 holdback + 代码围栏（件 1）
import { computed, onBeforeUnmount, watch } from 'vue'
import { StreamingMarkdown } from '../../markdown/streaming'

const props = defineProps<{ text: string }>()

const engine = new StreamingMarkdown()
watch(
  () => props.text,
  (value) => engine.push(value),
  { immediate: true },
)

const html = computed(() => engine.html())

// 流结束（done）后由父组件切到普通 MarkdownView 时不再增量——这里只服务 streaming-tail
onBeforeUnmount(() => engine.reset())
</script>

<template>
  <div class="markdown-body streaming-markdown" v-html="html" />
</template>
