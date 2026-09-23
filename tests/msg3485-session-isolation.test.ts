// MSG-3485（T12 前端取值面）红证：会话/消息/草稿**按账号分段**（甲案·库名分段）。
//
// 判据（令 §四·1）：
//   ① 两账号分别落数据 ⇒ 各自列表**不同**、跨账号**不可见**；
//   ② **注掉账号维**（把 `dbNameFor` 改成恒返同一库名）⇒ 本件**必红**。
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ANON_DB_NAME,
  LEGACY_DB_NAME,
  currentDbName,
  db,
  dbNameFor,
  legacyDbSummary,
  setDbAccount,
} from '../src/db'
import type { Conversation } from '../src/models'

function conv(id: string, title: string): Conversation {
  return { id, title, createdAt: 1, updatedAt: 1 } as Conversation
}

function deleteLegacyDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(LEGACY_DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

/** 造一个"1.0.21 之前"的旧库（库名无账号段·一条旧会话） */
function seedLegacyDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME, 1)
    req.onupgradeneeded = () => {
      const conn = req.result
      if (!conn.objectStoreNames.contains('conversations')) {
        conn.createObjectStore('conversations', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => {
      const conn = req.result
      const tx = conn.transaction('conversations', 'readwrite')
      tx.objectStore('conversations').put(conv('legacy-1', '旧版会话'))
      tx.oncomplete = () => {
        conn.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })
}

beforeEach(async () => {
  for (const account of ['acct-a', 'acct-b', '']) {
    setDbAccount(account)
    await db.conversations.clear()
    await db.messages.clear()
    await db.drafts.clear()
  }
  setDbAccount('')
  await deleteLegacyDb()
})

describe('MSG-3485 会话按账号分段（甲案·库名分段）', () => {
  it('① 两账号 ⇒ 各见各的会话（列表不同·跨账号不可见）', async () => {
    setDbAccount('acct-a')
    await db.conversations.add(conv('c-a1', 'A 的会话'))
    setDbAccount('acct-b')
    await db.conversations.add(conv('c-b1', 'B 的会话'))

    const listB = (await db.conversations.toArray()).map((row) => row.title)
    setDbAccount('acct-a')
    const listA = (await db.conversations.toArray()).map((row) => row.title)

    expect(listB).toEqual(['B 的会话'])
    expect(listA).toEqual(['A 的会话'])
    expect(listA).not.toEqual(listB)
    expect(currentDbName()).toBe(dbNameFor('acct-a'))
    expect(dbNameFor('acct-a')).not.toBe(dbNameFor('acct-b'))
    expect(dbNameFor('acct-a').startsWith('baiz-u-')).toBe(true)
  })

  it('② 未登录／账号未知 ⇒ anon 库：与账号库互不可见', async () => {
    setDbAccount('acct-a')
    await db.conversations.add(conv('c-a1', 'A 的会话'))

    setDbAccount('')
    expect(currentDbName()).toBe(ANON_DB_NAME)
    expect(await db.conversations.count()).toBe(0)
    await db.conversations.add(conv('c-anon', '未登录的会话'))

    setDbAccount('acct-a')
    expect((await db.conversations.toArray()).map((row) => row.title)).toEqual(['A 的会话'])
  })

  it('③ 旧库 baiz（无账号段）不被打开：零串入＋只读可清点（零删零改）', async () => {
    await seedLegacyDb()

    setDbAccount('acct-a')
    await db.conversations.add(conv('c-a1', 'A 的会话'))
    expect((await db.conversations.toArray()).map((row) => row.title)).toEqual(['A 的会话'])
    setDbAccount('')
    expect(await db.conversations.count()).toBe(0)

    const first = await legacyDbSummary()
    expect(first.name).toBe(LEGACY_DB_NAME)
    expect(first.conversations).toBe(1)
    expect((await legacyDbSummary()).conversations).toBe(1)
  })

  it('④ 旧库不存在 ⇒ 清点返 0 且**不建库**（清点零副作用）', async () => {
    const summary = await legacyDbSummary()
    expect(summary.conversations).toBe(0)
    const list = await indexedDB.databases()
    expect(list.some((entry) => entry.name === LEGACY_DB_NAME)).toBe(false)
  })
})
