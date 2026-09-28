// MSG-3248 改版红证：思考区**无头部行、内容常显**（2026-09-27 口径）。
// 原单行跑马灯折叠行（data-uia="reasoning-marquee"）已随头部一并移除：
// 思考内容区（.reasoning-body）默认展开、全文直显，超 220px 局部滚动，
// 流式增长由组件保持贴底（jsdom 无真实布局，贴底行为不做 DOM 断言）。
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createI18n } from 'vue-i18n'
// MSG-3335 G-4：RunBlocks 按上游结构迁至 chat/message/（测试随迁改 import）
import RunBlocks from '../src/components/chat/message/RunBlocks.vue'
import MessageItem from '../src/components/chat/MessageItem.vue'
import { useMessageStore } from '../src/stores/message'
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
    startedAt: Date.now() - 4000,
    reasoning: '',
    text: '',
    trace: [],
    ...overrides,
  }
}

const mountBlocks = (run: RunState, streaming: boolean) =>
  mount(RunBlocks, { props: { run, streaming }, global: { plugins: [i18n] } })

describe('MSG-3248 思考区：无头常显（原跑马灯折叠行已移除）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('① 增量 ⇒ 内容区全文实时更新（无头、无跑马灯窗口截取）', async () => {
    const run = reactive(makeRun({ reasoning: '' }))
    const wrapper = mountBlocks(run, true)
    await wrapper.vm.$nextTick()
    // 无 reasoning ⇒ 整块不渲染（不留空壳）
    expect(wrapper.find('.reasoning-block').exists()).toBe(false)

    run.reasoning = '第一步先分析'
    await wrapper.vm.$nextTick()
    // 有思考 ⇒ 块现形：**无头部行**，内容区直显全文
    expect(wrapper.find('.reasoning-head').exists()).toBe(false)
    expect(wrapper.find('[data-uia="reasoning-marquee"]').exists()).toBe(false)
    expect(wrapper.find('.reasoning-body').text()).toBe('第一步先分析')

    run.reasoning += '，再设计方案'
    await wrapper.vm.$nextTick()
    // 全文直显（非尾部窗口）：开头与结尾俱在
    const body = wrapper.find('.reasoning-body').text()
    expect(body.startsWith('第一步先分析')).toBe(true)
    expect(body).toContain('再设计方案')

    // 多行原文保留换行（不再压成单行）
    run.reasoning = '第一行\n第二行\n第三行'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-body').text()).toContain('\n')
  })

  it('② 回合结束 ⇒ 内容区文本定格保留（不再有头部终态切换面）', async () => {
    const run = reactive(makeRun({ reasoning: '收尾那段话', elapsedMs: 4000 }))
    const wrapper = mountBlocks(run, true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-body').text()).toContain('收尾那段话')

    await wrapper.setProps({ streaming: false })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-body').text()).toBe('收尾那段话')
    // 无头 ⇒ 无字数/秒数展示面（原"不要数字滚动"口径的机械延伸）
    expect(wrapper.find('.reasoning-head').exists()).toBe(false)
  })

  it('③ 终态 MessageItem：内容区默认展开（非折叠）且 message.text 逐字不变', () => {
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

  it('④ 局部滚动机械判据：.reasoning-body 上限 220px（超限滚动，贴底由组件承担）', () => {
    const css = readFileSync('src/styles/chat.css', 'utf8')
    const rule = /\.reasoning-body\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(rule).toContain('max-height: 220px')
    expect(rule).toContain('overflow-y: auto')
  })

  it('⑤ 无 reasoning ⇒ 整块不渲染（不留空壳）', async () => {
    const run = reactive(makeRun({ reasoning: '' }))
    const wrapper = mountBlocks(run, true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-block').exists()).toBe(false)
    expect(wrapper.find('.reasoning-body').exists()).toBe(false)
  })
})
