// MSG-2805 DEBT-569 红证②：版本显面动态化——页显 == 注入版本同值
//（mock detectVersion 返壳 conf 同源值——断言渲染 v 前缀同值——硬编
// v0.1.0 漂移根治面）；诚实占位面（null → 勿假值——显诚实文案）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhCN from '../src/locales/zh-CN'
import SystemCard from '../src/components/settings/SystemCard.vue'

// vi.hoisted：工厂变量提升——测试侧可改返回值（vitest 工厂 hoist 钉）
const mocks = vi.hoisted(() => ({
  detectRuntime: vi.fn(() => 'tauri'),
  detectVersion: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('../src/bridge', () => mocks)

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

describe('SystemCard 版本显（MSG-2805 DEBT-569）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.detectRuntime.mockReturnValue('tauri')
    mocks.detectVersion.mockResolvedValue(null)
  })

  it('页显 == 注入版本同值（壳 conf 同源——tauri getVersion 链）', async () => {
    mocks.detectVersion.mockResolvedValue('1.0.7')
    const wrapper = mount(SystemCard, {
      global: { plugins: [i18n] },
    })
    await flushPromises()
    const text = wrapper.find('.about-version').text()
    expect(text).toContain('v1.0.7')
    expect(text).toContain('tauri')
    expect(text).not.toContain('v0.1.0')
    expect(text).not.toContain('本地预览')
  })

  it('诚实占位：detectVersion null（tauri 径桥未通）→ 勿假值', async () => {
    mocks.detectVersion.mockResolvedValue(null)
    const wrapper = mount(SystemCard, {
      global: { plugins: [i18n] },
    })
    await flushPromises()
    const text = wrapper.find('.about-version').text()
    expect(text).toContain('版本未取到')
    expect(text).not.toContain('v0.1.0')
  })

  it('web 径诚实面：runtime web + null → 本地预览', async () => {
    mocks.detectRuntime.mockReturnValue('web')
    mocks.detectVersion.mockResolvedValue(null)
    const wrapper = mount(SystemCard, {
      global: { plugins: [i18n] },
    })
    await flushPromises()
    expect(wrapper.find('.about-version').text()).toContain('本地预览')
    expect(wrapper.find('.about-version').text()).not.toContain('v0.1.0')
  })
})
