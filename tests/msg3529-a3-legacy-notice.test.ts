// MSG-3529 A3 红证：**旧版（无账号段）会话提示必须上屏**（非静默）
//
// 背景（`MSG-3494` §②A8/A3＋`MSG-3485` 甲案）：旧库 `baiz`（无账号段）**只读清点**、
// 本版不显示（零删零改）；store 早已算好 `session.legacyNotice` 文案，但**无处渲染**
// ⇒ 用户"看不见"（提示只进了 console）。
// 判据：①`legacyNotice` 非空 ⇒ **上屏**（`role=status`，文案逐字）②空串 ⇒ **不占位**。
// ★ 红证：注掉 `ChatPanel.vue` 内的 `v-if="session.legacyNotice"` 那段 ⇒ 用例①**必红**。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ChatPanel from '../src/components/Sidebar/ChatPanel.vue'
import { useSessionStore } from '../src/stores/session'
import { router } from '../src/router'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const NOTICE = '存在 2 条旧版会话（无账号段）：本版不显示，数据未删'

function mountPanel() {
  return mount(ChatPanel, {
    global: {
      plugins: [i18n, router],
      stubs: { ProjectList: true, SessionList: true, Icon: true },
    },
  })
}

describe('MSG-3529 A3 · 旧版会话提示上屏', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('① legacyNotice 非空 ⇒ 上屏（role=status·文案逐字）', () => {
    useSessionStore().legacyNotice = NOTICE
    const wrapper = mountPanel()
    const el = wrapper.find('.legacy-notice')
    expect(el.exists(), '提示必须上屏（注掉渲染块 ⇒ 必红）').toBe(true)
    expect(el.attributes('role')).toBe('status')
    expect(el.text()).toBe(NOTICE)
  })

  it('② legacyNotice 空 ⇒ 不占位（无旧数据即无痕）', () => {
    useSessionStore().legacyNotice = ''
    const wrapper = mountPanel()
    expect(wrapper.find('.legacy-notice').exists()).toBe(false)
  })
})
