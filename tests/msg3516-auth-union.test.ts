// MSG-3516 §二：并入④后 `src/stores/auth.ts` 取「并集」的**对照红证（账号维侧）**
//
// 背景：并入④时 `auth.ts` 冲突——③web 半（持久登录/退出）与 T12（账号维）同改一件。
// 裁定（MSG-3516 §一）＝**并集·两边功能都不许丢**。本件把**账号维那半的"接线"**钉成可判据：
//   · 登录成功 ⇒ 库面切到**本账号**（`dbNameFor(userId)`）；退出 ⇒ 回落 `anon`。
//   ★ **注掉 `login()` 内 `setDbAccount(this.userId)`** ⇒ 本条**必红**（会落 anon）。
//   ★ **注掉 `logout()` 内 `setDbAccount("")`**      ⇒ 本条**必红**（不会回落 anon）。
//（另一半「退出即清」的对照由 `tests/persistent-login.test.ts` P2 承担：注掉
//  `logout()` 内 `getBridge().identity.logout()` ⇒ P2 必红。）
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ANON_DB_NAME, currentDbName, dbNameFor } from '../src/db'
import { resetClientForTests } from '../src/client/singleton'
import { useAuthStore } from '../src/stores/auth'

/** 测试假账号（非真账号·凭据零入文） */
const ACCT = 'acct-3516@example.test'
const PW = 'pw-3516-not-real'

describe('MSG-3516 auth 并集 · 账号维接线（对照）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    sessionStorage.clear()
  })

  it('登录 ⇒ 库面切到本账号；退出 ⇒ 回落 anon（注掉任一侧即必红）', async () => {
    const auth = useAuthStore()
    const ok = await auth.login(ACCT, PW)
    expect(ok, 'DEV 下 mock 径应登录成功').toBe(true)
    expect(auth.userId).toBe(ACCT)
    // ★ 账号维接线（注掉 `setDbAccount(this.userId)` ⇒ 必红）
    expect(currentDbName()).toBe(dbNameFor(ACCT))
    expect(currentDbName()).not.toBe(ANON_DB_NAME)

    await auth.logout()
    // ★ 退出回落（注掉 `setDbAccount("")` ⇒ 必红）
    expect(currentDbName()).toBe(ANON_DB_NAME)
    expect(auth.loggedIn).toBe(false)
  })
})
