// **MSG-3573 前端窗 · P2 读径** 单测（新 API 面）：别名**唯一写入点**、字面取值点、
// 候选库名、只读并读（当前库优先去重／零写入）。
//
// 与 `tests/msg3573-frontend-two-fixes.test.ts`（可在改前尖直接跑的红/绿件）配对：
// 本件覆盖"登录登记邮箱形"这一半（改前尖无 `rememberAccountLogin`／`accountReadLiterals`）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  accountReadDbNames,
  currentDbName,
  db,
  dbNameFor,
  readConversationsFrom,
  readConversationsUnion,
  setDbAccount,
} from '../src/db'
import { accountReadLiterals, rememberAccountLogin } from '../src/db/alias'

/** 测试账号（**非凭据**：邮箱形／归一形与同仓既有件同源） */
const EMAIL = '1554408909@qq.com'
const NORM = 'x-h-1b7249424147d193'
const OLD_SEG_DB = 'baiz-u-h70813df3'

function seedRawDb(name: string, conversations: Record<string, unknown>[]): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('conversations', { keyPath: 'id' })
    }
    req.onerror = () => resolve()
    req.onsuccess = () => {
      const conn = req.result
      const tx = conn.transaction(['conversations'], 'readwrite')
      for (const row of conversations) tx.objectStore('conversations').put(row)
      tx.oncomplete = () => {
        conn.close()
        resolve()
      }
      tx.onerror = () => {
        conn.close()
        resolve()
      }
    }
  })
}

async function resetTestDbs(): Promise<void> {
  if (typeof indexedDB.databases !== 'function') return
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

describe('MSG-3573 P2 别名写入点／读径取值点（单测）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    return resetTestDbs()
  })

  it('登录（唯一写入点）后：两形同段，且字面取值点认得历史邮箱形', () => {
    rememberAccountLogin(EMAIL, NORM)
    expect(dbNameFor(NORM), '两字面形须落同一库名段').toBe(dbNameFor(EMAIL))
    const literals = accountReadLiterals(NORM)
    expect(literals, '归一形登录后仍须认得邮箱形（否则旧字形库读不到）').toContain(EMAIL)
    expect(literals).toContain(NORM)
    // 幂等：重复登记不改变段值
    const seg = dbNameFor(NORM)
    rememberAccountLogin(EMAIL, NORM)
    expect(dbNameFor(EMAIL)).toBe(seg)
  })

  it('候选库名：当前稳定段库排首＋各字面**旧口径段**库（去重）', () => {
    rememberAccountLogin(EMAIL, NORM)
    setDbAccount(NORM)
    const names = accountReadDbNames(NORM)
    expect(names[0], '第 0 项＝当前稳定段库（写径唯一落点）').toBe(currentDbName())
    expect(names, '旧字形（邮箱形段）库须在候选里').toContain(OLD_SEG_DB)
    expect(new Set(names).size, '候选须去重').toBe(names.length)
    // 未登录／账号未知 ⇒ 只 anon
    expect(accountReadDbNames('')).toEqual(['baiz-anon'])
  })

  it('readConversationsFrom：只读旧库（行数逐字不变·不升级）', async () => {
    await seedRawDb(OLD_SEG_DB, [{ id: 'c-old', title: '旧', createdAt: 1, updatedAt: 1 }])
    const rows = await readConversationsFrom(OLD_SEG_DB)
    expect(rows.map((row) => row.id)).toEqual(['c-old'])
    const again = await readConversationsFrom(OLD_SEG_DB)
    expect(again.length, '只读：连读两次行数不变').toBe(1)
    expect(await readConversationsFrom('baiz-u-not-exist-3573'), '不存在的库 ⇒ 空（不建库）').toEqual(
      [],
    )
  })

  it('readConversationsUnion：当前库优先（同 id 以当前库为准）＋旧库只读并入', async () => {
    rememberAccountLogin(EMAIL, NORM)
    setDbAccount(NORM)
    await db.conversations.put({ id: 'c-both', title: '当前形', createdAt: 2, updatedAt: 2 })
    await seedRawDb(OLD_SEG_DB, [
      { id: 'c-both', title: '旧字形', createdAt: 1, updatedAt: 1 },
      { id: 'c-only-old', title: '只在旧库', createdAt: 1, updatedAt: 1 },
    ])

    const rows = await readConversationsUnion(NORM)
    const byId = new Map(rows.map((row) => [row.id, row]))
    expect(byId.get('c-both')?.title, '同 id 去重：当前库优先').toBe('当前形')
    expect(byId.has('c-only-old'), '旧库独有行须并入').toBe(true)
    expect(rows.length, '不许重复行').toBe(2)
    expect(
      (await readConversationsFrom(OLD_SEG_DB)).map((row) => row.id).sort(),
      '并读后旧库原样（零删零改）',
    ).toEqual(['c-both', 'c-only-old'])
  })
})
