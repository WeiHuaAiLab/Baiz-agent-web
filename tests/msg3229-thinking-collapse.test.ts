// MSG-3229（改版 2026-09-27）：思考区**无头部、内容默认展开常显**。
// 原口径（默认折叠＋点三角展开/收起）已废弃：reasoning-head 与折叠交互一并移除，
// .reasoning-body 常驻直显全文，超 220px 局部滚动、流式增长贴底。
// 本文件保留真链路（ChatView/routeFrame）回归与机械判据面。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import ChatView from '../src/components/ChatView.vue'
import MessageItem from '../src/components/chat/MessageItem.vue'
// MSG-3335 G-4：RunBlocks 按上游结构迁至 chat/message/（测试随迁改 import）
import RunBlocks from '../src/components/chat/message/RunBlocks.vue'
import { router } from '../src/router'
import type { RunState } from '../src/models'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function makeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    taskId: 'r-1',
    conversationId: 'c-1',
    status: 'running',
    startedAt: Date.now() - 3000,
    reasoning: '',
    text: '',
    trace: [],
    ...overrides,
  }
}

const mountBlocks = (run: RunState, streaming: boolean) =>
  mount(RunBlocks, { props: { run, streaming }, global: { plugins: [i18n] } })

describe('MSG-3229 思考区：无头常显（内容默认展开）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useRealTimers()
  })

  it('T1 流式增量 ⇒ 内容区全文实时更新（无头、恒展开）', async () => {
    const run = reactive(makeRun())
    const wrapper = mountBlocks(run, true)

    // 思考未起（零 reasoning）⇒ 不显空块（勿造"假思考中"噪音）
    expect(wrapper.find('.reasoning-block').exists()).toBe(false)

    run.reasoning = '第一步先分析'
    await wrapper.vm.$nextTick()
    // 首个增量后：无头部行，内容区直显全文
    expect(wrapper.find('.reasoning-head').exists()).toBe(false)
    expect(wrapper.find('.reasoning-body').exists()).toBe(true)
    expect(wrapper.find('.reasoning-body').text()).toBe('第一步先分析')

    run.reasoning += '，再设计方案'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-body').text()).toBe('第一步先分析，再设计方案')
  })

  it('T2 回合结束 ⇒ 内容区文本定格保留（无头部终态切换面）', async () => {
    const run = reactive(makeRun({ startedAt: Date.now() - 5000, reasoning: '想完了' }))
    const wrapper = mountBlocks(run, true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-body').text()).toBe('想完了')

    // 回合收口：done/settle 面 ⇒ streaming 落 false
    await wrapper.setProps({ streaming: false })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-body').text()).toBe('想完了')
    expect(wrapper.find('.reasoning-head').exists()).toBe(false)
  })

  it('T3 终态 MessageItem：内容区默认展开显示全文；message.text 逐字不变', () => {
    const run = makeRun({
      reasoning: '内部推演：先 A 后 B，逐条核对',
      text: '给你的正文',
      status: 'completed',
      elapsedMs: 3200,
    })
    const message = {
      id: 'm-1',
      conversationId: 'c-1',
      kind: 'assistant' as const,
      text: '给你的正文',
      createdAt: 1,
      meta: { taskId: run.taskId },
    }
    const messages = useMessageStore()
    messages.byConversation['c-1'] = [message]
    messages.runs[run.taskId] = run
    const before = message.text

    const wrapper = mount(MessageItem, {
      props: { message },
      global: { plugins: [i18n, router] },
    })
    // 默认非折叠：无头、无三角，body 直接现形全文
    expect(wrapper.find('.reasoning-head').exists()).toBe(false)
    expect(wrapper.find('.reasoning-toggle').exists()).toBe(false)
    expect(wrapper.find('.reasoning-body').text()).toBe('内部推演：先 A 后 B，逐条核对')
    expect(message.text).toBe(before)
  })

  it('T4 真链路（ChatView）：reasoning＋token 帧 ⇒ 落库正文只含 token；思考全文常显', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const session = useSessionStore()
    session.activeId = 'c-cv'
    messages.ensureRun('cv-1', 'c-cv')
    const wrapper = mount(ChatView, { global: { plugins: [i18n, router] } })
    await new Promise((resolve) => setTimeout(resolve, 80))

    routeFrame({ event: 'reasoning', data: { task_id: 'cv-1', reasoning: '先想一下' } }, messages, approvals)
    routeFrame({ event: 'token', data: { task_id: 'cv-1', token: '答案在正文' } }, messages, approvals)
    await wrapper.vm.$nextTick()
    // 流式期：思考区**内容常显**（无头部折叠面）
    expect(wrapper.find('.streaming-tail .reasoning-body').exists()).toBe(true)
    expect(wrapper.find('.streaming-tail .reasoning-body').text()).toContain('先想一下')

    routeFrame({ event: 'done', data: { task_id: 'cv-1' } }, messages, approvals)
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 180))
    await wrapper.vm.$nextTick()

    const assistant = messages.list('c-cv').find((item) => item.kind === 'assistant')
    expect(assistant?.text).toBe('答案在正文')
    const persisted = assistant?.text

    // 终态：思考全文默认展开直显，正文逐字不变
    expect(wrapper.find('.reasoning-body').text()).toContain('先想一下')
    expect(messages.list('c-cv').find((item) => item.kind === 'assistant')?.text).toBe(persisted)
  })

  it('T5 局部滚动机械判据：样式表内 .reasoning-body 声明 max-height:220px＋overflow-y:auto', () => {
    const css = readFileSync('src/styles/chat.css', 'utf8')
    const block = /\.reasoning-body\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(block).toContain('max-height: 220px')
    expect(block).toContain('overflow-y: auto')
  })
})
