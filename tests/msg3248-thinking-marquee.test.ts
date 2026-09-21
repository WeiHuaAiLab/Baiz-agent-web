// MSG-3248 红证：思考折叠行＝**单行跑马灯式吐字**（老板 2026-09-21 01:5x 口径修正）。
// 改前（MSG-3229 口径）：折叠行显示的是「深度思考 已完成 85 字 4 秒 ▸」——**数字在跳，不是文字在流**。
// 改后：该行实时显示 reasoning **增量文本**（尾部窗口＋右对齐裁切 ⇒ 新字右进、旧字左滚出），
// 单行恒高、零动画；回合结束**定格在最后一段文字**（不再显示字数/秒数）。
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createI18n } from 'vue-i18n'
// MSG-3335 G-4：RunBlocks 按上游结构迁至 chat/message/（测试随迁改 import，断言零改）
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

describe('MSG-3248 思考折叠行：单行跑马灯吐字', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('① 增量 ⇒ 行内文本随之更新（含最新字符）且**恒为单行**', async () => {
    const run = reactive(makeRun({ reasoning: '' }))
    const wrapper = mountBlocks(run, true)
    await wrapper.vm.$nextTick()
    // 取舍（照录）：无 reasoning ⇒ **整行隐藏**（令许"隐藏或显示思考中…"，本窗取隐藏，
    // 不留空壳；参 ⑤）
    expect(wrapper.find('.reasoning-head').exists()).toBe(false)

    run.reasoning = '第一步先分析'
    await wrapper.vm.$nextTick()
    const marquee = wrapper.find('[data-uia="reasoning-marquee"]')
    expect(marquee.text()).toContain('第一步先分析')

    run.reasoning += '，再设计方案'
    await wrapper.vm.$nextTick()
    expect(marquee.text()).toContain('再设计方案')

    // 单行断言：文本内无换行符（多行 reasoning 亦压成一行）
    run.reasoning = '第一行\n第二行\n第三行'
    await wrapper.vm.$nextTick()
    expect(marquee.text()).not.toContain('\n')
    expect(marquee.text()).toContain('第三行')
  })

  it('② 滚动方向判据：尾部窗口（新字在右、旧字滚出）＋右对齐左裁切样式', async () => {
    const run = reactive(makeRun({ reasoning: '' }))
    const wrapper = mountBlocks(run, true)
    run.reasoning = 'A'.repeat(200) + '最新字样'
    await wrapper.vm.$nextTick()
    const text = wrapper.find('[data-uia="reasoning-marquee"]').text()
    // 新字在右端（结尾）＋旧字已被裁出窗口（首字不再是首个 'A'）
    expect(text.endsWith('最新字样')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(80)
    expect(text.length).toBeGreaterThan(0)

    // 样式机判：单行 + 右对齐 + 左裁切（等价于"新字右进、旧字左滚出"）
    const css = readFileSync('src/styles/chat.css', 'utf8')
    const rule = /\.reasoning-marquee\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(rule).toContain('white-space: nowrap')
    expect(rule).toContain('overflow: hidden')
    expect(rule).toContain('justify-content: flex-end')
  })

  it('③ 回合结束 ⇒ 定格最后一段文字（停止滚动/去指示），且**不再显示字数/秒数**', async () => {
    const run = reactive(makeRun({ reasoning: '收尾那段话', elapsedMs: 4000 }))
    const wrapper = mountBlocks(run, true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-dots.live').exists()).toBe(true)
    const during = wrapper.find('[data-uia="reasoning-marquee"]').text()
    expect(during).toContain('收尾那段话')

    await wrapper.setProps({ streaming: false })
    await wrapper.vm.$nextTick()
    const head = wrapper.find('.reasoning-head').text()
    expect(wrapper.find('[data-uia="reasoning-marquee"]').text()).toBe(during) // 定格
    expect(wrapper.find('.reasoning-dots.live').exists()).toBe(false) // 指示撤
    expect(head).toContain('已完成')
    expect(head).not.toMatch(/\d+\s*字/) // 老板口径：不要数字滚动
    expect(head).not.toMatch(/\d+\s*秒/)
  })

  it('④ 展开/收起 ⇒ 全文可见且 message.text **逐字不变**', async () => {
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
    await wrapper.find('.reasoning-head').trigger('click')
    expect(wrapper.find('.reasoning-body').text()).toBe('内部推演：先 A 后 B，逐条核对')
    expect(message.text).toBe(before)
    await wrapper.find('.reasoning-head').trigger('click')
    expect(wrapper.find('.reasoning-body').exists()).toBe(false)
    expect(message.text).toBe(before)
  })

  it('⑤ 无 reasoning ⇒ 整行不渲染（不留空壳）；⑥ 行高恒定（min-height:44＋不换行）', async () => {
    const run = reactive(makeRun({ reasoning: '' }))
    const wrapper = mountBlocks(run, true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-head').exists()).toBe(false) // 无思考 ⇒ 无空壳

    run.reasoning = '有思考了'
    await wrapper.vm.$nextTick()
    const head = wrapper.find('.reasoning-head')
    expect(head.exists()).toBe(true)
    const css = readFileSync('src/styles/chat.css', 'utf8')
    const rule = /\.reasoning-head\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(rule).toContain('min-height: 44px')
    expect(rule).not.toContain('wrap')
  })
})
