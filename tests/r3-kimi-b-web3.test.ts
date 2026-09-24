// **补席 B（web）· KIMI 三处点名**的红证／绿证（1.0.26 出件前必补）：
//
//   ①【**真漏闸**】`components/chat/CreateChat.vue` 的创建径**不查** `files.attachmentsSendable`
//      ⇒ 超限件以**元信息形态**（无 content／dataUrl，只剩 name/size）照样随
//        `messages.sendUserMessage` 上送——＝「大附件」那件**只修了一半**：
//        `ChatInput.sendWith` 有闸，创建页没有；而创建页的提交入口（回车／`form submit`）
//        只按 `!text.trim()` 拦 ⇒ 界面上写着"超限·不可发送"，回车却照发。
//   ②【部分成立】登录败面：**网络错／5xx 原文透传**（`Failed to fetch`／`http stream failed: 500`／
//      `transport not connected` 这类机器语糊在登录页上）；**校验文案硬编码中文**
//      （en-US 用户切了语言照样看中文）。
//   ③【部分成立】记忆 `source` **缺字段无兜底** ⇒ 屏上只剩"来源："（或 `undefined`）。
//
// 判据（令 §一）：① 超限即**不发**并给人话（与 `ChatInput` 既有口径一致）；②(a) 网络错／5xx 转人话、
// (b) 文案走 i18n；③ 缺字段给兜底文案。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { RpcError } from '../src/client/rpc'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { isTransportFailure, validateLoginInput } from '../src/utils/authFailure'
import { setI18nRuntime } from '../src/locales/runtime'
import { useAuthStore } from '../src/stores/auth'
import { useFilesStore } from '../src/stores/files'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import { useUiStore } from '../src/stores/ui'
import { useWorkspaceStore } from '../src/stores/workspace'
import CreateChat from '../src/components/chat/CreateChat.vue'
import MemoryCard from '../src/components/settings/MemoryCard.vue'
import zhCN from '../src/locales/zh-CN'
import enUS from '../src/locales/en-US'

// ── 登录径：可控假 client（②用）─────────────────────────────────────────────
// 真链（`createClient`＋传输）在 jsdom 里取不到 daemon，错误字面随环境漂 ⇒ 用假 client
// **钉死**三类字面：连不上（fetch 失败）／5xx（http stream failed: 503）／RPC 码面。
// 口径照 `tests/r2-wave1-t11-t3.test.ts:36-45`（同一 `vi.mock`＋`importOriginal` 法）。
const loginBehavior: { mode: 'ok' | 'network' | 'rpc'; error: unknown } = {
  mode: 'ok',
  error: null,
}

vi.mock('../src/client/factory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/factory')>()
  return {
    ...actual,
    createDefaultClient: () => ({
      connect: async () => {
        if (loginBehavior.mode === 'network') throw new TypeError('Failed to fetch')
      },
      authLogin: async () => {
        if (loginBehavior.mode === 'rpc') throw loginBehavior.error
        return { session_token: 'tok-r3', user_id: 'u-r3', provider: 'weknora' }
      },
    }),
  }
})

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
})

/** 超限件替身：只给 `attachFromFiles` 真正会读的三字段——**故意不给 `text()`/FileReader 面**，
 *  以此证明"超限件一步都不读"（若代码仍去读，本替身直接抛 TypeError ⇒ 红）。
 *  同 `tests/r2-wave1-t11-t3.test.ts:56-58`。 */
function oversizeStub(size: number, name = 'big.png', type = 'image/png') {
  return { name, type, size } as unknown as File
}

/** 正常文本件替身——本仓 jsdom 的 `File.prototype.text` 不存在（`r2-wave1-t11-t3.test.ts:60-72`
 *  有探针实测），故补齐 store 真会用的面。 */
function fileStub(name: string, body: string, type = 'text/plain') {
  return {
    name,
    type,
    size: new TextEncoder().encode(body).length,
    text: async () => body,
  } as unknown as File
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetClientForTests()
  sessionStorage.clear()
  localStorage.clear()
  loginBehavior.mode = 'ok'
  loginBehavior.error = null
})

afterEach(() => {
  // 复位取词口：不给同文件其他用例留下"已登记"的假 i18n 面
  setI18nRuntime(null)
})

