<script setup lang="ts">
// Markdown 渲染视图：调用 renderMarkdown 生成 HTML（含代码高亮），并委托处理外链打开与代码复制。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getBridge } from '../../bridge'
import { renderMarkdown } from '../../markdown/renderer'
import 'highlight.js/styles/github.css'

const { t } = useI18n()

const props = defineProps<{ text: string }>()

const root = ref<HTMLElement>()
const html = computed(() => renderMarkdown(props.text))

async function onClick(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a')
  if (anchor) {
    const href = anchor.getAttribute('href')
    if (href) {
      event.preventDefault()
      await getBridge().openExternal.open(href)
    }
    return
  }
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('.code-copy')
  if (!target) return
  const code = decodeURIComponent(target.dataset.code ?? '')
  try {
    await getBridge().clipboard.writeText(code)
    const original = target.textContent
    target.textContent = t('common.copied')
    setTimeout(() => {
      target.textContent = original
    }, 1200)
  } catch {
    /* clipboard unavailable */
  }
}

onMounted(() => {
  root.value?.addEventListener('click', onClick)
})

onUnmounted(() => {
  root.value?.removeEventListener('click', onClick)
})
</script>

<template>
  <div ref="root" class="markdown-body" v-html="html" />
</template>
