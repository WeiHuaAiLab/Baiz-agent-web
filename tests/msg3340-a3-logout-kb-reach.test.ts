// MSG-3340（1.0.20 批 A · A3）红证：**未登录态可达「连接知识库」＋ -32010／-32002 错误可见化**
//
// 病灶（改前，逐条实测）：
//  · 路由闸 `router.beforeEach` 放行面**只有** login ⇒ 未登录访问 /settings（含其中的
//    「连接知识库」卡）恒弹回 /login ⇒ 干净机开箱**配不了知识库**；
//  · 登录页那条 `errors.kbNotConfigured` 是**纯文本**（无可点入口）；
//  · 聊天状态条对 unauthorized 有「去设置」钮，`kbNotConfigured` **无入口** ⇒ 只报不说去哪。
//
// 本件五组断言（①③④⑤ 改前红／改后绿；② 两态**俱须绿**＝紧致度核心）：
//  ① 未登录 ⇒ `kb-setup`（连接知识库）**可达**
//  ② 对照 ⇒ 未登录 ⇒ 其余非登录路由（chat／working／settings）**仍弹回 login**
//  ③ 登录页「去配置知识库」**可点**，点击 ⇒ 到 `kb-setup`
//  ④ 聊天状态条 kbNotConfigured ⇒ 人话 ＋ **可点入口**（禁静默）；非 kb 类错误**不得**出现该入口
//  ⑤ 登录撞 -32010（帧 119B 族）⇒ 界面**显式人话**（不误报"账号密码错"）＋ 入口可点
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { router } from '../src/router'
import { resetClientForTests } from '../src/client/singleton'
import { RpcError } from '../src/client/rpc'
import { useAuthStore } from '../src/stores/auth'
import { mapRpcError } from '../src/utils/errors'
import LoginView from '../src/components/LoginView.vue'
import StatusMessage from '../src/components/chat/message/StatusMessage.vue'
import type { ChatMessage } from '../src/models'
import zhCN from '../src/locales/zh-CN'
import enUS from '../src/locales/en-US'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
})

// `auth.login` 内部是 **新建** client（`createDefaultClient()`）——不是单例
// ⇒ 单例 spy 无效（本件首跑实测红）。故在**模块面**替身：只让 authLogin 抛
// `-32010`（知识库未配置），其余（传输选择等）照原样。
vi.mock('../src/client/factory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/factory')>()
  return {
    ...actual,
    createDefaultClient: () => ({
      connect: async () => undefined,
      authLogin: async () => {
        const error = new Error('RPC -32010: KB_NOT_CONFIGURED') as Error & { code: number }
        error.code = -32010
        throw error
      },
    }),
  }
})

/** 未登录态唯一放行的非登录路由名（与 router 白名单同一口径） */
const KB_ROUTE = 'kb-setup'

function statusMessage(errorKey: string, text = ''): ChatMessage {
  return {
    id: 'm-3340',
    conversationId: 'c-3340',
    kind: 'status',
    text,
    createdAt: Date.now(),
    meta: { status: 'error', statusKey: 'sendFailed', errorKey },
  }
}

async function ensureLoggedOut() {
  sessionStorage.clear()
  useAuthStore().logout()
  await router.replace({ name: 'login' }).catch(() => undefined)
}

describe('MSG-3340 A3-① · 未登录可达「连接知识库」（**仅此一条**）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetClientForTests()
    await ensureLoggedOut()
  })

  it('①未登录 ⇒ kb-setup 可达（改前红）', async () => {
    await router.push({ name: KB_ROUTE })
    expect(router.currentRoute.value.name).toBe(KB_ROUTE)
  })

  it('②对照：未登录 ⇒ 其余非登录路由仍弹回 login（紧致度核心·两态俱须绿）', async () => {
    for (const name of ['chat', 'working', 'settings']) {
      await router.push({ name })
      expect(router.currentRoute.value.name, `route=${name} 未登录必须弹回 login`).toBe('login')
    }
  })

  it('③登录页「去配置知识库」可点，点击 ⇒ kb-setup', async () => {
    const wrapper = mount(LoginView, { global: { plugins: [i18n, router] } })
    const entry = wrapper.find('.login-kb-entry')
    expect(entry.exists()).toBe(true)
    await entry.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe(KB_ROUTE)
  })

  it('③b 已登录态不受影响：登录态下 chat／settings 直通', async () => {
    const auth = useAuthStore()
    sessionStorage.setItem('baiz_session_token', 'tok-3340')
    expect(auth.hydrate()).toBe(true)
    await router.push({ name: 'settings' })
    expect(router.currentRoute.value.name).toBe('settings')
  })
})

