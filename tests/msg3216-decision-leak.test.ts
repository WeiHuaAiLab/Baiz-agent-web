// MSG-3216 P0（施工11号组）红证：内部过程文本（原始决策 JSON）不得进消息流。
//
// 改前红：token 帧里的决策 JSON 原文直进 run.text → displayItems 投成 assistant
// 正文（真机《截图取证-1.0.18真机-20260920-2015》§二.1 再现）。
// 改后绿：该 JSON 从正文消失，改道受控折叠区（RunState.decision，默认收起）。
//
// 紧致度（对照《闸二铁律 v1.1》新-2）：本组证可拒掉三类"看似合理"的错补丁——
//   ① 见 `{` 即吞（T4 普通 JSON 正文必须照渲）；
//   ② 整轮/整 run 归零（T5 决策 JSON 之前的散文必须留正文）；
//   ③ 只在"整帧即合法 JSON"时剥离（T2/T8 逐片分帧与半截收流必须零残留）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import {
  balancedObjectEnd,
  createDecisionStreamFilter,
  hasDecisionKey,
} from '../src/utils/decisionStream'
import MessageItem from '../src/components/chat/MessageItem.vue'
import { router } from '../src/router'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

// 真机原文（截图取证 201515 逐字形），留作常量：判据不许被"看上去像"的改写绕过
const DECISION_JSON =
  '{"tool_call": {"tool": "read_file", "arguments": {"path": "/mnt/agents/output/监理交接备忘录.md"}},' +
 ' "exec_plan": null, "plan_updates": [], "claims_done": false, "result_text": null}'
const DECISION_KEYS_IN_TEXT = ['tool_call', 'exec_plan', 'claims_done', 'plan_updates']

