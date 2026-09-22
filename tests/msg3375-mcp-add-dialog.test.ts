// MSG-3375 U-8 复核（ZCode UX 报告 P3-12「MCP『添加 MCP』弹窗·合成点击未能触发·待人工确认」）：
// 本件在 **DOM 层**复现该合成点击，给出"可否触发"的机械判据——
// ① 能触发 ⇒ 报告所述"未能触发"在 DOM 层**不复现**（须真机复核，且注意旧面下
//    MCP 卡位于「能力扩展」页，而 U-4 修复前该页**无页签、难达**——可能是诱因）；
// ② 不能触发 ⇒ 真 bug，须修。
// ⚠ 探针要点（本轮新踩坑）：弹窗在 `<Teleport to="body">` 里（`McpCard.vue:159`）
// ⇒ **必须查 `document.body`**；用 `wrapper.find()` 永远看不见（会被误判成
// "合成点击未能触发"——ZCode P3-12 的观感很可能就来自这一层）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhCN from '../src/locales/zh-CN'
import McpCard from '../src/components/settings/McpCard.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function mountCard() {
  return mount(McpCard, { global: { plugins: [createPinia(), i18n] } })
}

/** Teleport 到 body ⇒ 从 document 查（并给"是否真渲染"的机械判据） */
const modalEl = () => document.body.querySelector('.modal-create-mcp') as HTMLElement | null

describe('MSG-3375 U-8 MCP「添加 MCP」弹窗（P3-12 复核）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    document.body.innerHTML = ''
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('① 点「添加 MCP」⇒ 弹窗可达（role=dialog ＋ .modal-create-mcp）', async () => {
    const wrapper = mountCard()
    await flushPromises()

    const btn = wrapper
      .findAll('button')
      .find((b) => b.text().includes(zhCN.settings.mcp.add))
    expect(btn, '「添加 MCP」按钮应存在').toBeTruthy()

    await btn!.trigger('click')
    await flushPromises()

    expect(modalEl(), '弹窗节点（Teleport→body）').toBeTruthy()
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy()
  })

  it('② 弹窗标题＝「添加 MCP」（mode=add 分支）', async () => {
    const wrapper = mountCard()
    await flushPromises()
    const btn = wrapper.findAll('button').find((b) => b.text().includes(zhCN.settings.mcp.add))
    await btn!.trigger('click')
    await flushPromises()
    expect(modalEl()!.textContent ?? '').toContain(zhCN.settings.mcp.addTitle)
  })

  it('③ 关闭后弹窗消失（再点仍可开——非一次性死锁）', async () => {
    const wrapper = mountCard()
    await flushPromises()
    const btn = () => wrapper.findAll('button').find((b) => b.text().includes(zhCN.settings.mcp.add))
    await btn()!.trigger('click')
    await flushPromises()
    expect(modalEl()).toBeTruthy()

    const close = document.body.querySelector('.modal-close') as HTMLElement | null
    expect(close, '关闭钮应存在').toBeTruthy()
    close!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(modalEl()).toBeFalsy()
    await btn()!.trigger('click')
    await flushPromises()
    expect(modalEl(), '关后可再开（非一次性死锁）').toBeTruthy()
  })
})
