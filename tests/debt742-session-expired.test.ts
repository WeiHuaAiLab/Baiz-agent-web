// DEBT-742（MSG-3163）红证：`-32002` **文案分流 ＋ 自愈 ＋ 不再用旧 token 重发**
// 现状（旧）：`mapRpcError` 一律 `unauthorized` ⇒ 文案「未授权，请检查 API Key」
// （把用户引到 KEY 上）；且全仓无清 token 动作 ⇒ 失效 token 一直被随行重发。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mapRpcError } from '../src/utils/errors'
import { isSessionExpiredMessage } from '../src/utils/errors'
import { RpcError } from '../src/client/rpc'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { useAuthStore } from '../src/stores/auth'
import { useMessageStore } from '../src/stores/message'
import zhCN from '../src/locales/zh-CN'
import enUS from '../src/locales/en-US'

const DAEMON_SESSION_EXPIRED =
  'RPC -32002: 会话已失效或服务端重启后身份不可证——请重新登录'
const TOKEN_KEY = 'baiz_session_token'

describe('DEBT-742 ①文案按语义分流（-32002 两义）', () => {
  it('会话失效语义 ⇒ sessionExpired（"重新登录"族），**非** KEY 族', () => {
    const mapped = mapRpcError(new RpcError({ code: -32002, message: DAEMON_SESSION_EXPIRED }))
    expect(mapped.key).toBe('sessionExpired')
    expect(zhCN.errors.sessionExpired).toContain('重新登录')
    expect(zhCN.errors.sessionExpired).not.toContain('API Key')
    expect(enUS.errors.sessionExpired.toLowerCase()).toContain('sign in')
    expect(isSessionExpiredMessage(DAEMON_SESSION_EXPIRED)).toBe(true)
  })

  it('真正的未授权（凭据面）⇒ 仍走 unauthorized（KEY 族）', () => {
    const mapped = mapRpcError(new RpcError({ code: -32002, message: 'RPC -32002: invalid api key' }))
    expect(mapped.key).toBe('unauthorized')
    expect(zhCN.errors.unauthorized).toContain('API Key')
  })
})

describe('DEBT-742 ②自愈 ③不再用旧 token 重发（真径：发送败面）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    sessionStorage.clear()
  })

  it('-32002 假应答 ⇒ 文案为重新登录族 ＋ token 被清 ＋ 下一发不带旧 token', async () => {
    const messages = useMessageStore()
    const auth = useAuthStore()
    // 前置：登录态（token 同时在 store 与 sessionStorage——与真机一致）
    sessionStorage.setItem(TOKEN_KEY, 'old-token-123')
    expect(auth.hydrate()).toBe(true)
    expect(auth.loggedIn).toBe(true)

    const payloads: Array<Record<string, unknown>> = []
    const client = getClientSetup().client
    vi.spyOn(client, 'chatSend').mockImplementation(async (params: unknown) => {
      payloads.push(params as Record<string, unknown>)
      if (payloads.length === 1) {
        throw new RpcError({ code: -32002, message: DAEMON_SESSION_EXPIRED })
      }
      return { task_id: 't-742b', status: 'running', model: 'm' }
    })

    await messages.sendUserMessage('c-742', '第一发')

    // ① 文案＝"重新登录"族，且**不是** KEY 族
    const row = messages.list('c-742').find((item) => item.kind === 'status')
    expect(row?.meta?.errorKey).toBe('sessionExpired')
    expect(row?.meta?.statusKey).toBe('sendFailed')

    // ② 自愈：失效 token 被清（store ＋ sessionStorage）
    expect(auth.sessionToken).toBe('')
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(auth.sessionExpired).toBe(true)

    // ③ 不再用旧 token 重发：第一发带过旧 token；清后第二发**不带** session_token
    expect(payloads[0]).toHaveProperty('session_token', 'old-token-123')
    await messages.sendUserMessage('c-742', '第二发')
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).not.toHaveProperty('session_token')
  })

  it('非会话失效的失败（如网络）不得误清 token', async () => {
    const messages = useMessageStore()
    const auth = useAuthStore()
    sessionStorage.setItem(TOKEN_KEY, 'keep-me')
    auth.hydrate()
    vi.spyOn(getClientSetup().client, 'chatSend').mockRejectedValue(
      new RpcError({ code: -32603, message: 'RPC -32603: internal' }),
    )

    await messages.sendUserMessage('c-742c', '发一发')

    expect(auth.sessionToken).toBe('keep-me')
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('keep-me')
    expect(auth.sessionExpired).toBe(false)
  })
})
