// **MSG-3558 红证／绿证**：模型鉴权失败 ⇒ **就地人话错误卡**；未登录面（空 uid）⇒ **显式提示条**（不得以空态呈现）。
//
// 老板原话（2026-09-24）：「客户端当前持有的模型 API key 无效，这个最好有个提示，让用户知道是什么地方出了问题，用户可以及时调整」。
// 现状（改前）：`engine_error`/401 帧只落通用 status 行（或**什么都没有**）；空 uid 时 `schedule.list` 返回**空表**
// ⇒ 任务页显示「暂无定时任务」＝把"未登录"伪装成"你没建过"。
//
// 判据（令 §二／§三）：
//   ①401/403/Unauthorized/invalid（engine 分型）⇒ 错误卡：标题＋**已掩码**原因＋**当前模型名**＋设置入口＋重试上一条；
//   ②空 uid ⇒ 未登录提示条（**非**空态），且不得显示「暂无定时任务」；
//   ③正常 ⇒ 两者皆**不**出现（防误报回归）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { router } from '../src/router'
import MessageItem from '../src/components/chat/MessageItem.vue'
import ScheduledView from '../src/components/working/ScheduledView.vue'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import { useSettingsStore } from '../src/stores/settings'
import { useAuthStore } from '../src/stores/auth'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 服务端原文（**已掩码**——带 `****`；测试**不使用任何真实密钥**） */
const AUTH_401 =
  'deepseek unavailable: stream HTTP 401 Unauthorized: {"error":{"message":"Authentication Fails, Your api key:**** is invalid"}}'

function seedConversation(store: ReturnType<typeof useSessionStore>, id = 'c1') {
  store.conversations = [{ id, title: '会话', createdAt: 1, updatedAt: 1 }]
  store.activeId = id
  return id
}

describe('MSG-3558 鉴权失败／未登录面 人话提示', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('① 模型鉴权失败（401）⇒ 就地错误卡：掩码原因＋模型名＋设置入口＋重试', async () => {
    const session = useSessionStore()
    const messages = useMessageStore()
    const settings = useSettingsStore()
    const cid = seedConversation(session)
    settings.model = 'deepseek-v4-flash'

    // 一次在跑的 chat.send（run 已建、会话已知）——随后 daemon 以鉴权失败收束
    messages.runs['t1'] = {
      taskId: 't1',
      conversationId: cid,
      status: 'running',
      startedAt: Date.now(),
      reasoning: '',
      text: '',
      trace: [],
    }
    messages.onError({ task_id: 't1', message: AUTH_401 })
    await flushPromises()

    const list = messages.list(cid)
    const last = list[list.length - 1]
    expect(last?.kind, '失败必须留一条可见消息（禁静默）').toBe('status')
    expect(String(last?.text ?? ''), '原文含鉴权分型（判定依据）').toMatch(/401|Unauthorized|invalid/i)

    const wrapper = mount(MessageItem, {
      props: { message: last! },
      global: { plugins: [i18n, router], stubs: { RunBlocks: true, RunSubtitles: true } },
    })
    expect(wrapper.find('.auth-error-card').exists(), '401 ⇒ 必须出现错误卡').toBe(true)
    expect(wrapper.text(), '须回显当前模型名').toContain('DeepSeek V4 Flash')
    expect(wrapper.text(), '须带上服务端原因片段（掩码形态）').toMatch(/401|Unauthorized|invalid/i)
    expect(wrapper.text(), '不得上屏密钥原文').not.toMatch(/sk-[A-Za-z0-9]{8,}/)
    expect(wrapper.find('.auth-error-settings').exists(), '须有直达设置页按钮').toBe(true)
    expect(wrapper.find('.auth-error-retry').exists(), '须有「重试上一条」').toBe(true)
  })

  it('② 空 uid（未登录面）⇒ 提示条（非空态）', async () => {
    const auth = useAuthStore()
    auth.sessionToken = 'tok-placeholder' // 已持有令牌，但**身份未建立**
    auth.userId = ''
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([])

    const wrapper = mount(ScheduledView, { global: { plugins: [i18n] } })
    await flushPromises()

    expect(wrapper.find('.identity-notice').exists(), '空 uid ⇒ 必须给未登录提示条').toBe(true)
    expect(
      wrapper.text().includes(zhCN.working.emptyScheduledTitle),
      '不得把"未登录"伪装成"暂无任务"空态',
    ).toBe(false)
  })

  it('③ 正常（身份在位、无鉴权失败）⇒ 两者皆不出现', async () => {
    const session = useSessionStore()
    const messages = useMessageStore()
    const auth = useAuthStore()
    auth.sessionToken = 'tok-placeholder'
    auth.userId = 'x-h-placeholder'
    const cid = seedConversation(session)

    const ordinary = messages.list(cid)
    expect(ordinary.find((m) => m.meta?.errorKey === 'modelAuth')).toBeUndefined()

    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([])
    const wrapper = mount(ScheduledView, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.find('.identity-notice').exists(), '身份在位 ⇒ 不得显示未登录条').toBe(false)
    expect(wrapper.text()).toContain(zhCN.working.emptyScheduledTitle)
  })
})
