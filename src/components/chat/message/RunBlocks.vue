<script setup lang="ts">
// MSG-2998 修②（DEBT-544 目二）：一次运行的「三分离」归组渲染——
// 思考（reasoning）／执行命令（tool.call）／执行结果（tool.result）三类
// 各自独立成区、互不混入（老板口径：思考是思考、命令是命令、结果是结果）。
//
// 数据源＝run.trace 有序事件（568 六型帧谱在案：text/reasoning/tool.call/
// tool.result 俱备）——渲染归组、非协议重造。流式态与终态同构（同组件两态）：
// 流式态思考常显（边想边写可见）、终态思考默认收起（MSG-2413 交互保留）。
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatMessage, RunState, TraceItem } from '../../../models'
import ApprovalStack from './ApprovalStack.vue'

const props = defineProps<{
  run: RunState
  streaming?: boolean
  /** 本 run 的未决审批卡：迁入「执行命令/执行结果」之间的审批卡容器（尾流径） */
  pendingApprovals?: ChatMessage[]
}>()
const { t } = useI18n()

const reasoning = computed(() => props.run.reasoning)

// 思考区折叠头：结构化 reasoning-head（⋯ dots + 标题 + ▾/▸）。
// 折叠默认值随态切换：思考过程中（streaming，边想边写）默认**展开**；
// 思考完毕（终态，MessageItem/AssistantMessage 径）默认**折叠**。
// 用户点击后锁定用户选择（userToggledThinking），不再跟随默认值翻转。
const thinkingOpen = ref(props.streaming === true)
const userToggledThinking = ref(false)

function toggleThinking() {
  userToggledThinking.value = true
  thinkingOpen.value = !thinkingOpen.value
}

// 流式 reasoning 局部贴底：reasoning-body 是 max-height 220px 的滚动区，
// reasoning 随帧增长（内容变高）时保持滚动到底部——最新增量追加在末尾，
// 不贴底用户只能看到开头一段。nextTick 等 DOM 排版完再量高。
const thinkingBodyRef = ref<HTMLElement | null>(null)

async function pinThinkingBottom() {
  await nextTick()
  const el = thinkingBodyRef.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  () => reasoning.value.length,
  (len, prev) => {
    // 内容变高（新增量）且展开态才贴底；折叠态不看正文，无需滚动
    if (thinkingOpen.value && len > prev) void pinThinkingBottom()
  },
)

watch(
  thinkingOpen,
  (open) => {
    // 折叠→展开：贴底看最新思考增量（与终态展开口径一致）
    if (open) void pinThinkingBottom()
  },
  { flush: 'post' },
)

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

/** R1-9b ②：动作步骤条——工具链动作常显（长任务不焦虑）；已完成✓、进行中⋯ */
const steps = computed(() => {
  const calls = props.run.trace.filter((item) => item.kind === 'tool.call')
  const running = props.run.status === 'running'
  return calls.map((item, i) => ({
    toolName: item.toolName ?? '',
    done: !running || i < calls.length - 1,
  }))
})

/** R1-9b ③：证据摘要——验证结果通过/失败计数（默认折叠，标题只露摘要） */
const resultPassed = computed(() =>
  props.run.trace.filter((item) => item.kind === 'tool.result' && item.success === true).length,
)
const resultFailed = computed(() =>
  props.run.trace.filter((item) => item.kind === 'tool.result' && item.success === false).length,
)

// MSG-3001 ⑤（解双渲重）：命令/结果区默认收起——同一 trace 数据在消息流
// 已有 ToolRow 条目承载（pre-change 有折叠门闸，always-on 重复为新）；
// 点击展开 run 级总览（按需现形，勿与条目面并陈）。
const commandsOpen = ref(false)
const resultsOpen = ref(false)

// 思考对话过程中的审批卡容器折叠态：仿 commands/results 结构（block-head +
// icon + title + count + toggle），但**默认展开**——审批是活性决策点（agent 卡
// 在审批等用户动作），收起会埋没入口；commands/results 是历史总览（看完不需
// 操作）——本质差异。视觉同源、操作同型。
const approvalsOpen = ref(true)

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
    <!-- 区一：思考（reasoning）——结构化头部（reasoning-head：⋯ + 深度思考 + ▾/▸）：
         思考过程中（streaming）默认展开（边想边写可见）＋dots 呼吸动画；
         思考完毕（终态）默认折叠，头部显示「已完成」。内容区超 220px 局部滚动，
         流式增长/展开由 pinThinkingBottom 保持贴底 -->
    <template v-if="reasoning">
      <section
        class="run-block thinking reasoning-block"
        :class="{ 'reasoning-stream': streaming }"
      >
        <button
          type="button"
          class="reasoning-head"
          :class="{ open: thinkingOpen }"
          @click="toggleThinking"
        >
          <span class="reasoning-dots" :class="{ live: streaming }">⋯</span>
          <span class="reasoning-title">{{ t('chat.deepThink') }}</span>
          <span v-if="!streaming" class="reasoning-done">{{ t('chat.thoughtDone') }}</span>
          <span class="reasoning-toggle">{{ thinkingOpen ? '▾' : '▸' }}</span>
        </button>
        <div
          v-show="thinkingOpen"
          ref="thinkingBodyRef"
          class="reasoning-body"
          :class="{ 'reasoning-stream-body': streaming }"
        >{{ reasoning }}</div>
      </section>
    </template>

    <!-- R1-9b ②：动作步骤条——常显工具链动作（长任务不焦虑），已完成✓／进行中⋯ -->
    <div v-if="steps.length" class="run-steps" aria-label="run-steps">
      <span
        v-for="(s, i) in steps"
        :key="i"
        class="step"
        :class="{ done: s.done, active: !s.done }"
      >
        <span class="step-mark">{{ s.done ? '✓' : '⋯' }}</span>
        <span class="step-name">{{ s.toolName }}</span>
      </span>
    </div>

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

    <!-- 未决审批卡容器：本 run 待审批的权限卡，以卡片列表呈现
         （编号选项 1 允许 / 2 本会话始终允许 / 3 拒绝，直点决策）——
         位置在执行命令与执行结果之间（审批是对「命令」的把关，先于结果）——
         头部仿 blockCommands 容器：icon「?」（待决）+ 标题「待审批」+ 计数 + ▾/▸。
         默认**展开**（审批是活性决策点，收起用户看不见入口）。 -->
    <section v-if="pendingApprovals?.length" class="run-block pendingApprovals-container">
      <button
        type="button"
        class="block-head"
        :class="{ open: approvalsOpen }"
        @click="approvalsOpen = !approvalsOpen"
      >
        <span class="block-icon">?</span>
        <!-- TODO(i18n)：暂硬编码——zh-CN/en-US 已抵 599 黄栅（LOC gate 红证防「把闸调松」），
             加 i18n key 会撞闸；与 commands/results 不同键（`blockCommands`／`blockResults`）
             是早期入场时才进的基线，此处后入只能硬编码。后续若 locales 拆分或阈值调整再补 t()。 -->
        <span class="block-title">待审批</span>
        <span class="block-count">×{{ pendingApprovals.length }}</span>
        <span class="block-toggle">{{ approvalsOpen ? '▾' : '▸' }}</span>
      </button>
      <div v-show="approvalsOpen" class="approvals-body">
        <ApprovalStack
          v-if="pendingApprovals?.length"
          :messages="pendingApprovals"
        />
      </div>
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
        <span class="block-count ok">{{ resultPassed }}✓</span>
        <span v-if="resultFailed" class="block-count failed">{{ resultFailed }}✗</span>
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
