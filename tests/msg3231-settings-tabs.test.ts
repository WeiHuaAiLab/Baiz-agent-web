// MSG-3231 ② 红证：设置页签**按实内容归位**（ZCode 走查 [缺陷 3]）。
// 改前红：名为「运行与更新」的页里装的是记忆设置，而"更新/运行"设置无处可寻。
// 改后绿：「记忆」页＝记忆面；「运行与更新」页＝版本＋检查更新（741 入口）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import SettingsView from '../src/components/settings/SettingsView.vue'
import MemoryCard from '../src/components/settings/MemoryCard.vue'
import UpdateCard from '../src/components/settings/UpdateCard.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

// 页签测试只关心"页签⇄面板归属"，内容卡以 stub 替换（免各卡副作用）
const stubs = {
  AppearanceCard: true,
  KbCard: true,
  WorkspaceCard: true,
  ApiKeyCard: true,
  ModelCard: true,
  McpCard: true,
  MemoryCard: true,
  DemoCard: true,
  SystemCard: true,
  UpdateCard: true,
}

function mountSettings() {
  return mount(SettingsView, { global: { plugins: [i18n], stubs } })
}

function visiblePanel(wrapper: ReturnType<typeof mountSettings>) {
  const panels = wrapper
    .findAll('.settings-panel')
    .filter((panel) => (panel.element as HTMLElement).style.display !== 'none')
  expect(panels).toHaveLength(1)
  return panels[0]
}

describe('MSG-3231 ② 设置页签归位', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('T1 页签清单：含「记忆」与「运行与更新」两项（旧版只有错位的「运行与更新」）', () => {
    const wrapper = mountSettings()
    const labels = wrapper.findAll('.settings-tab').map((tab) => tab.text())
    expect(labels).toContain('记忆')
    expect(labels).toContain('运行与更新')
  })

  it('T2 「运行与更新」页装的是更新面（版本＋检查更新），**不是**记忆面', async () => {
    const wrapper = mountSettings()
    const tab = wrapper.findAll('.settings-tab').find((entry) => entry.text() === '运行与更新')
    expect(tab).toBeTruthy()
    await tab!.trigger('click')
    const panel = visiblePanel(wrapper)
    expect(panel.findComponent(UpdateCard).exists()).toBe(true)
    expect(panel.findComponent(MemoryCard).exists()).toBe(false)
  })

  it('T3 「记忆」页装的是记忆面（页签名与内容一致）', async () => {
    const wrapper = mountSettings()
    const tab = wrapper.findAll('.settings-tab').find((entry) => entry.text() === '记忆')
    expect(tab).toBeTruthy()
    await tab!.trigger('click')
    const panel = visiblePanel(wrapper)
    expect(panel.findComponent(MemoryCard).exists()).toBe(true)
    expect(panel.findComponent(UpdateCard).exists()).toBe(false)
  })
})
