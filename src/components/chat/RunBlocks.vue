<script setup lang="ts">
// MSG-2998 修②（DEBT-544 目二）：一次运行的「三分离」归组渲染——
// 思考（reasoning）／执行命令（tool.call）／执行结果（tool.result）三类
// 各自独立成区、互不混入（老板口径：思考是思考、命令是命令、结果是结果）。
//
// 数据源＝run.trace 有序事件（568 六型帧谱在案：text/reasoning/tool.call/
// tool.result 俱备）——渲染归组、非协议重造。流式态与终态同构（同组件两态）：
// 流式态思考常显（边想边写可见）、终态思考默认收起（MSG-2413 交互保留）。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RunState, TraceItem } from '../../models'

const props = defineProps<{ run: RunState; streaming?: boolean }>()
const { t } = useI18n()

// 终态思考默认收起；流式态常显（流式期间用户要看到思考实时累积）
const thinkingOpen = ref(!!props.streaming)
watch(
  () => props.streaming,
  (isStreaming) => {
    if (isStreaming) thinkingOpen.value = true
  },
)

const reasoning = computed(() => props.run.reasoning)
/** 执行命令区：tool.call 事件序列（按发生序） */
const calls = computed<TraceItem[]>(() =>
  props.run.trace.filter((item) => item.kind === 'tool.call'),
)
/** 执行结果区：tool.result 事件序列（按发生序） */
const results = computed<TraceItem[]>(() =>
  props.run.trace.filter((item) => item.kind === 'tool.result'),
)

// MSG-3001 ⑤（解双渲重）：命令/结果区默认收起——同一 trace 数据在消息流
// 已有 ToolRow 条目承载（pre-change 有折叠门闸，always-on 重复为新）；
// 点击展开 run 级总览（按需现形，勿与条目面并陈）。
const commandsOpen = ref(false)
const resultsOpen = ref(false)

/** MSG-3001 ⑪：结果行按 callId 归属工具名——并行/乱序回包不误配
 *  （勿按 filter 序错配） */
function toolNameOf(callId?: string): string {
  if (!callId) return ''
  return (
    props.run.trace.find((item) => item.kind === 'tool.call' && item.callId === callId)
      ?.toolName ?? ''
  )
}
</script>

<template>
  <div class="run-blocks">
    <!-- 区一：思考（reasoning） -->
    <template v-if="reasoning">
      <!-- 流式态：常显（原 MSG-2661 reasoning-stream 面） -->
      <section v-if="streaming" class="run-block thinking reasoning-stream">
        <div class="reasoning-stream-head">⋯ {{ t('chat.reasoningLabel') }}</div>
        <pre class="reasoning-stream-body">{{ reasoning }}</pre>
      </section>
      <!-- 终态：折叠块（原 MSG-2413 交互——默认收起→点击展开） -->
      <section v-else class="run-block thinking reasoning-block">
        <button
          type="button"
          class="reasoning-head"
          :class="{ open: thinkingOpen }"
          @click="thinkingOpen = !thinkingOpen"
        >
          <span class="reasoning-dots">⋯</span>
          <span>{{ t('chat.deepThink') }}</span>
          <span class="reasoning-toggle">{{ thinkingOpen ? '▾' : '▸' }}</span>
        </button>
        <div v-if="thinkingOpen" class="reasoning-body">{{ reasoning }}</div>
      </section>
    </template>

    <!-- 区二：执行命令（tool.call）——默认收起（解双渲重），点击展开总览 -->
    <section v-if="calls.length" class="run-block commands">
      <button
        type="button"
        class="block-head"
        :class="{ open: commandsOpen }"
        @click="commandsOpen = !commandsOpen"
      >
        <span class="block-icon">⌘</span>
        <span class="block-title">{{ t('chat.blockCommands') }}</span>
        <span class="block-count">×{{ calls.length }}</span>
        <span class="block-toggle">{{ commandsOpen ? '▾' : '▸' }}</span>
      </button>
      <ul v-show="commandsOpen" class="block-list">
        <li v-for="(item, i) in calls" :key="item.callId ?? i" class="cmd-item">
          <span class="cmd-tool">{{ item.toolName }}</span>
          <span v-if="item.argsPreview" class="cmd-args">{{ item.argsPreview }}</span>
        </li>
      </ul>
    </section>

    <!-- 区三：执行结果（tool.result）——默认收起（解双渲重），点击展开总览 -->
    <section v-if="results.length" class="run-block results">
      <button
        type="button"
        class="block-head"
        :class="{ open: resultsOpen }"
        @click="resultsOpen = !resultsOpen"
      >
        <span class="block-icon">▤</span>
        <span class="block-title">{{ t('chat.blockResults') }}</span>
        <span class="block-count">×{{ results.length }}</span>
        <span class="block-toggle">{{ resultsOpen ? '▾' : '▸' }}</span>
      </button>
      <ul v-show="resultsOpen" class="block-list">
        <li
          v-for="(item, i) in results"
          :key="item.callId ?? i"
          class="result-item"
          :class="{ ok: item.success === true, failed: item.success === false }"
        >
          <span class="result-flag">{{ item.success === false ? '✗' : '✓' }}</span>
          <span v-if="toolNameOf(item.callId)" class="result-tool">{{
            toolNameOf(item.callId)
          }}</span>
          <span class="result-preview">{{ item.preview }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