function slices(text: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

function assertNoDecisionJson(text: string): void {
  for (const key of DECISION_KEYS_IN_TEXT) expect(text).not.toContain(key)
}

describe('MSG-3216 决策 JSON 不进消息流', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('T1 单帧整文决策 JSON ⇒ 流式正文与落定消息两面零该 JSON（改前红）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 'leak-1'
    const conversationId = 'c-leak-1'
    messages.ensureRun(taskId, conversationId)

    routeFrame({ event: 'token', data: { task_id: taskId, token: DECISION_JSON } }, messages, approvals)

    const run = messages.runs[taskId]
    // 流式面（ChatContent .streaming-tail 直渲 run.text）
    assertNoDecisionJson(run?.text ?? '')

    routeFrame({ event: 'done', data: { task_id: taskId } }, messages, approvals)
    const assistant = messages.list(conversationId).find((item) => item.kind === 'assistant')
    expect(assistant).toBeTruthy()
    assertNoDecisionJson(assistant?.text ?? '')
    // 零丢证：整段决策载荷落在受控折叠区（默收起），不得凭空消失
    expect(run?.decision ?? '').toContain('claims_done')
    expect(run?.decision ?? '').toContain('/mnt/agents/output/监理交接备忘录.md')
  })

  it('T2 逐片分帧（7 字一片）⇒ 任一片后正文零残留（拒"整帧才剥离"错补丁）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 'leak-2'
    const conversationId = 'c-leak-2'
    messages.ensureRun(taskId, conversationId)

    for (const piece of slices(DECISION_JSON, 7)) {
      routeFrame({ event: 'token', data: { task_id: taskId, token: piece } }, messages, approvals)
      assertNoDecisionJson(messages.runs[taskId]?.text ?? '')
    }
    routeFrame({ event: 'done', data: { task_id: taskId } }, messages, approvals)
    const assistant = messages.list(conversationId).find((item) => item.kind === 'assistant')
    assertNoDecisionJson(assistant?.text ?? '')
    expect(assistant?.text ?? '').toBe('')
  })

  it('T3 决策 JSON 夹在散文之间 ⇒ 散文留正文、JSON 进折叠区（拒"整 run 归零"错补丁）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 'leak-3'
    const conversationId = 'c-leak-3'
    messages.ensureRun(taskId, conversationId)

    routeFrame(
      { event: 'token', data: { task_id: taskId, token: '我给你读一下这份备忘。\n' } },
      messages,
      approvals,
    )
    for (const piece of slices(DECISION_JSON, 11)) {
      routeFrame({ event: 'token', data: { task_id: taskId, token: piece } }, messages, approvals)
    }
    routeFrame({ event: 'done', data: { task_id: taskId } }, messages, approvals)

    const assistant = messages.list(conversationId).find((item) => item.kind === 'assistant')
    expect(assistant?.text ?? '').toContain('我给你读一下这份备忘。')
    assertNoDecisionJson(assistant?.text ?? '')
  })

  it('T4 正文里的普通 JSON（无决策键）照渲——拒"见 { 即吞"错补丁', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 'leak-4'
    const conversationId = 'c-leak-4'
    messages.ensureRun(taskId, conversationId)

    routeFrame(
      { event: 'token', data: { task_id: taskId, token: '配置示例：{"count":0,"logDir":"logs"}\n' } },
      messages,
      approvals,
    )
    routeFrame({ event: 'done', data: { task_id: taskId } }, messages, approvals)
    const assistant = messages.list(conversationId).find((item) => item.kind === 'assistant')
    expect(assistant?.text ?? '').toContain('{"count":0,"logDir":"logs"}')
  })

  it('T5 收流半截（未闭合决策 JSON）⇒ 落定归折叠区，正文零残留', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 'leak-5'
    const conversationId = 'c-leak-5'
    messages.ensureRun(taskId, conversationId)

    for (const piece of slices(DECISION_JSON.slice(0, 60), 9)) {
      routeFrame({ event: 'token', data: { task_id: taskId, token: piece } }, messages, approvals)
      assertNoDecisionJson(messages.runs[taskId]?.text ?? '')
    }
    routeFrame({ event: 'done', data: { task_id: taskId } }, messages, approvals)
    const assistant = messages.list(conversationId).find((item) => item.kind === 'assistant')
    assertNoDecisionJson(assistant?.text ?? '')
    expect(messages.runs[taskId]?.decision ?? '').toContain('tool_call')
  })

  it('T6 受控折叠区现形：正文零 JSON ＋ 内部块默认收起、点击可见原文', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 'leak-6'
    const conversationId = 'c-leak-6'
    messages.ensureRun(taskId, conversationId)
    routeFrame({ event: 'token', data: { task_id: taskId, token: DECISION_JSON } }, messages, approvals)
    routeFrame({ event: 'done', data: { task_id: taskId } }, messages, approvals)

    const assistant = messages.list(conversationId).find((item) => item.kind === 'assistant')
    const wrapper = mount(MessageItem, {
      props: { message: assistant! },
      global: { plugins: [i18n, router] },
    })
    await wrapper.vm.$nextTick()
    // 正文面：正文区（.markdown-body）不存——零正文；且不显「（无输出）」占位
    const root = wrapper.find('.msg.assistant')
    expect(root.find('.markdown-body').exists()).toBe(false)
    expect(root.find('.no-output').exists()).toBe(false)
    // 折叠区：块在、默认收起、展开见原文
    expect(wrapper.find('.run-block.internal-decision').exists()).toBe(true)
    const folded = wrapper.find('.run-block.internal-decision .internal-body').element as HTMLElement
    expect(folded.style.display).toBe('none')
    await wrapper.find('.run-block.internal-decision .block-head').trigger('click')
    const opened = wrapper.find('.internal-body').element as HTMLElement
    expect(opened.style.display).toBe('')
    expect(wrapper.find('.internal-body').text()).toContain('claims_done')
  })
})

describe('MSG-3216 分流器单元面（机械判据）', () => {
  it('balancedObjectEnd 字符串/转义感知', () => {
    expect(balancedObjectEnd('{"a":"}","b":1}tail')).toBe(14)
    expect(balancedObjectEnd('{"a":"\\"}","b":1}')).toBe(16)
    expect(balancedObjectEnd('{"a":1')).toBe(-1)
    expect(balancedObjectEnd('plain text')).toBe(-1)
  })

  it('hasDecisionKey 只认决策族键，勿误判普通键', () => {
    expect(hasDecisionKey('{"claims_done": true}')).toBe(true)
    expect(hasDecisionKey('{"tool_call": {"tool": "x"}}')).toBe(true)
    expect(hasDecisionKey('{"count": 0, "logDir": "logs"}')).toBe(false)
    expect(hasDecisionKey('{"arguments": {"path": "a"}}')).toBe(false)
  })

  it('未闭合候选超过上限 ⇒ 回落正文（防正文里的 { 卡死流）', () => {
    const filter = createDecisionStreamFilter()
    const big = `{${'x'.repeat(5000)}`
    const out = filter.push(big)
    expect(out.body).toBe(big)
    expect(out.internal).toBe('')
  })
})
