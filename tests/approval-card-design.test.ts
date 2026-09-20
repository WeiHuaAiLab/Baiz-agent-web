// MSG-3145 ·《审批卡设计规格 v1.0》§三/§四/§五 红证：
// 九态齐（default/hover/active/focus/disabled/loading/error/empty/success）、
// 拒绝非红、热区 ≥44×44、窄屏换行、档位选中态实心——DOM 级 + 样式源级双向断言。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ApprovalCard from '../src/components/chat/ApprovalCard.vue'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { useApprovalStore } from '../src/stores/approval'
import zhCN from '../src/locales/zh-CN'
import type { MessageMeta } from '../src/models'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

// 样式源级断言：直接读组件源（vitest cwd＝仓根）
const cardSource = readFileSync('src/components/chat/ApprovalCard.vue', 'utf8')
const scopedCss = /<style scoped>([\s\S]*?)<\/style>/.exec(cardSource)?.[1] ?? ''

function mountCard(meta: MessageMeta) {
  return mount(ApprovalCard, {
    props: {
      message: {
        id: 'm-design',
        conversationId: 'c-design',
        kind: 'approval' as const,
        text: '',
        createdAt: Date.now(),
        meta,
      },
    },
    global: { plugins: [i18n] },
  })
}

describe('§三 九态：default／loading／error／empty／success（DOM 级）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('default：动作摘要＋理由在前、工具名次级、档位默认「一次」', () => {
    const wrapper = mountCard({
      requestId: 'r1',
      toolName: 'classify_customers',
      argsPreview: '{"range":"today"}',
      reason: '要给今天的客户打意向标签',
      risk: 'medium',
    })
    expect(wrapper.find('.approval-card').attributes('data-state')).toBe('default')
    const body = wrapper.find('.approval-body')
    expect(body.element.firstElementChild?.className).toBe('approval-reason')
    expect(wrapper.find('.approval-reason').text()).toBe('要给今天的客户打意向标签')
    expect(wrapper.find('.approval-summary').text()).toBe('整理今天的客户并分级')
    expect(wrapper.find('.approval-tool').text()).toBe('客户分级')
    expect(wrapper.find('.scope-option.active').text()).toBe('一次')
  })

  it('loading：点后按钮转圈＋文案「提交中…」、两钮禁用、卡不消失', async () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r2', action: 'shell_exec', risk: 'high' })
    let release: (() => void) | null = null
    vi.spyOn(getClientSetup().client, 'permissionRespond').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ resolved: true, status: 'approved' })
        }),
    )
    const wrapper = mountCard({ requestId: 'r2', toolName: 'shell_exec', argsPreview: '{"command":"ls"}', risk: 'high' })

    await wrapper.find('button.approve').trigger('click')

    expect(wrapper.find('.approval-card').attributes('data-state')).toBe('loading')
    expect(wrapper.find('button.approve').text()).toContain('提交中…')
    expect(wrapper.find('.approval-spinner').exists()).toBe(true)
    expect(wrapper.find('button.approve').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.deny').attributes('disabled')).toBeDefined()
    // 卡不消失（仍在待决区）
    expect(wrapper.find('.approval-card').exists()).toBe(true)

    release!()
    await flushPromises()
  })

  it('error：提交失败 ⇒ 卡内一行「提交失败：…」＋不销卡可重试（fail-closed）', async () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r3', action: 'shell_exec', risk: 'high' })
    // 非 mock 传输才走「失败保留」径（mock 为脚本化演示：失败也销单）
    ;(getClientSetup().transport as { kind: string }).kind = 'tauri'
    vi.spyOn(getClientSetup().client, 'permissionRespond').mockRejectedValue(new Error('网关不可用'))
    const wrapper = mountCard({ requestId: 'r3', toolName: 'shell_exec', argsPreview: '{"command":"ls"}', risk: 'high' })

    await wrapper.find('button.approve').trigger('click')
    await flushPromises()

    expect(wrapper.find('.approval-card').attributes('data-state')).toBe('error')
    expect(wrapper.find('.approval-error').text()).toContain('提交失败：网关不可用')
    expect(wrapper.find('.approval-error').text()).toContain('可重试')
    // 不销卡：待办仍在，且卡面按钮回到可用（可重试）
    expect(approvals.pending.some((item) => item.request_id === 'r3')).toBe(true)
    expect(wrapper.find('button.approve').attributes('disabled')).toBeUndefined()
  })

  it('empty：无理由/无摘要时不留白（MSG-3231 ③：理由改**可读兜底**，摘要仍显式空态）', () => {
    const wrapper = mountCard({ requestId: 'r4', toolName: 'write_file' })
    // 令明令「未提供理由」呈现消失 ⇒ 理由位改「需要你确认：<工具> 对 <摘要>」
    const reason = wrapper.find('.approval-reason').text()
    expect(reason).not.toContain('未提供理由')
    expect(reason).toContain('需要你确认')
    expect(reason).toContain('写文件')
    expect(wrapper.find('.approval-summary').text()).toBe('（未提供动作摘要）')
  })

  it('success：已决一行 ✓ 已批准 · 本会话 ＋工具名（留在输出区）', () => {
    const wrapper = mountCard({
      requestId: 'r5',
      toolName: 'classify_customers',
      argsPreview: '{"range":"today"}',
      reason: '要给今天的客户打意向标签',
      risk: 'medium',
      approved: true,
      scope: 'session',
    })
    expect(wrapper.find('.approval-card.resolved').attributes('data-state')).toBe('success')
    expect(wrapper.text()).toContain('✓ 已批准')
    expect(wrapper.text()).toContain('· 本会话')
    expect(wrapper.find('.approval-resolved-tool').text()).toBe('客户分级')
  })

  it('hover／active／focus／disabled 四态在样式源内有落点', () => {
    expect(scopedCss).toMatch(/\.approval-actions \.approve:hover:not\(:disabled\)/)
    expect(scopedCss).toMatch(/\.approval-actions \.deny:hover:not\(:disabled\)/)
    expect(scopedCss).toMatch(/\.approval-actions \.remember:hover:not\(:disabled\)/)
    expect(scopedCss).toMatch(/\.approval-actions \.escalate:hover:not\(:disabled\)/)
    expect(scopedCss).toMatch(/\.approval-actions button:active:not\(:disabled\)/)
    expect(scopedCss).toMatch(/\.approval-actions button:focus-visible[\s\S]*?shadow-focus/)
    expect(scopedCss).toMatch(/\.approval-actions button:disabled/)
    expect(scopedCss).toMatch(/\.scope-option:hover/)
    expect(scopedCss).toMatch(/\.scope-option\.active/)
  })
})

