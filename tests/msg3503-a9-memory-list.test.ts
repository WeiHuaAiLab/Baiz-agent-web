// MSG-3503 A9（DEBT-876／测试员 T8）红证：**记忆直观显示**接线（daemon `memory.list`）
// ①真机面：`memory.list` 被调用（会话令牌随行）⇒ 卡片**逐条**显示（含来源）
// ②零令牌/空表面：显空态 ＋ daemon 人话 note（**不假装有数据**）
// ③服务端未就绪（-32601）⇒ 明说「未就绪」，**不得静默成功**（DEBT-738 教训）
// ④失败可重试：error 态显人话；重试成功 ⇒ 列表出现
// ⑤演示态保种子（旧行为零变）且**零 RPC**
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { RpcError } from '../src/client/rpc'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { useAuthStore } from '../src/stores/auth'
import { useMemoryStore } from '../src/stores/memory'
import { useSettingsStore } from '../src/stores/settings'
import MemoryCard from '../src/components/settings/MemoryCard.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const TOKEN = 'sess-token-abc'
const ITEM_A = {
  id: '1727-abc12345',
  text: '客户 A 公司偏好每周一上午收到周报',
  source: 'conv-1',
  created_at: '2026-09-23T05:00:00+00:00',
  owner: 'user-a',
}
const ITEM_B = { ...ITEM_A, id: '1727-def67890', text: '常用项目目录在 F 盘', source: 'conv-2' }

describe('MSG-3503 A9 · 记忆只读面（memory.list）真链', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('①load() 带会话令牌调 memory.list，条目进 store（含来源／时间）', async () => {
    sessionStorage.setItem('baiz_session_token', TOKEN)
    useAuthStore().hydrate()

    const calls: Array<Record<string, unknown> | undefined> = []
    vi.spyOn(getClientSetup().client, 'memoryList').mockImplementation(async (params) => {
      calls.push(params as Record<string, unknown> | undefined)
      return { owner: 'user-a', count: 1, items: [ITEM_A] }
    })

    const memory = useMemoryStore()
    await memory.load()

    expect(calls).toEqual([{ token: TOKEN }])
    expect(memory.status).toBe('ready')
    expect(memory.owner).toBe('user-a')
    expect(memory.facts).toHaveLength(1)
    expect(memory.facts[0]).toMatchObject({
      id: ITEM_A.id,
      text: ITEM_A.text,
      source: ITEM_A.source,
    })
    expect(memory.facts[0].createdAt).toBe(Date.parse(ITEM_A.created_at))
  })

  it('①b 真机面卡片逐条显示（不再是演示种子恒空）', async () => {
    vi.spyOn(getClientSetup().client, 'memoryList').mockResolvedValue({
      owner: 'user-a',
      count: 2,
      items: [ITEM_A, ITEM_B],
    })

    const wrapper = mount(MemoryCard, { global: { plugins: [i18n] } })
    await flushPromises()

    const rows = wrapper.findAll('.memory-fact-list li')
    expect(rows).toHaveLength(2)
    expect(wrapper.text()).toContain(ITEM_A.text)
    expect(wrapper.text()).toContain(ITEM_A.source)
    expect(wrapper.text()).toContain(ITEM_B.text)
  })

  it('②空表 ＋ 人话 note：显空态（不假装有数据）', async () => {
    vi.spyOn(getClientSetup().client, 'memoryList').mockResolvedValue({
      owner: '',
      count: 0,
      items: [],
      note: '未登录——记忆只对已证身份可见（fail-closed 空表）',
    })

    const wrapper = mount(MemoryCard, { global: { plugins: [i18n] } })
    await flushPromises()

    expect(wrapper.findAll('.memory-fact-list li')).toHaveLength(0)
    expect(wrapper.text()).toContain(zhCN.settings.memoryFactsEmpty)
    expect(wrapper.text()).toContain('未登录')
  })

  it('③服务端未就绪（-32601）⇒ 明说未就绪，不得静默成功', async () => {
    vi.spyOn(getClientSetup().client, 'memoryList').mockRejectedValue(
      new RpcError({ code: -32601, message: 'RPC -32601: method not found' }),
    )

    const memory = useMemoryStore()
    await memory.load()
    expect(memory.status).toBe('notReady')
    expect(memory.facts).toHaveLength(0)

    const wrapper = mount(MemoryCard, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain(zhCN.settings.memoryNotReady)
  })

  it('④失败可重试：error 显人话；重试成功 ⇒ 列表出现', async () => {
    const spy = vi
      .spyOn(getClientSetup().client, 'memoryList')
      .mockRejectedValueOnce(new RpcError({ code: -32603, message: 'RPC -32603: boom' }))
      .mockResolvedValue({ owner: 'user-a', count: 1, items: [ITEM_A] })

    const wrapper = mount(MemoryCard, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain(zhCN.settings.memoryLoadFailed)
    expect(wrapper.text()).toContain('boom')

    await wrapper.find('.memory-facts button').trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.memory-fact-list li')).toHaveLength(1)
    expect(wrapper.text()).toContain(ITEM_A.text)
  })

  it('⑤演示态保种子（旧行为零变）且零 RPC', async () => {
    useSettingsStore().setDemoMode(true)
    const spy = vi.spyOn(getClientSetup().client, 'memoryList')

    const wrapper = mount(MemoryCard, { global: { plugins: [i18n] } })
    await flushPromises()

    expect(spy).not.toHaveBeenCalled()
    expect(wrapper.findAll('.memory-fact-list li')).toHaveLength(3)
  })
})