// ───────────────────────── ① 创建页发送闸 ─────────────────────────
describe('① CreateChat：超限件不得随创建径上送（与 ChatInput 同口径）', () => {
  it('①a 超限在列 ⇒ 零上送、零建会话、人话、输入与附件原地保留', async () => {
    const files = useFilesStore()
    const messages = useMessageStore()
    const session = useSessionStore()
    const ui = useUiStore()
    const create = vi.spyOn(session, 'create').mockResolvedValue('c-r3')
    const send = vi.spyOn(messages, 'sendUserMessage').mockResolvedValue(undefined)
    await files.attachFromFiles([oversizeStub(9 * 1024 * 1024)])
    ui.openCreate('session')

    const w = mount(CreateChat, { global: { plugins: [i18n] } })
    await w.find('textarea').setValue('看这个附件')
    await w.find('form.composer').trigger('submit')
    await flushPromises()

    // 改前：本径不查 `attachmentsSendable` ⇒ 超限件照发（且会话先建出来）
    expect(send, '超限 ⇒ 一条都不许上送').not.toHaveBeenCalled()
    expect(create, '超限 ⇒ 连会话都不许建（否则留一条空会话）').not.toHaveBeenCalled()
    expect(files.attachments, '附件须原地保留（不清场）').toHaveLength(1)
    expect(w.find('textarea').element.value, '草稿须原地保留').toBe('看这个附件')
    expect(
      useUiStore().toasts.map((item) => item.message).join('|'),
      '拦下须给人话（与 ChatInput 同一句）',
    ).toContain('超限，暂不可发送')
  })

  it('①b 正常附件 ⇒ 照常建会话并随首条消息上送（闸只挡超限，不误伤）', async () => {
    const files = useFilesStore()
    const messages = useMessageStore()
    const session = useSessionStore()
    const ui = useUiStore()
    const create = vi.spyOn(session, 'create').mockResolvedValue('c-r3')
    const send = vi.spyOn(messages, 'sendUserMessage').mockResolvedValue(undefined)
    await files.attachFromFiles([fileStub('ok.txt', 'ok')])
    ui.openCreate('session')

    const w = mount(CreateChat, { global: { plugins: [i18n] } })
    await w.find('textarea').setValue('正常一条')
    await w.find('form.composer').trigger('submit')
    await flushPromises()

    expect(create).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][3], '附件须随首条消息上送').toHaveLength(1)
    expect(files.attachments, '发出后乐观清理照旧').toHaveLength(0)
    expect(ui.createMode, '建完即回会话视图').toBe('')
  })

  it('①c 任务径：超限件在列也**不设闸**（该径不上送附件，闸设在此即误伤）', async () => {
    const files = useFilesStore()
    const workspace = useWorkspaceStore()
    const ui = useUiStore()
    const addTask = vi.spyOn(workspace, 'addPlainTask')
    await files.attachFromFiles([oversizeStub(9 * 1024 * 1024)])
    ui.openCreate('task')

    const w = mount(CreateChat, { global: { plugins: [i18n] } })
    await w.find('textarea').setValue('记一项任务')
    await w.find('form.composer').trigger('submit')
    await flushPromises()

    expect(addTask, '任务径只落文本 ⇒ 不受附件闸影响').toHaveBeenCalledTimes(1)
    expect(
      useUiStore().toasts.map((item) => item.message).join('|'),
      '任务径无"不可发送"一说 ⇒ 不得误报',
    ).not.toContain('超限，暂不可发送')
  })
})

