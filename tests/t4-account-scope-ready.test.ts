// **令·1.0.30 T批 · T4 甲** 红证：「退出登录→再登 ⇒ 会话历史消失」（真机 R4）。
//
// 根因（本席实取·**代码面可证**）：`stores/auth.ts::reloadAccountScoped(account)` 的入参
// `account` 与 `stores/session.ts::load()` 内部所读的 `currentDbAccount()` 是**两个来源**
// —— 库面（模块级全局 `currentAccount`）若落后于入参（登出 `setDbAccount("")` 之后、
// 库面尚未切回时调本函数），`load()` 读的就是**别的账号段库**（= `baiz-anon`）⇒ 列表为空
// ＝「历史消失」；重开／重登时库面已就绪 ⇒ 恢复（与真机「重开/重登又恢复」逐字吻合）。
//
// 判据：**入参是权威**——`reloadAccountScoped('acct-X')` 读完，列表须＝**acct-X 库**的行，
// 不得是「库面残留的别的段」的行。
//   ★ 红：改前读库面残留段（`baiz-anon`）⇒ 见到 `c-anon`、见不到 `c-x`。
//   绿：库面先对齐入参 ⇒ 见 `c-x`、不见 `c-anon`。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { resetClientForTests } from '../src/client/singleton'
import { resetBridgeForTests } from '../src/bridge'
import { createMockBridge } from '../src/bridge/mock'
import { currentDbAccount, currentDbName, db, dbNameFor, setDbAccount } from '../src/db'
import { useAuthStore } from '../src/stores/auth'
import { useSessionStore } from '../src/stores/session'
import type { Conversation } from '../src/models'

const ACCT = 't4-scope@example.test'

function conv(id: string, title: string): Conversation {
  return { id, title, createdAt: 1, updatedAt: 1 } as Conversation
}

async function resetTestDbs(): Promise<void> {
  if (typeof indexedDB.databases !== 'function') return
  setDbAccount('')
  const list = await indexedDB.databases()
  await Promise.all(
    list
      .map((entry) => String(entry?.name ?? ''))
      .filter((name) => name.startsWith('baiz'))
      .map(
        (name) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(name)
            req.onsuccess = () => resolve()
            req.onerror = () => resolve()
            req.onblocked = () => resolve()
          }),
      ),
  )
}

describe('T4 甲：reloadAccountScoped 以**入参**为权威（等账号段就绪再 load）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetClientForTests()
    resetBridgeForTests(createMockBridge())
    sessionStorage.clear()
    localStorage.clear()
    await resetTestDbs()
  })

  it('甲① 库面落后（停在 anon）而入参为 acct ⇒ 读**入参账号库**，不是库面残留段', async () => {
    // 造两库：anon 库一条「未登录的」，acct 库一条「本账号历史」
    setDbAccount('')
    await db.conversations.add(conv('c-anon', '未登录的会话'))
    setDbAccount(ACCT)
    await db.conversations.add(conv('c-x', '本账号历史'))
    // ★ 病态现场：库面**落后**（登出后的残留态）
    setDbAccount('')
    expect(currentDbName(), '前置：库面确实停在 anon 段').toBe('baiz-anon')

    const session = useSessionStore()
    await useAuthStore().reloadAccountScoped(ACCT)

    const ids = session.conversations.map((row) => row.id)
    expect(ids, '须读**入参**账号库（acct 的历史可见）').toContain('c-x')
    expect(ids, '库面残留段的行**不得**串入').not.toContain('c-anon')
    expect(currentDbAccount(), '库面须与入参对齐就绪').toBe(ACCT)
    expect(currentDbName()).toBe(dbNameFor(ACCT))
  })

  it('甲② 登出径（入参空串）⇒ 库面回落 anon（既有口径不破）', async () => {
    setDbAccount(ACCT)
    await db.conversations.add(conv('c-x', '本账号历史'))
    const session = useSessionStore()
    session.conversations = [conv('c-x', '本账号历史')]

    await useAuthStore().reloadAccountScoped('')

    expect(session.conversations, '登出径清内存').toEqual([])
    expect(session.activeId, '登出径清活动会话').toBe('')
    expect(currentDbName(), '登出 ⇒ 库面回落 anon').toBe('baiz-anon')
  })

  it('甲③ 入参含首尾空白 ⇒ 归一后再对齐（不得落到带空白的段）', async () => {
    setDbAccount(ACCT)
    await db.conversations.add(conv('c-x', '本账号历史'))
    setDbAccount('')

    const session = useSessionStore()
    await useAuthStore().reloadAccountScoped(`  ${ACCT}  `)

    expect(currentDbAccount(), '空白归一后对齐').toBe(ACCT)
    expect(session.conversations.map((row) => row.id)).toContain('c-x')
  })
})
