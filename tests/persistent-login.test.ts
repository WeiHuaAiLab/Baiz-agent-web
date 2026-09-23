// MSG-3509 P1/P2 红证：**持久登录**（壳侧系统凭据库）＋**显式退出**（清后不得自动复登）
//
// 口径（老板 2026-09-23 17:5x 亲裁）：只存**可撤销的登录令牌**＋落**系统凭据库**
// ＋**退出即清**；前端**零令牌**（令牌只在壳与系统凭据库里）。
//
// **改前必红**：
//   ①把 `auth.ts` 的 `hydrateAsync()` 持久分支注掉 ⇒ 用例 1／2 首断言**红**
//     （＝"重启/自动更新后掉登录"）；
//   ②把 `logout()` 里的 `identity.logout()` 注掉 ⇒ 用例 2 的"壳侧条目已清"**红**
//     （＝"退出后仍能自动复登"）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../src/stores/auth'
import { createMockBridge } from '../src/bridge/mock'
import { resetBridgeForTests } from '../src/bridge'
import type { Bridge } from '../src/bridge'

/** 造一个"壳侧系统凭据库里有持久身份"的桥（status 命中；logout 置失效并记调用）。 */
function bridgeWithPersistedIdentity() {
  const b: Bridge = createMockBridge()
  let persisted = true
  const logout = vi.fn(async () => {
    persisted = false
  })
  b.identity.status = vi.fn(async () => ({
    loggedIn: persisted,
    userId: persisted ? 'u-persist' : '',
  }))
  b.identity.logout = logout
  return { b, logout, isPersisted: () => persisted }
}

describe('MSG-3509 持久登录 / 显式退出', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
  })

  it('P1：壳侧持久身份命中 ⇒ 启动即已登录（无需重登），且前端零令牌', async () => {
    const { b } = bridgeWithPersistedIdentity()
    resetBridgeForTests(b)
    const auth = useAuthStore()
    expect(auth.loggedIn).toBe(false)

    await expect(auth.hydrateAsync()).resolves.toBe(true)
    expect(auth.loggedIn).toBe(true)
    expect(auth.userId).toBe('u-persist')
    // **零令牌**：持久径下前端不得持有任何令牌串
    expect(auth.sessionToken).toBe('')
    expect(sessionStorage.getItem('baiz_session_token')).toBeNull()
  })

  it('P2：退出 ⇒ 清壳侧凭据库条目＋清本地会话态＋再启动不得自动复登', async () => {
    const { b, logout, isPersisted } = bridgeWithPersistedIdentity()
    resetBridgeForTests(b)
    const auth = useAuthStore()
    await auth.hydrateAsync()
    expect(auth.loggedIn).toBe(true)

    await auth.logout()
    expect(logout).toHaveBeenCalledTimes(1)
    expect(isPersisted()).toBe(false)
    expect(auth.loggedIn).toBe(false)
    expect(auth.persisted).toBe(false)
    expect(sessionStorage.getItem('baiz_session_token')).toBeNull()

    // 再"启动"一次（新 pinia＝新会话）：壳已无条目 ⇒ 必须回未登录
    setActivePinia(createPinia())
    const fresh = useAuthStore()
    await expect(fresh.hydrateAsync()).resolves.toBe(false)
    expect(fresh.loggedIn).toBe(false)
  })

  it('P1/P2 边界：桥未通（旧壳/纯 web）⇒ 诚实未登录（不造假已登录）', async () => {
    const b: Bridge = createMockBridge()
    b.identity.status = vi.fn(async () => {
      throw new Error('command not found: identity_status')
    })
    resetBridgeForTests(b)
    const auth = useAuthStore()
    await expect(auth.hydrateAsync()).resolves.toBe(false)
    expect(auth.loggedIn).toBe(false)
  })
})