// ───────────────────────── ② 登录败面人话 ＋ i18n ─────────────────────────
describe('② 登录败面：网络错／5xx 转人话；文案走 i18n', () => {
  it('②a-1 纯函数判据：传输面／5xx 命中；账号密码族与裸数字不误伤', () => {
    for (const bad of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'Load failed',
      'http stream failed: 500',
      'http stream failed: 503',
      'transport not connected',
      'RPC -32603: transport not connected',
      '未连接本地服务：本构建未配置网关（VITE_BAIZ_GATEWAY），也未开启演示模式（VITE_BAIZ_DEMO=1）',
      `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
      'malformed rpc response for auth.login',
      'request timed out',
    ]) {
      expect(isTransportFailure(bad), `「${bad}」属连不上／服务端无可用应答`).toBe(true)
    }
    for (const good of [
      '',
      'no mock result for auth.login',
      '登录失败，请检查账号密码',
      '账号或密码不正确',
      'unauthorized',
      'KB_NOT_CONFIGURED',
      '附件超过 500 字节', // 裸数字**不得**判 5xx（否则反而盖掉真因）
    ]) {
      expect(isTransportFailure(good), `「${good}」不是传输面 ⇒ 不得归类`).toBe(false)
    }
  })

  it('②a-2 网络错 ⇒ 上屏人话（`Failed to fetch` 零透传）', async () => {
    loginBehavior.mode = 'network'
    const auth = useAuthStore()

    const ok = await auth.login('acct-r3@example.test', 'pw-r3-not-real')

    expect(ok).toBe(false)
    expect(auth.sessionToken).toBe('')
    // 改前：`raw.replace(...)` 后直接上屏 ⇒ 登录页写着 "Failed to fetch"
    expect(auth.error, '机器语不得上屏').not.toContain('fetch')
    expect(auth.error, '须给"连不上服务＋下一步"').toContain('连不上服务')
    expect(auth.loading).toBe(false)
  })

  it('②a-3 5xx ⇒ 同上人话；其余码面照旧（daemon 安全词仍透出，不回流）', async () => {
    loginBehavior.mode = 'rpc'
    const auth = useAuthStore()

    // 注：`RpcError` 构造器**自己会拼** `RPC {code}: ` 前缀（`client/rpc.ts:57`）——
    // 此处一律给**裸词**，拼出来的报文与真机一致（给带前缀的串会拼成双前缀）。
    loginBehavior.error = new RpcError({ code: -32603, message: 'http stream failed: 503' })
    expect(await auth.login('acct-r3@example.test', 'pw-r3-not-real')).toBe(false)
    expect(auth.error).toContain('连不上服务')
    expect(auth.error).not.toContain('503')
    expect(auth.error).not.toContain('http stream failed')

    // 非传输面**不得**被本闸吞掉：daemon 安全词照旧上屏（MSG-2311 口径零变）
    loginBehavior.error = new RpcError({ code: -32001, message: '账号或密码不正确' })
    expect(await auth.login('acct-r3@example.test', 'pw-r3-not-real')).toBe(false)
    expect(auth.error).toBe('账号或密码不正确')

    // mock 内部语仍回落通用词（改前字面逐字不变——存量断言见 `tests/auth.test.ts:49`）
    loginBehavior.error = new RpcError({ code: -32601, message: 'no mock result for auth.login' })
    expect(await auth.login('acct-r3@example.test', 'pw-r3-not-real')).toBe(false)
    expect(auth.error).toBe('登录失败，请检查账号密码')
  })

  it('②b-1 非组件面取词口**真接线**：登记 i18n 后文案随 locale 走（改前硬编码 ⇒ 必红）', async () => {
    setI18nRuntime({ t: (key: string) => `[${key}]` })

    // 校验三句（纯函数面）
    expect(validateLoginInput('', 'pw')).toBe('[login.needAccount]')
    expect(validateLoginInput('asdf', 'pw')).toBe('[login.badAccount]')
    expect(validateLoginInput('you@example.com', '')).toBe('[login.needPassword]')
    // 登录败词（store 面）
    loginBehavior.mode = 'network'
    const auth = useAuthStore()
    expect(await auth.login('acct-r3@example.test', 'pw-r3-not-real')).toBe(false)
    expect(auth.error).toBe('[login.unreachable]')
  })

  it('②b-2 两语键位齐备且 en-US **无中文残留**（en-US 用户不再看中文）', () => {
    for (const key of ['needAccount', 'badAccount', 'needPassword', 'failed', 'unreachable'] as const) {
      expect(zhCN.login[key].length, `zh-CN 缺 login.${key}`).toBeGreaterThan(0)
      expect(enUS.login[key].length, `en-US 缺 login.${key}`).toBeGreaterThan(0)
      expect(enUS.login[key], `en-US.login.${key} 不得是中文`).not.toMatch(/[一-鿿]/)
    }
    // zh-CN 字面**逐字未变**（存量断言 `tests/auth.test.ts:49` / `r2-wave1-t11-t3.test.ts:257-262` 钉死）
    expect(zhCN.login.failed).toBe('登录失败，请检查账号密码')
    expect(zhCN.login.needAccount).toBe('请输入账号')
    expect(zhCN.login.needPassword).toBe('请输入密码')
    expect(zhCN.login.badAccount).toContain('账号格式不对')
  })
})

// ───────────────────────── ③ 记忆来源兜底 ─────────────────────────
describe('③ 记忆来源：daemon 未回 source ⇒ 兜底文案（不显空白/undefined）', () => {
  it('③a 缺 source ⇒ 屏上"来源：未标注"', async () => {
    // 故意给一条**没有 source** 的 wire 件（daemon 侧字段缺失的形态）
    const noSource = {
      id: 'm-nosrc',
      text: '客户 A 公司偏好每周一上午收到周报',
      created_at: '2026-09-23T05:00:00+00:00',
    }
    vi.spyOn(getClientSetup().client, 'memoryList').mockResolvedValue({
      owner: 'user-a',
      count: 1,
      items: [noSource as never],
    })

    const w = mount(MemoryCard, { global: { plugins: [i18n] } })
    await flushPromises()

    const rows = w.findAll('.memory-fact-list li')
    expect(rows).toHaveLength(1)
    // 改前：直出 `{{ fact.source }}` ⇒ 只剩"来源："（看着像渲染坏了）
    expect(rows[0].find('.fact-source').text(), '缺字段须给兜底文案').toBe('来源：未标注')
    expect(w.text(), '不得显 undefined').not.toContain('undefined')
  })

  it('③b 有 source ⇒ 原样显示（兜底不误伤）', async () => {
    vi.spyOn(getClientSetup().client, 'memoryList').mockResolvedValue({
      owner: 'user-a',
      count: 1,
      items: [
        {
          id: 'm-hassrc',
          text: '常用项目目录在 F 盘',
          source: 'conv-1',
          created_at: '2026-09-23T05:00:00+00:00',
        },
      ],
    })

    const w = mount(MemoryCard, { global: { plugins: [i18n] } })
    await flushPromises()

    expect(w.findAll('.memory-fact-list li')[0].find('.fact-source').text()).toBe('来源：conv-1')
  })
})
