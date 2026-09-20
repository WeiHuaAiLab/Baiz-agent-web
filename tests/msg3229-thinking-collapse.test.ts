// MSG-3229（施工11号组）红证：思考过程＝**默认折叠的实时流**，点右侧三角展开。
//
// 老板原话（2026-09-20 23:0x）：思考过程要一直流式跑（不用展开也能看出在跑），
// 跑完即止；要看详细就点右边三角展开。
//
// 改前红（现状＝MSG-2661 口径）：流式期思考区**常显**（`.reasoning-stream-body`
// 直接铺全文），只有终态才折叠 ⇒ 流式期占满屏、且"跑没跑完"看不出。
// 改后绿：流式/终态**同一折叠块**——默认折叠，标题行实时（字数＋秒级计时＋跑动指示），
// 回合结束切终态（去指示、停表），点标题（热区 ≥44）展开全文、再点收起。
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
import RunBlocks from '../src/components/chat/RunBlocks.vue'
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

describe('MSG-3229 思考区：默认折叠的实时流', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useRealTimers()
  })

  it('T1 流式增量 ⇒ 标题实时更新字数，且**块保持折叠**（不自动展开）', async () => {
    const run = reactive(makeRun())
    const wrapper = mountBlocks(run, true)

    // 思考未起（零 reasoning）⇒ 不显空块（勿造"假思考中"噪音）
    expect(wrapper.find('.reasoning-head').exists()).toBe(false)

    run.reasoning = '第一步先分析'
    await wrapper.vm.$nextTick()
    // 首个增量后：一行（跑动指示＋思考标签＋**跑马灯吐字**＋三角），正文**不现**
    //（MSG-3248 改口径：该行显示增量文本，不再显示"字数/秒数"）
    expect(wrapper.find('.reasoning-head').exists()).toBe(true)
    expect(wrapper.find('.reasoning-body').exists()).toBe(false)
    expect(wrapper.find('.reasoning-toggle').text()).toBe('▸')
    expect(wrapper.find('.reasoning-head').text()).toContain('深度思考')
    expect(wrapper.find('[data-uia="reasoning-marquee"]').text()).toContain('第一步先分析')

    run.reasoning += '，再设计方案'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-uia="reasoning-marquee"]').text()).toContain('再设计方案')
    expect(wrapper.find('.reasoning-body').exists()).toBe(false)
  })

  it('T2 回合结束 ⇒ 标题切终态、去跑动指示、停表（跑完即止）', async () => {
    vi.useFakeTimers()
    const run = reactive(makeRun({ startedAt: Date.now() - 5000, reasoning: '想完了' }))
    const wrapper = mountBlocks(run, true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-dots.live').exists()).toBe(true)
    expect(wrapper.find('.reasoning-head').text()).toContain('深度思考')

    // 回合收口：done/settle 面 ⇒ streaming 落 false
    await wrapper.setProps({ streaming: false })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-dots.live').exists()).toBe(false)
    expect(wrapper.find('.reasoning-head').text()).toContain('深度思考')
    expect(wrapper.find('.reasoning-head').text()).toContain('已完成')
    // MSG-3248：终态**定格最后一段文字**（不再有字数/计时数字）
    expect(wrapper.find('[data-uia="reasoning-marquee"]').text()).toContain('想完了')

    // 停表：时间再走 5s，终态标题逐字不变
    const frozen = wrapper.find('.reasoning-head').text()
    vi.advanceTimersByTime(5000)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-head').text()).toBe(frozen)
    vi.useRealTimers()
  })

  it('T3 点标题展开全文／再点收起；三角随态；**message.text 逐字不变**', async () => {
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
    expect(wrapper.find('.reasoning-body').exists()).toBe(false)
    expect(wrapper.find('.reasoning-toggle').text()).toBe('▸')

    await wrapper.find('.reasoning-head').trigger('click')
    expect(wrapper.find('.reasoning-body').text()).toBe('内部推演：先 A 后 B，逐条核对')
    expect(wrapper.find('.reasoning-toggle').text()).toBe('▾')
    expect(message.text).toBe(before)

    await wrapper.find('.reasoning-head').trigger('click')
    expect(wrapper.find('.reasoning-body').exists()).toBe(false)
    expect(wrapper.find('.reasoning-toggle').text()).toBe('▸')
    expect(message.text).toBe(before)
  })

  it('T4 真链路（ChatView）：reasoning＋token 帧 ⇒ 落库正文只含 token；展开/收起后逐字不变', async () => {
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
    // 流式期：思考区折叠（标题在、正文不现）
    expect(wrapper.find('.streaming-tail .reasoning-head').exists()).toBe(true)
    expect(wrapper.find('.streaming-tail .reasoning-body').exists()).toBe(false)

    routeFrame({ event: 'done', data: { task_id: 'cv-1' } }, messages, approvals)
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 180))
    await wrapper.vm.$nextTick()

    const assistant = messages.list('c-cv').find((item) => item.kind === 'assistant')
    expect(assistant?.text).toBe('答案在正文')
    const persisted = assistant?.text

    await wrapper.find('.reasoning-head').trigger('click')
    expect(wrapper.find('.reasoning-body').text()).toContain('先想一下')
    expect(messages.list('c-cv').find((item) => item.kind === 'assistant')?.text).toBe(persisted)
    await wrapper.find('.reasoning-head').trigger('click')
    expect(messages.list('c-cv').find((item) => item.kind === 'assistant')?.text).toBe(persisted)
  })

  it('T5 热区 ≥44（机械判据：样式表内 .reasoning-head 声明 min-height:44px）', () => {
    const css = readFileSync('src/styles/chat.css', 'utf8')
    const block = /\.reasoning-head\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(block).toContain('min-height: 44px')
  })
})
