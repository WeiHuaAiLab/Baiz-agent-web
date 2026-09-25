// **令·补24 片 A（P0-1）红证**：抗习惯性通过之卡面——四条。
//   ① 高危卡**不渲染档位区**（once/session/project/forever 四档一律不出现；后端本已禁复用，前端对齐）
//   ② 默认焦点＝「拒绝」；**Esc＝拒绝**（卡全文原无 keydown/focus 逻辑）
//   ③ 高危卡之「同意」**不得为 accent 实心**（同意/拒绝视觉权重反转）
//   ④ 复用可见：daemon 下发「本动作已免卡执行 M 次」⇒ 该条消息内**显式一行＋「撤销」**（禁静默）
//
// 判据分两层（照本仓 `approval-card-design.test.ts` 同法）：**DOM 级**（真挂载）＋**样式源级**（读组件源）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ApprovalCard from '../src/components/chat/message/ApprovalCard.vue'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import zhCN from '../src/locales/zh-CN'
import type { MessageMeta } from '../src/models'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

// 样式源级断言：直接读组件源（vitest cwd＝仓根）
const cardSource = readFileSync('src/components/chat/message/ApprovalCard.vue', 'utf8')
const scopedCss = /<style scoped>([\s\S]*?)<\/style>/.exec(cardSource)?.[1] ?? ''

