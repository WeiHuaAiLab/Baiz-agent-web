// DEBT-738（MSG-3148）红证：**mock 静默兜底 ⇒ 假登录**
// ① 生产禁兜底：resolveTransportChoice 生产 ⇒ 'none'；createDefaultTransport 显式抛错
// ② 界面常显模式：演示态登录页挂「演示模式（未连接）」角标（肉眼可辨）
// ③ `mock-` token 到 daemon ⇒ 拒：HTTP 客户端带 mock- token 时**原样上抛** daemon 的
//    UNAUTHORIZED（-32002），前端不吞、不转成功；登录失败不落 token
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import {
  NoDaemonTransportError,
  createDefaultTransport,
  resolveTransportChoice,
} from '../src/client/factory'
import { createClient } from '../src/client/index'
import { createHttpTransport } from '../src/client/transports/http'
import { RpcError } from '../src/client/rpc'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { useAuthStore } from '../src/stores/auth'
import { useSettingsStore } from '../src/stores/settings'
import LoginView from '../src/components/LoginView.vue'
import { router } from '../src/router'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('① 生产禁兜底 mock（假登录根因）', () => {
  it('生产（dev=false）＋无网关＋无演示开关 ⇒ none（绝不回落 mock）', () => {
    expect(resolveTransportChoice({ runtime: 'web', dev: false })).toBe('none')
    expect(resolveTransportChoice({ runtime: 'web', dev: false, gateway: '' })).toBe('none')
    expect(resolveTransportChoice({ runtime: 'web', dev: false, gateway: '   ' })).toBe('none')
    expect(resolveTransportChoice({ runtime: 'web', dev: false, demo: '0' })).toBe('none')
  })

  it('演示**必须显式**：VITE_BAIZ_DEMO=1 或 dev 构建', () => {
    expect(resolveTransportChoice({ runtime: 'web', dev: true })).toBe('mock')
    expect(resolveTransportChoice({ runtime: 'web', dev: false, demo: '1' })).toBe('mock')
  })

  it('tauri 运行时与显式网关优先', () => {
    expect(resolveTransportChoice({ runtime: 'tauri', dev: false })).toBe('tauri')
    expect(
      resolveTransportChoice({ runtime: 'web', dev: false, gateway: 'http://127.0.0.1:9' }),
    ).toBe('http')
  })

  it('createDefaultTransport：生产 env ⇒ 抛 NoDaemonTransportError（显式失败，非演示）', () => {
    vi.stubEnv('VITE_BAIZ_GATEWAY', '')
    vi.stubEnv('VITE_BAIZ_DEMO', '')
    vi.stubEnv('DEV', '' as unknown as string) // 模拟生产构建（DEV 非 true）
    expect(() => createDefaultTransport()).toThrow(NoDaemonTransportError)
  })

  it('createDefaultTransport：显式演示开关 ⇒ mock（演示仍可用，但需显式）', () => {
    vi.stubEnv('VITE_BAIZ_DEMO', '1')
    expect(createDefaultTransport().kind).toBe('mock')
  })
})

describe('② 界面常显连接模式（演示态肉眼可辨）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('演示态登录页挂「演示模式（未连接）」角标', () => {
    const settings = useSettingsStore()
    settings.setDemoMode(true)
    const wrapper = mount(LoginView, { global: { plugins: [i18n, router] } })
    expect(wrapper.find('.login-mode').text()).toBe('演示模式（未连接）')
  })

  it('非演示态登录页不挂该角标（真连 daemon 时不得混淆）', () => {
    const settings = useSettingsStore()
    settings.setDemoMode(false)
    const wrapper = mount(LoginView, { global: { plugins: [i18n, router] } })
    expect(wrapper.find('.login-mode').exists()).toBe(false)
  })
})

describe('③ mock- token 到 daemon 必须被拒（红证）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('HTTP 客户端带 mock- token 调 chat.send ⇒ 原样上抛 UNAUTHORIZED(-32002)，不吞不转成功', async () => {
    let seenAuth = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? '')
        // 模拟 1.0.16 daemon fail-closed 应答（handler.rs 707-753：非 weknora 凭据即拒）
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32002, message: 'unauthorized' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )
    const transport = createHttpTransport({ baseUrl: 'http://127.0.0.1:9', token: 'mock-abc123' })
    const client = createClient(transport)

    await expect(
      client.chatSend({ message: 'hi', conversation_id: 'c1' }),
    ).rejects.toMatchObject({ code: -32002 })
    // token 确实以 Bearer 形式递到服务端（拒的是 daemon，不是前端悄悄放行）
    expect(seenAuth).toBe('Bearer mock-abc123')
  })

  it('生产 env（无网关无演示）登录 ⇒ 取不到传输即失败（fail-closed），不落任何 token', async () => {
    vi.stubEnv('VITE_BAIZ_GATEWAY', '')
    vi.stubEnv('VITE_BAIZ_DEMO', '')
    vi.stubEnv('DEV', '' as unknown as string)
    const auth = useAuthStore()
    const ok = await auth.login('随便一个账号', '随便一个密码')
    expect(ok).toBe(false)
    expect(auth.sessionToken).toBe('')
  })

  it('网关可达但 daemon 拒：UNAUTHORIZED(-32002) ⇒ login() 返回 false，不落 token', async () => {
    vi.stubEnv('VITE_BAIZ_GATEWAY', 'http://127.0.0.1:9')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              error: { code: -32002, message: 'unauthorized' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    )
    const auth = useAuthStore()
    const ok = await auth.login('随便一个账号', '随便一个密码')
    expect(ok).toBe(false)
    expect(auth.sessionToken).toBe('')
  })
})
