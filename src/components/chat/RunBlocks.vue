<script setup lang="ts">
// MSG-2998 修②（DEBT-544 目二）：一次运行的「三分离」归组渲染——
// 思考（reasoning）／执行命令（tool.call）／执行结果（tool.result）三类
// 各自独立成区、互不混入（老板口径：思考是思考、命令是命令、结果是结果）。
//
// 数据源＝run.trace 有序事件（568 六型帧谱在案：text/reasoning/tool.call/
// tool.result 俱备）——渲染归组、非协议重造。流式态与终态同构（同组件两态）：
// 流式态思考常显（边想边写可见）、终态思考默认收起（MSG-2413 交互保留）。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RunState, TraceItem } from '../../models'

const props = defineProps<{ run: RunState; streaming?: boolean }>()
const { t } = useI18n()

const reasoning = computed(() => props.run.reasoning)

// MSG-3229（折叠单行）＋**MSG-3248（老板 2026-09-21 01:5x 口径修正）**：
// 思考区＝**默认折叠的实时流**，且折叠行＝**跑马灯式"吐字"**——
// ① 折叠态固定单行（nowrap＋overflow:hidden，行高恒定，不换行不撑高）；
// ② ★ 该行实时显示 reasoning **增量文本**：新字从**右端**出现、旧字向左**滚出**
//    （机制＝尾部窗口截取＋右对齐裁切；令明许"文本尾部截取"为等价判据）；
// ③ 流式期随帧更新（Vue 渲染调度天然按微任务/帧合并 ⇒ 无额外抖动；单行零重排）；
// ④ 回合结束（streaming 落 false）⇒ **定格在最后一段文字**（停滚、去跑动指示）；
//    **不再显示字数/秒数**（老板原话："不是几个数字在滚动"；耗时另有消息头 `.elapsed` 承载）；
// ⑤ 整行（热区 ≥44）可点：展开看全文、再点收起，三角随态（▸／▾）；正文 message.text 零改；
// ⑥ 无 reasoning ⇒ 整块不渲染（不留空壳）；
// ⑦ 本机制**零动画**（纯文本位移）⇒ 天然满足 prefers-reduced-motion（"不滚动·只更新文字"）。
const thinkingOpen = ref(false)
/** 跑马灯窗口：尾部保留字符数（超出即从左侧滚出）——细调只影响观感，不影响判据 */
const MARQUEE_WINDOW = 80
/**
 * 单行跑马灯文本＝reasoning 的**尾部窗口**（换行折叠为空格 ⇒ 恒为一行）。
 * 新字从右端进（`endsWith` 最新增量）、旧字向左滚出（超出窗口即被裁掉）。
 */
const marqueeText = computed(() => {
  const flat = reasoning.value.replace(/\s+/g, ' ').trim()
  if (!flat) return props.streaming ? t('chat.thinkingLive') : ''
  return flat.length > MARQUEE_WINDOW ? flat.slice(-MARQUEE_WINDOW) : flat
})

/** MSG-3216：内部决策载荷（决策 JSON）——受控折叠区，默认收起，勿与正文混流 */
const decision = computed(() => props.run.decision ?? '')
const decisionOpen = ref(false)
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
    <!-- 区一：思考（reasoning）——MSG-3229：**默认折叠的实时流**（流式/终态同一块）
         标题行：跑动指示（流式）＋思考中…／深度思考 已完成＋实时字数＋秒级计时＋右侧三角 -->
    <template v-if="reasoning">
      <section
        class="run-block thinking reasoning-block"
        :class="{ 'reasoning-stream': streaming }"
      >
        <button
          type="button"
          class="reasoning-head"
          :class="{ open: thinkingOpen, live: streaming }"
          :aria-expanded="thinkingOpen"
          :title="t('chat.reasoningLabel')"
          @click="thinkingOpen = !thinkingOpen"
        >
          <span v-if="streaming" class="reasoning-dots live" aria-hidden="true">⋯</span>
          <span class="reasoning-title">
            {{ t('chat.deepThink') }}
          </span>
          <!-- MSG-3248 ★：单行跑马灯吐字——新字右端进、旧字向左滚出（尾部窗口＋右对齐裁切） -->
          <span class="reasoning-marquee" data-uia="reasoning-marquee">
            <span class="reasoning-marquee-text">{{ marqueeText }}</span>
          </span>
          <span v-if="!streaming" class="reasoning-done">{{ t('chat.thoughtDone') }}</span>
          <span class="reasoning-toggle">{{ thinkingOpen ? '▾' : '▸' }}</span>
        </button>
        <div
          v-if="thinkingOpen"
          class="reasoning-body"
          :class="{ 'reasoning-stream-body': streaming }"
        >{{ reasoning }}</div>
      </section>
    </template>

    <!-- 区二：执行命令（tool.call）——默认收起（解双渲重），点击展开总览 -->
    <!-- MSG-3216 P0：内部过程（决策载荷）——受控折叠区，与正文严格分流。
         此处承载原被灌进消息正文的决策 JSON 原文（零丢证），默认收起。 -->
    <section v-if="decision" class="run-block internal-decision">
      <button
        type="button"
        class="block-head"
        :class="{ open: decisionOpen }"
        @click="decisionOpen = !decisionOpen"
      >
        <span class="block-title">{{ t('chat.blockInternal') }}</span>
        <span class="block-toggle">{{ decisionOpen ? '-' : '+' }}</span>
      </button>
      <pre v-show="decisionOpen" class="reasoning-body internal-body">{{ decision }}</pre>
    </section>

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
