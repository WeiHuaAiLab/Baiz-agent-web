// MSG-2870 DEBT-592 红证：ChatHeader 顶栏状态分槽——
// ① streaming 勿借 connecting 槽（勘案 🔴 即改）——run 在飞＋连链稳 → 「思考中…」；
// ② run 卡死诚实报断——run 在飞但连链断（订阅断重建——终帧缺源）→
//    「连接已断，请重试」（勿思考中永卡——零永卡面）；
// ③ 真连链态（无 run）→ 「重连中…」照旧。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ChatHeader from '../src/components/chat/ChatHeader.vue'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import { useSettingsStore } from '../src/stores/settings'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function seedRun(status = 'running') {
  const messages = useMessageStore()
  const session = useSessionStore()
  session.activeId = 'c-1'
  messages.runs['t-1'] = {
    taskId: 't-1',
    conversationId: 'c-1',
    status,
    startedAt: Date.now(),
  } as never
}

describe('ChatHeader 顶栏状态分槽（DEBT-592）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('run 在飞＋连链稳 → 「思考中…」（勿借 connecting 槽）', () => {
    const settings = useSettingsStore()
    settings.connection = 'connected'
    seedRun()
    const wrapper = mount(ChatHeader, { global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('思考中…')
    expect(wrapper.text()).not.toContain('连接中')
    expect(wrapper.find('.status').classes()).not.toContain('warn')
  })

  it('run 在飞但连链断（reconnecting——终帧缺源）→ 诚实报断可重试（零永卡）', () => {
    const settings = useSettingsStore()
    settings.connection = 'reconnecting'
    seedRun()
    const wrapper = mount(ChatHeader, { global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('连接已断，请重试')
    expect(wrapper.text()).not.toContain('思考中')
    expect(wrapper.find('.status').classes()).toContain('warn')
  })

  it('真连链态（无 run）→ 「重连中…」照旧（connecting 槽唯真连链）', () => {
    const settings = useSettingsStore()
    settings.connection = 'connecting'
    const wrapper = mount(ChatHeader, { global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('重连中…')
    expect(wrapper.text()).not.toContain('思考中')
    expect(wrapper.text()).not.toContain('连接已断')
  })

  it('run 在飞＋连链稳（resync 瞬态续订——会续帧）→ 「思考中…」（不误报断）', () => {
    const settings = useSettingsStore()
    settings.connection = 'resync'
    seedRun()
    const wrapper = mount(ChatHeader, { global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('思考中…')
    expect(wrapper.text()).not.toContain('连接已断')
  })
})
