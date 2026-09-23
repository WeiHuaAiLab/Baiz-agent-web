// MSG-3517③ 红证：**持久登录径必须切库面**（T12 分段库）
//
// 病灶：③web 的持久恢复径 `hydrateAsync()` 只置 `persisted/userId`，**未调 `setDbAccount`**
// ⇒ 与 T12 的 `dbNameFor(currentAccount)` 合流后，自动更新/重启恢复的用户落 **`baiz-anon`**
// ⇒ 该账号既有会话/消息**读不到**（老板投诉的「东西没了」同类·本版必不复发）。
//
// ★ **注掉 `hydrateAsync()` 内 `setDbAccount(this.userId)`** ⇒ 本件**必红**。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ANON_DB_NAME, currentDbName, dbNameFor } from '../src/db'
import { resetBridgeForTests } from '../src/bridge'
import { createMockBridge } from '../src/bridge/mock'
import type { Bridge } from '../src/bridge'
import { useAuthStore } from '../src/stores/auth'

/** 测试假账号（非真账号·凭据零入文） */
const PERSIST_UID = 'u-persist-3517'

function bridgeWithPersistedIdentity() {
  const b: Bridge = createMockBridge()
  b.identity.status = vi.fn(async () => ({ loggedIn: true, userId: PERSIST_UID }))
  return b
}

describe('MSG-3517③ 持久登录径 · 库面切本账号', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    resetBridgeForTests(bridgeWithPersistedIdentity())
  })

  it('持久身份命中 ⇒ 库面切到本账号（不得落 anon）', async () => {
    const auth = useAuthStore()
    await expect(auth.hydrateAsync()).resolves.toBe(true)
    expect(auth.userId).toBe(PERSIST_UID)
    expect(auth.sessionToken, '持久径前端零令牌').toBe('')
    // ★ 注掉 hydrateAsync 内 setDbAccount ⇒ 此处必红（会落 baiz-anon）
    expect(currentDbName()).toBe(dbNameFor(PERSIST_UID))
    expect(currentDbName()).not.toBe(ANON_DB_NAME)
  })
})
