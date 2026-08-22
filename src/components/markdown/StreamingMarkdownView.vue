<script setup lang="ts">
// 流式 Markdown 视图：增量渲染 + 表格 holdback + 代码围栏（件 1）
import { onBeforeUnmount, ref, watch } from 'vue'
import { StreamingMarkdown } from '../../markdown/streaming'

const props = defineProps<{ text: string }>()

const engine = new StreamingMarkdown()
// P1 修锉（MSG-1430，T 章红证）：原 computed(() => engine.html()) 零响应式
// 依赖（engine 系普通类字段，pending/lineBuf/stableHtml 皆非响应式），
// watch 推入后 computed 永不失效→视图冻结首帧（五阶段 DOM 去重=1 实测）。
// 改 watch 内直写 ref：push 后同帧写 html，视图必更新；reset 语义不变。
const html = ref('')
watch(
  () => props.text,
  (value) => {
    engine.push(value)
    html.value = engine.html()
  },
  { immediate: true },
)

// 流结束（done）后由父组件切到普通 MarkdownView 时不再增量——这里只服务 streaming-tail
onBeforeUnmount(() => engine.reset())
</script>

<template>
  <div class="markdown-body streaming-markdown" v-html="html" />
</template>
