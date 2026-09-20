<script setup lang="ts">
// 轨迹面板：整体思考摘要 + 逐条 trace（工具调用 / 工具结果 / 思考）。
// 开合由调用方（assistant 头部耗时按钮）控制——本组件只负责渲染展开后的内容。
import { useI18n } from 'vue-i18n'
import type { RunState } from '../../../models'

defineProps<{ run: RunState }>()

const { t } = useI18n()
</script>

<template>
  <div class="trace-panel">
    <div v-if="run.reasoning" class="trace-reasoning">
      <span>{{ t('chat.thinking') }}</span>
      {{ run.reasoning }}
    </div>
    <div v-for="(item, i) in run.trace" :key="i" class="trace-item" :class="item.kind">
      <template v-if="item.kind === 'tool.call'">
        {{ t('chat.toolCall') }} {{ item.toolName }}
        <span v-if="item.argsPreview" class="trace-args">{{ item.argsPreview }}</span>
      </template>
      <template v-else-if="item.kind === 'tool.result'">
        {{ t('chat.toolResult') }} {{ item.preview }}
      </template>
      <template v-else>{{ t('chat.thinking') }}</template>
    </div>
  </div>
</template>