/** 挂到 document.body（焦点断言需要真实文档里的元素） */
function mountCard(meta: MessageMeta) {
  return mount(ApprovalCard, {
    props: {
      message: {
        id: 'm-a',
        conversationId: 'c-a',
        kind: 'approval' as const,
        text: '',
        createdAt: Date.now(),
        meta,
      },
    },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

const HIGH = {
  requestId: 'r-hi',
  toolName: 'shell_exec',
  argsPreview: '{"command":"rm -rf build"}',
  reason: '清构建产物',
  risk: 'high',
}

describe('片 A ① 高危卡：档位区不渲染（后端已禁复用 ⇒ 前端对齐）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('①a 高危卡 ⇒ 档位区不存在；四档文案一个都不出现', () => {
    const wrapper = mountCard({ ...HIGH })
    expect(wrapper.find('.approval-scope').exists()).toBe(false)
    for (const label of ['一次', '本会话', '本项目', '永久']) {
      expect(wrapper.text(), `高危卡不得出现档位「${label}」`).not.toContain(label)
    }
    // 「记住这条」＝复用入口同闭（否则留下一个恒禁用的死钮＝新问题）
    expect(wrapper.find('button.remember').exists()).toBe(false)
    wrapper.unmount()
  })

  it('①b 负向对照：中风险卡档位区**照旧**渲染（紧致度核心·两态俱须绿）', () => {
    const wrapper = mountCard({
      requestId: 'r-mid',
      toolName: 'classify_customers',
      argsPreview: '{"range":"today"}',
      risk: 'medium',
    })
    expect(wrapper.find('.approval-scope').exists()).toBe(true)
    expect(wrapper.findAll('.scope-option')).toHaveLength(4)
    expect(wrapper.find('button.remember').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('片 A ② 默认焦点＝拒绝；Esc＝拒绝', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('②a 高危卡挂载后 document.activeElement ＝ 拒绝钮', async () => {
    const wrapper = mountCard({ ...HIGH })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('button.deny').element)
    wrapper.unmount()
  })

  it('②a2 对照：中风险卡**不**夺焦（默认焦点只服务高危面，不扰常态卡）', async () => {
    const wrapper = mountCard({
      requestId: 'r-mid2',
      toolName: 'classify_customers',
      risk: 'medium',
    })
    await nextTick()
    expect(document.activeElement).not.toBe(wrapper.find('button.deny').element)
    wrapper.unmount()
  })

  it('②b 派发 Esc ⇒ 走**拒绝**径（approved:false；不得走同意）', async () => {
    const respond = vi
      .spyOn(getClientSetup().client, 'permissionRespond')
      .mockResolvedValue({ resolved: true, status: 'denied' })
    const wrapper = mountCard({ ...HIGH, requestId: 'r-esc' })
    await nextTick()

    await wrapper.find('button.deny').trigger('keydown', { key: 'Escape' })
    await nextTick()
    await nextTick()

    expect(respond).toHaveBeenCalledTimes(1)
    expect(respond).toHaveBeenCalledWith({ request_id: 'r-esc', approved: false })
    wrapper.unmount()
  })

  it('②c 反例对照：Esc **不得**触发同意（同意钮绝不会被键盘误放行）', async () => {
    const respond = vi
      .spyOn(getClientSetup().client, 'permissionRespond')
      .mockResolvedValue({ resolved: true, status: 'denied' })
    const wrapper = mountCard({ ...HIGH, requestId: 'r-esc2' })
    await nextTick()
    await wrapper.find('button.approve').trigger('keydown', { key: 'Escape' })
    await nextTick()
    await nextTick()
    expect(respond.mock.calls.every((call) => call[0].approved === false)).toBe(true)
    wrapper.unmount()
  })
})

describe('片 A ③ 高危卡「同意」不得为 accent 实心（权重反转）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('③a 高危卡同意钮带 plain 类；样式源内 .approve.plain 背景**不是** --accent', () => {
    const wrapper = mountCard({ ...HIGH })
    const approve = wrapper.find('button.approve')
    expect(approve.classes()).toContain('plain')
    const rule = /\.approval-actions \.approve\.plain[^{]*\{[\s\S]*?\}/.exec(scopedCss)?.[0] ?? ''
    expect(rule, '样式源须有 .approve.plain 兜底（否则仍落 --accent 实心）').toBeTruthy()
    expect(rule).not.toMatch(/background:\s*var\(--accent\)/)
    expect(rule).toMatch(/background:\s*transparent/)
    wrapper.unmount()
  })

  it('③b 权重反转：高危卡拒绝钮为强调实心（strong）；中风险卡**不**反转', () => {
    const hi = mountCard({ ...HIGH })
    expect(hi.find('button.deny').classes()).toContain('strong')
    const strong = /\.approval-actions \.deny\.strong[^{]*\{[\s\S]*?\}/.exec(scopedCss)?.[0] ?? ''
    expect(strong, '样式源须有 .deny.strong（安全选项夺回视觉权重）').toBeTruthy()
    expect(strong).toMatch(/background:\s*var\(--accent\)/)
    // **不得用红**（规格 §五#6 铁律：红只留给 error/danger）
    expect(strong).not.toMatch(/--danger|#c0392b|#dc2626/)
    hi.unmount()

    const mid = mountCard({ requestId: 'r-mid3', toolName: 'classify_customers', risk: 'medium' })
    expect(mid.find('button.approve').classes()).not.toContain('plain')
    expect(mid.find('button.deny').classes()).not.toContain('strong')
    mid.unmount()
  })
})

describe('片 A ④ 复用可见（禁静默）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('④a 免卡执行 M 次 ⇒ 该条消息内显式一行 ＋「撤销」可点（发出 approval.revoke）', async () => {
    const revoke = vi
      .spyOn(getClientSetup().client, 'approvalRevoke')
      .mockResolvedValue({ ok: true })
    const wrapper = mountCard({ ...HIGH, requestId: 'r-reuse', reuseCount: 3, reuseRuleId: 'rule-7' })

    const line = wrapper.find('.approval-reuse')
    expect(line.exists(), '复用事实必须显式上屏（禁静默）').toBe(true)
    expect(line.text()).toContain('本动作已免卡执行 3 次')
    const undo = wrapper.find('.approval-reuse-undo')
    expect(undo.exists()).toBe(true)

    await undo.trigger('click')
    await nextTick()
    await nextTick()
    expect(revoke).toHaveBeenCalledWith({ rule_id: 'rule-7' })
    wrapper.unmount()
  })

  it('④b 无该字段 ⇒ 整块不渲染（缺省不渲染；禁伪造次数——daemon 面未到位时的降级）', () => {
    const wrapper = mountCard({ ...HIGH, requestId: 'r-noreuse' })
    expect(wrapper.find('.approval-reuse').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('免卡执行')
    wrapper.unmount()
  })

  it('④c 有次数、无规则 id ⇒ 事实照说（行在），但不给按不动的假钮', () => {
    const wrapper = mountCard({ ...HIGH, requestId: 'r-half', reuseCount: 2 })
    expect(wrapper.find('.approval-reuse').text()).toContain('本动作已免卡执行 2 次')
    expect(wrapper.find('.approval-reuse-undo').exists()).toBe(false)
    wrapper.unmount()
  })
})
