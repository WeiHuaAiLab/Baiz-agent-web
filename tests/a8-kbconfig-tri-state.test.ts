// DEBT-875（MSG-3502·A8）红证：**读回失败／未就绪时谎称"未配置"（＋空表单）**
//
// 病灶（测试员 T3c"关闭软件重开配置就为空"的**观感源**，与 `MSG-3494` 勘定件 §②A8 一致）：
//   `KbCard.vue` 的状态行旧式为 `kb.configured ? 已配置 : 未配置`——**只看 configured 布尔**：
//     · 读回**失败**（`status='error'`，如会话失效／daemon 未连）⇒ `configured` 仍为 false
//       ⇒ 状态行写 **"未配置"**，且 base_url 输入框留空 ⇒ 用户看到"配置**变空了**"；
//     · **服务端未就绪**（`-32601`）同理 ⇒ 仍写"未配置"；
//     · 首帧 `idle/loading` 也写"未配置"（闪烁误导）。
//   ⇒ 真值：**"读不到" ≠ "没配过"**——两者必须分开说。
//
// 判据（改前必红／改后必绿）：
//   ① 读回失败 ⇒ 状态行必显「读取失败（可重试）」，**不得**出现「未配置」；
//   ② 服务端未就绪 ⇒ 状态行必显「未就绪」，**不得**出现「未配置」；
//   ③ 真·未配置（读回成功且服务端判未配置）⇒ 仍显「未配置」（**不得**反过来把正常态说成失败）；
//   ④ 已配置 ⇒ 仍显「已配置」（不回退）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { RpcError } from '../src/client/rpc'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import KbCard from '../src/components/settings/KbCard.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

async function mountWith(loadImpl: () => Promise<never> | Promise<unknown>) {
  vi.spyOn(getClientSetup().client, 'weknoraGetConfig').mockImplementation(
    loadImpl as () => Promise<never>,
  )
  const wrapper = mount(KbCard, { global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetClientForTests()
})

describe('A8 · 状态行三态分开（读不到 ≠ 没配过）', () => {
  it('①读回失败（断连）⇒ 显「读取失败（可重试）」，不得显「未配置」', async () => {
    const wrapper = await mountWith(() =>
      Promise.reject(new RpcError({ code: -32603, message: 'RPC -32603: transport not connected' })),
    )
    expect(wrapper.find('.kb-card').attributes('data-state')).toBe('error')
    const line = wrapper.find('.kb-state').text()
    expect(
      line,
      `改前谎称：读回失败却写状态行"${line}"——正是"配置重开就变空"的观感源`,
    ).toContain('读取失败')
    expect(line).not.toContain('未配置')
  })

  it('②服务端未就绪（-32601）⇒ 显「未就绪」，不得显「未配置」', async () => {
    const wrapper = await mountWith(() =>
      Promise.reject(new RpcError({ code: -32601, message: 'RPC -32601: method not found' })),
    )
    expect(wrapper.find('.kb-card').attributes('data-state')).toBe('notReady')
    const line = wrapper.find('.kb-state').text()
    expect(line).toContain('未就绪')
    expect(line).not.toContain('未配置')
  })

  it('③真·未配置（读回成功且判未配置）⇒ 仍显「未配置」', async () => {
    const wrapper = await mountWith(() =>
      Promise.resolve({ base_url: '', configured: false, source: 'none' }),
    )
    expect(wrapper.find('.kb-card').attributes('data-state')).toBe('unconfigured')
    expect(wrapper.find('.kb-state').text()).toContain('未配置')
  })

  it('④已配置 ⇒ 仍显「已配置」（且带指纹，零明文）', async () => {
    const wrapper = await mountWith(() =>
      Promise.resolve({
        base_url: 'https://kb.example.test',
        configured: true,
        source: 'file',
        key_set: true,
        key_fp: 'ab12…ef34',
      }),
    )
    const line = wrapper.find('.kb-state').text()
    expect(line).toContain('已配置')
    expect(line).toContain('ab12…ef34')
  })
})