describe('MSG-3340 A3-② · -32010／-32002 错误可见化（禁静默）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetClientForTests()
    await ensureLoggedOut()
  })

  it('④聊天状态条 kbNotConfigured ⇒ 人话 ＋ 入口可点（改前红：无入口）', async () => {
    const wrapper = mount(StatusMessage, {
      props: { message: statusMessage('kbNotConfigured', 'RPC -32010: KB_NOT_CONFIGURED') },
      global: { plugins: [i18n, router] },
    })
    // 人话：点名"知识库"＋下一步去哪（不是"未授权，请检查 API Key"）
    expect(wrapper.text()).toContain('知识库')
    expect(wrapper.text()).toContain('连接知识库')
    const entry = wrapper.find('.status-kb-entry')
    expect(entry.exists()).toBe(true)
    await entry.trigger('click')
    await flushPromises()
    // 入口走**未登录也可达**的 kb-setup（会话刚失效时 /settings 会被闸弹回）
    expect(router.currentRoute.value.name).toBe(KB_ROUTE)
  })

  it('④b 反例对照：非 kb 类错误**不得**出现该入口（防"到处都放一个钮"）', async () => {
    const wrapper = mount(StatusMessage, {
      props: { message: statusMessage('network', 'failed to fetch') },
      global: { plugins: [i18n, router] },
    })
    expect(wrapper.find('.status-kb-entry').exists()).toBe(false)
  })

  it('⑤登录撞 -32010 ⇒ 登录页显式人话 ＋ 入口可点（**不误报**账号密码错）', async () => {
    const auth = useAuthStore()

    const ok = await auth.login('nobody@example.test', 'not-a-real-password')

    expect(ok).toBe(false)
    expect(auth.kbNotConfigured).toBe(true)
    expect(auth.error).not.toContain('账号密码')

    const wrapper = mount(LoginView, { global: { plugins: [i18n, router] } })
    expect(wrapper.find('.login-kb').text()).toContain('知识库')
    expect(wrapper.find('.login-kb-entry').exists()).toBe(true)
  })

  it('⑤b -32010／-32002 映射人话键（文案含"下一步"）', () => {
    expect(
      mapRpcError(new RpcError({ code: -32010, message: 'RPC -32010: KB_NOT_CONFIGURED' })).key,
    ).toBe('kbNotConfigured')
    expect(
      mapRpcError(
        new RpcError({
          code: -32002,
          message: 'RPC -32002: 会话已失效或服务端重启后身份不可证——请重新登录',
        }),
      ).key,
    ).toBe('sessionExpired')
    expect(
      mapRpcError(new RpcError({ code: -32002, message: 'RPC -32002: invalid api key' })).key,
    ).toBe('unauthorized')
    // 文案面：三键各给"下一步"（知识库／重新登录／API Key），且**互不串台**
    expect(zhCN.errors.kbNotConfigured).toContain('连接知识库')
    expect(zhCN.errors.kbNotConfigured).not.toContain('API Key 有效性')
    expect(zhCN.errors.sessionExpired).toContain('重新登录')
    expect(zhCN.errors.unauthorized).toContain('API Key')
    expect(enUS.errors.kbNotConfigured.length).toBeGreaterThan(0)
    expect(enUS.errors.goKbSetup.length).toBeGreaterThan(0)
  })
})
