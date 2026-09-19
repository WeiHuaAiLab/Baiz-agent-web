// MSG-3172 红证：待办收件箱入口 **状态栏 → 左侧栏**（Tab 行之下、内容区之上）
// ①位置：DOM 顺序 = 品牌 → Tab 行 → 入口 → 内容区；②点击＝ui.toggleInbox()；
// ③角标：有待办才渲染（**不留空圈**）；④title／文案沿用既有 i18n 键（不新增）；
// ⑤状态栏与 App 悬浮钮两处旧入口**已删**（避免重复入口）；
// ⑥样式：圆角 8、间距 4 倍数、热区 ≥44×44（::after 扩热区）。
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import SidebarPanel from '../src/components/Sidebar/SidebarPanel.vue'
import StatusBar from '../src/components/StatusBar.vue'
import { router } from '../src/router'
import { useApprovalStore } from '../src/stores/approval'
import { useUiStore } from '../src/stores/ui'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const sidebarSource = readFileSync('src/components/Sidebar/SidebarPanel.vue', 'utf8')
const sidebarCss = readFileSync('src/styles/sidebar.css', 'utf8')
const statusBarSource = readFileSync('src/components/StatusBar.vue', 'utf8')
const appSource = readFileSync('src/App.vue', 'utf8')

function mountSidebar() {
  return mount(SidebarPanel, { global: { plugins: [i18n, router] } })
}

describe('MSG-3172 · 待办入口落左侧栏', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('①位置：在 Tab 行之下、内容区之上（DOM 顺序）', () => {
    const wrapper = mountSidebar()
    const panel = wrapper.find('.side-panel')
    const html = panel.html()
    const tabsAt = html.indexOf('class="side-tabs"')
    const entryAt = html.indexOf('class="side-inbox')
    const scrollAt = html.indexOf('class="side-scroll"')
    expect(tabsAt).toBeGreaterThan(-1)
    expect(entryAt).toBeGreaterThan(tabsAt)
    expect(scrollAt).toBeGreaterThan(entryAt)
  })

  it('②点击 ⇒ ui.toggleInbox()（打开同一个收件箱面板）', async () => {
    const ui = useUiStore()
    const wrapper = mountSidebar()
    expect(ui.inboxOpen).toBe(false)
    await wrapper.find('.side-inbox').trigger('click')
    expect(ui.inboxOpen).toBe(true)
  })

  it('③角标：无待办不渲染（不留空圈）；有待办显数字', async () => {
    const approvals = useApprovalStore()
    const wrapper = mountSidebar()
    expect(wrapper.find('.side-inbox-badge').exists()).toBe(false)

    approvals.upsert({ request_id: 'r-3172', action: 'shell_exec', risk: 'high' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.side-inbox-badge').text()).toBe('1')
  })

  it('④title／文案沿用既有 i18n 键（不新增）', () => {
    const wrapper = mountSidebar()
    const entry = wrapper.find('.side-inbox')
    expect(entry.attributes('title')).toBe(zhCN.approval.inboxTitle)
    expect(entry.find('.side-inbox-label').text()).toBe(zhCN.approval.inboxShort)
    expect(entry.find('.side-inbox-label').text()).toBe('待办')
  })

  it('⑤旧入口已删：状态栏无 .sb-inbox／App 无 .inbox-fab（禁重复入口）', () => {
    const status = mount(StatusBar, { global: { plugins: [i18n, router] } })
    expect(status.find('.sb-inbox').exists()).toBe(false)
    expect(statusBarSource).not.toContain('sb-inbox')
    expect(appSource).not.toContain('inbox-fab')
    expect(appSource).not.toContain('inbox-badge')
  })

  it('⑥样式：圆角 8、间距 4 倍数、热区 ≥44×44（::after 扩热区，不撑视觉高）', () => {
    const block = /\.side-inbox \{[\s\S]*?\n\}/.exec(sidebarCss)?.[0] ?? ''
    expect(block).toMatch(/border-radius: 8px/)
    expect(block).toMatch(/margin: 0 8px 8px/)
    expect(block).toMatch(/padding: 8px 12px/)
    // 视觉高 ≈ 8+8+13*1.5 ≈ 36 ⇒ ::after 上下各扩 5 ⇒ 命中区 ≈46 ≥ 44
    expect(sidebarCss).toMatch(/\.side-inbox::after \{[\s\S]*?inset: -5px -4px/)
    expect(sidebarCss).toMatch(/\.side-inbox:hover \{/)
    expect(sidebarCss).toMatch(/\.side-inbox:focus-visible \{[\s\S]*?shadow-focus/)
    expect(sidebarCss).toMatch(/\.side-inbox:active \{/)
    // 角标：药丸圆角（9999）＋ danger 底＋ accent-contrast 文字（双主题可读）
    const badge = /\.side-inbox-badge \{[\s\S]*?\n\}/.exec(sidebarCss)?.[0] ?? ''
    expect(badge).toMatch(/border-radius: 9999px/)
    expect(badge).toMatch(/background: var\(--danger\)/)
    expect(badge).toMatch(/color: var\(--accent-contrast\)/)
    // 内容区之上的位置由 SidebarPanel 模板保证（①）
    expect(sidebarSource).toContain('class="side-inbox"')
  })
})