describe('§四／§五：极端情况与可机判项（样式源级）', () => {
  it('§五#1 卡内裸 hex＝0；圆角 ⊆ {4,8,12,16,9999}', () => {
    expect(scopedCss.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toHaveLength(0)
    const radii = (scopedCss.match(/border-radius:\s*([^;]+);/g) ?? []).flatMap((decl) =>
      decl
        .replace(/border-radius:\s*/, '')
        .replace(';', '')
        .split(/\s+/)
        .filter((v) => v && v !== '0'),
    )
    for (const r of radii) expect(['4px', '8px', '12px', '16px', '9999px']).toContain(r)
  })

  it('§五#4 热区 ≥44×44：按钮/档位/展开/改动键均以伪元素扩热区（视觉高 36＋上下各 4）', () => {
    expect(scopedCss).toMatch(/\.approval-actions button \{[\s\S]*?min-height: 36px/)
    expect(scopedCss).toMatch(/\.approval-actions button::after \{[\s\S]*?inset: -4px/)
    expect(scopedCss).toMatch(/\.scope-option::after \{[\s\S]*?inset: -6px -4px/)
    expect(scopedCss).toMatch(/\.approval-expand::after \{[\s\S]*?inset: -12px/)
    expect(scopedCss).toMatch(/\.approval-diff-toggle::after \{[\s\S]*?inset: -6px/)
  })

  it('§五#6 拒绝＝中性描边（非红）：.deny 块内无 danger 色', () => {
    const deny = /\.approval-actions \.deny \{[\s\S]*?\}/.exec(scopedCss)?.[0] ?? ''
    expect(deny).toBeTruthy()
    expect(deny).not.toMatch(/--danger|#c0392b|#dc2626/)
    expect(deny).toMatch(/border-color: var\(--border-strong\)/)
    // 同意＝唯一强调色实心
    expect(scopedCss).toMatch(/\.approval-actions \.approve \{[\s\S]*?background: var\(--accent\)/)
  })

  it('§四#3 __inbox__ 标「来自后台任务」；§四#2 档位未知用 --risk-unknown', () => {
    const wrapper = mountCard({
      requestId: 'r6',
      toolName: 'shell_exec',
      argsPreview: '{"command":"cargo test"}',
      reason: '定时任务要跑测试',
      inbox: true,
    })
    expect(wrapper.find('.approval-from-inbox').text()).toBe('来自后台任务')
    expect(wrapper.find('.risk.unknown').text()).toBe('档位未知')
    expect(scopedCss).toMatch(/\.risk\.unknown \{[\s\S]*?--risk-unknown-text/)
  })

  it('§四#1 超长命令：等宽块单行截断＋展开后最大高 240 内滚', () => {
    expect(scopedCss).toMatch(/\.approval-summary\.is-command\.clamped \{[\s\S]*?text-overflow: ellipsis/)
    expect(scopedCss).toMatch(/\.approval-summary\.is-command\.expanded \{[\s\S]*?max-height: 240px[\s\S]*?overflow: auto/)
  })

  it('§四#5 窄屏（<640）：按钮区换行、各宽 100%、高 40', () => {
    const media = /@media \(max-width: 640px\) \{[\s\S]*?\n\}/.exec(scopedCss)?.[0] ?? ''
    expect(media).toMatch(/\.approval-actions \{[\s\S]*?flex-direction: column/)
    expect(media).toMatch(/\.approval-actions button \{[\s\S]*?width: 100%[\s\S]*?min-height: 40px/)
  })

  it('动效：卡内仅 150／250／400ms 档（loading 转圈取 400ms）', () => {
    const durs = new Set(
      (scopedCss.match(/\b(\d+(?:\.\d+)?m?s)\b/g) ?? []).filter((d) => d !== '0s'),
    )
    for (const d of durs) expect(['150ms', '250ms', '400ms']).toContain(d)
  })
})
