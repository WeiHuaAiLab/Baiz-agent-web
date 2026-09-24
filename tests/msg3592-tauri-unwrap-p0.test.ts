// **MSG-3592 · P0 红证／绿证**：装机（tauri）径 **少解包一层** ⇒ `auth.login` 读不到 `user_id`
// ⇒ 本批 P2 的 `rememberAccountLogin(email, undefined)` 抛 `Cannot read properties of undefined (reading 'trim')`
// ⇒ **老板真机「登录即崩」**（原话逐字见令件）。
//
// 判据（红＝改前必红；绿＝本支必绿）：
//   Δ1 tauri 径 `request()` 须与 http 径**同口径解包**（信封 ⇒ 只回 `result`）；
//   Δ2 信封内 `error` ⇒ **抛 `RpcError`**（码/文案照录），禁把错误当成功返回；
//   Δ3 同一信封下 **http 径与 tauri 径返回逐字同**（口径单一）；
//   Δ4 **`auth.login` 成功但缺 `user_id`** ⇒ **不崩**（兜底空串）且登录仍成功；
//   Δ5 纯函数兜底：`rememberAccountLogin`／`accountSegment`／`canonicalAccountLiterals` 传 `undefined` **不抛**。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

import { createTauriTransport } from '../src/client/transports/tauri'
import { createHttpTransport } from '../src/client/transports/http'
import { resetClientForTests } from '../src/client/singleton'
import { resetBridgeForTests } from '../src/bridge'
import { useAuthStore } from '../src/stores/auth'
import { accountSegment } from '../src/db/segment'
import { canonicalAccountLiterals, rememberAccountLogin } from '../src/db/alias'
import type { RpcRequest } from '../src/client/rpc'

const LOGIN_ENVELOPE = {
  jsonrpc: '2.0',
  id: 1,
  result: { session_token: 'tok-3592', user_id: 'uid-3592', provider: 'weknora' },
}

function req(method: string, id = 1): RpcRequest {
  return { jsonrpc: '2.0', id, method, params: {} }
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetClientForTests()
  invokeMock.mockReset()
  localStorage.clear()
  sessionStorage.clear()
})

describe('MSG-3592 P0 · tauri 径解包与登录不崩', () => {
  it('Δ1 tauri 径须解包：信封 ⇒ 只回 result（改前回整包 ⇒ 红）', async () => {
    const tauri = createTauriTransport()
    await tauri.connect()
    invokeMock.mockResolvedValue(LOGIN_ENVELOPE)

    const out = await tauri.request(req('auth.login'))
    expect(out, 'tauri 径须与 http 径同口径：回 result 本体').toEqual(LOGIN_ENVELOPE.result)
    expect((out as { user_id?: string }).user_id, 'user_id 须取得到').toBe('uid-3592')
  })

  it('Δ2 信封内 error ⇒ 抛 RpcError（改前当成功返回整包 ⇒ 红）', async () => {
    const tauri = createTauriTransport()
    await tauri.connect()
    invokeMock.mockResolvedValue({
      jsonrpc: '2.0',
      id: 9,
      error: { code: -32002, message: 'unauthorized: token 无效或缺失' },
    })

    await expect(tauri.request(req('schedule.list', 9))).rejects.toMatchObject({
      code: -32002,
    })
  })

  it('Δ3 同一信封下 http 径与 tauri 径返回逐字同（口径单一）', async () => {
    const tauri = createTauriTransport()
    await tauri.connect()
    invokeMock.mockResolvedValue(LOGIN_ENVELOPE)
    const http = createHttpTransport({ baseUrl: 'http://127.0.0.1:1' })
    const fetchMock = vi.fn(async () => ({ json: async () => LOGIN_ENVELOPE }))
    vi.stubGlobal('fetch', fetchMock)

    const fromTauri = await tauri.request(req('auth.login'))
    const fromHttp = await http.request(req('auth.login'))
    expect(fromTauri, '两径须逐字同（改前：http=result／tauri=整包 ⇒ 红）').toEqual(fromHttp)
    vi.unstubAllGlobals()
  })

  it('Δ4 auth.login 成功但缺 user_id ⇒ 不崩（兜底空串）且登录仍成功', async () => {
    // 装机运行面：`__TAURI_INTERNALS__` 在场 ⇒ 传输选 tauri（走 mock 掉的 invoke）
    ;(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    const { createTauriBridge } = await import('../src/bridge/tauri')
    resetBridgeForTests(createTauriBridge())
    invokeMock.mockResolvedValue({
      jsonrpc: '2.0',
      id: 1,
      result: { session_token: 'tok-3592', provider: 'weknora' }, // ★ 刻意缺 user_id
    })

    const auth = useAuthStore()
    const ok = await auth.login('acct-3592@example.test', 'pw-3592-not-real')
    expect(ok, '①缺 user_id 亦不得崩（改前：rememberAccountLogin 取 undefined.trim() ⇒ 抛 ⇒ 红）').toBe(true)
    expect(auth.sessionToken, '②令牌须真取到（解包生效）').toBe('tok-3592')
    expect(auth.userId, '③兜底＝空串（非 undefined）').toBe('')
    expect(auth.error).toBe('')

    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  it('Δ5 纯函数兜底：传 undefined 不抛（空 ⇒ 不写别名·段仍为串）', () => {
    const undef = undefined as unknown as string
    expect(() => rememberAccountLogin('acct-3592@example.test', undef), '别名写入点不得抛').not.toThrow()
    expect(rememberAccountLogin('acct-3592@example.test', undef), '缺 uid ⇒ 按邮箱形兜底').not.toBe('')
    expect(() => accountSegment(undef), '库名段不得抛').not.toThrow()
    expect(typeof accountSegment(undef)).toBe('string')
    expect(canonicalAccountLiterals(undef), '空账号 ⇒ 空集（不猜）').toEqual([])
  })
})
