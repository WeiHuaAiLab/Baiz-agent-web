// DEBT-743（MSG-3168）红证：设置页「连接知识库」契约先行
// ①保存调用参数正确（base_url 归一＋api_key 原样＋token 随行）
// ②读取**不回显 key**（store/DOM 均无明文；只显「已配置」）
// ③错误态可重试（失败保留 → 重试成功）
// ④服务端未就绪（-32601）⇒ 显式「服务端未就绪」，**不得静默成功**
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { RpcError } from '../src/client/rpc'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { isValidKbBaseUrl, normalizeKbBaseUrl, useKbStore } from '../src/stores/kb'
import { useAuthStore } from '../src/stores/auth'
import KbCard from '../src/components/settings/KbCard.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

// 凭据纪律：测试只用明显假值，**不写真 key**
const FAKE_KEY = 'kb-test-key-not-real'
const BASE_URL = 'https://kb.example.test'

describe('DEBT-743 · base_url 归一（与 daemon normalize_base_url 同口径）', () => {
  it('去尾斜杠／剥尾段 /api/v1；合法性校验只认 http(s)', () => {
    expect(normalizeKbBaseUrl('  https://kb.ruiac.net/  ')).toBe('https://kb.ruiac.net')
    expect(normalizeKbBaseUrl('https://kb.ruiac.net/api/v1')).toBe('https://kb.ruiac.net')
    expect(normalizeKbBaseUrl('https://kb.ruiac.net/api/v1/')).toBe('https://kb.ruiac.net')
    expect(isValidKbBaseUrl('https://kb.ruiac.net')).toBe(true)
    expect(isValidKbBaseUrl('kb.ruiac.net')).toBe(false)
    expect(isValidKbBaseUrl('')).toBe(false)
  })
})

describe('DEBT-743 · 保存／读取／失败／未就绪（真径：client 注入）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('①保存调用参数正确：base_url 已归一、api_key 原样、token 随行（会话存在时）', async () => {
    const kbStore = useKbStore()
    const auth = useAuthStore()
    sessionStorage.setItem('baiz_session_token', 'sess-token-abc')
    auth.hydrate()

    const calls: Array<Record<string, unknown>> = []
    vi.spyOn(getClientSetup().client, 'weknoraSetConfig').mockImplementation(async (params) => {
      calls.push(params as unknown as Record<string, unknown>)
      return { ok: true, normalized_base_url: 'https://kb.example.test' }
    })

    // 用户可能把 /api/v1 也粘进来——前端归一后再上送（界面提示"只填到域名"）
    await kbStore.save(`${BASE_URL}/api/v1/`, FAKE_KEY)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      base_url: BASE_URL,
      api_key: FAKE_KEY,
      token: 'sess-token-abc',
    })
    expect(kbStore.status).toBe('saved')
    expect(kbStore.savedBaseUrl).toBe(BASE_URL)
    // 钉：store **不保留** key（零回显面）
    expect(JSON.stringify(kbStore.$state)).not.toContain(FAKE_KEY)
  })

  it('②读取不回显 key：只认 configured／key_fp；卡片只显「已配置」', async () => {
    const kbStore = useKbStore()
    vi.spyOn(getClientSetup().client, 'weknoraGetConfig').mockResolvedValue({
      base_url: BASE_URL,
      configured: true,
      source: 'file',
      key_set: true,
      key_fp: 'ab12…ef34',
    })

    await kbStore.load()

    expect(kbStore.status).toBe('ready')
    expect(kbStore.baseUrl).toBe(BASE_URL)
    expect(kbStore.configured).toBe(true)
    expect(JSON.stringify(kbStore.$state)).not.toContain(FAKE_KEY)

    const wrapper = mount(KbCard, { global: { plugins: [i18n] } })
    await flushPromises()
    const card = wrapper.find('.kb-card')
    expect(card.attributes('data-state')).toBe('ready')
    expect(wrapper.find('.kb-state').text()).toContain('已配置')
    // 卡面**绝不出现 key 明文**（输入框为空）
    expect(wrapper.find('input[name="kb-api-key"]').attributes('value')).toBeUndefined()
  })

  it('③错误态可重试：首次失败 ⇒ error；同页重试 ⇒ saved（且 key 输入被清）', async () => {
    const kbStore = useKbStore()
    const setConfig = vi
      .spyOn(getClientSetup().client, 'weknoraSetConfig')
      .mockRejectedValueOnce(new RpcError({ code: -32603, message: 'RPC -32603: disk full' }))
      .mockResolvedValue({ ok: true, normalized_base_url: BASE_URL })

    await kbStore.save(BASE_URL, FAKE_KEY)
    expect(kbStore.status).toBe('error')
    expect(kbStore.error).toContain('disk full')

    // 重试（同一入参）——失败不静默、可重放
    await kbStore.save(BASE_URL, FAKE_KEY)
    expect(setConfig).toHaveBeenCalledTimes(2)
    expect(kbStore.status).toBe('saved')

    // 卡片侧：保存成功后 key 输入被清空（读取面同时注入，避免卡在"未就绪"态）
    vi.spyOn(getClientSetup().client, 'weknoraGetConfig').mockResolvedValue({
      base_url: '',
      configured: false,
      source: 'none',
    })
    const wrapper = mount(KbCard, { global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.find('input[name="kb-base-url"]').setValue(BASE_URL)
    await wrapper.find('input[name="kb-api-key"]').setValue(FAKE_KEY)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect((wrapper.find('input[name="kb-api-key"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.html()).not.toContain(FAKE_KEY)
  })

  it('④服务端未就绪（-32601）⇒ 明说未就绪，**不得静默成功**', async () => {
    const kbStore = useKbStore()
    vi.spyOn(getClientSetup().client, 'weknoraGetConfig').mockRejectedValue(
      new RpcError({ code: -32601, message: 'RPC -32601: method not found' }),
    )

    await kbStore.load()

    expect(kbStore.status).toBe('notReady')
    expect(kbStore.configured).toBe(false)

    const wrapper = mount(KbCard, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.find('.kb-card').attributes('data-state')).toBe('notReady')
    expect(wrapper.find('.kb-msg.err').text()).toContain('服务端未就绪')
    expect(wrapper.html()).not.toContain('已保存') // 禁静默成功
  })

  it('保存遇未就绪（-32601）同样显式提示，不当成功', async () => {
    const kbStore = useKbStore()
    vi.spyOn(getClientSetup().client, 'weknoraSetConfig').mockRejectedValue(
      new RpcError({ code: -32601, message: 'RPC -32601: method not found' }),
    )
    await kbStore.save(BASE_URL, FAKE_KEY)
    expect(kbStore.status).toBe('notReady')
    expect(kbStore.savedBaseUrl).toBe('')
  })

  it('前端校验：非法域名／空 key 不上送（状态 invalid）', async () => {
    const kbStore = useKbStore()
    const spy = vi.spyOn(getClientSetup().client, 'weknoraSetConfig')
    await kbStore.save('kb.ruiac.net', FAKE_KEY)
    expect(kbStore.status).toBe('invalid')
    expect(kbStore.errorKey).toBe('invalidUrl')
    await kbStore.save(BASE_URL, '   ')
    expect(kbStore.errorKey).toBe('emptyKey')
    expect(spy).not.toHaveBeenCalled()
  })
})
