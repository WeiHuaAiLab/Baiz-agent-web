// **令·1.0.30 T批 · T4 乙** 红证：`load()` 读回**空**而**库非空** ⇒ **自动重试一次 ＋ 人话**（不静默空态）。
//
// 病（真机 R4 另一半）：账号段/库打开时序未就绪时，`readConversationsUnion()` 会读回空，
// `load()` 旧口径**直接采信空**（无重试、无提示）⇒ 界面静默空态＝「历史消失」。
// 判据（题包 §一 T4 红证口径逐字）：
//   ① 空而库非空 ⇒ **重试一次** ⇒ 最终列表**非空**（时序恢复后数据自己回来）；
//   ② 重试后**仍空** ⇒ **人话上屏**（`session.loadNotice` ＋ ChatPanel 渲染·`data-load-notice="1"`）；
//   ③ 库**真为空** ⇒ **不重试、不提示**（不得把空库也当异常——防误报）；
//   ④ 无法清点库（旧内核 `indexedDB.databases()` 不可用）⇒ **不重试、不提示**（不可判即不猜）。
// ★ 红：改前无重试机制 ⇒ ①列表恒空、②无 notice、③/④ 同（後三条为**对照**·两侧皆绿）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ChatPanel from '../src/components/Sidebar/ChatPanel.vue'
import { router } from '../src/router'
import zhCN from '../src/locales/zh-CN'

/** 只在**读径并读**上开替身：其余（`db` 懒门面／别名／清点）一律真件——**不整件替换** */
vi.mock('../src/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db')>()
  return { ...actual, readConversationsUnion: vi.fn(actual.readConversationsUnion) }
})

import { dbNameFor, readConversationsUnion, setDbAccount } from '../src/db'
import { useSessionStore } from '../src/stores/session'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const ACCT = 't4-retry@example.test'
const unionMock = vi.mocked(readConversationsUnion)

/** 造「已存在」的当前账号库（raw·version 1）：只喂**独立清点通道**，不在 Dexie 面造行 */
function seedRawDb(name: string, conversations: Record<string, unknown>[]): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      const conn = req.result
      if (!conn.objectStoreNames.contains('conversations')) {
        conn.createObjectStore('conversations', { keyPath: 'id' })
      }
    }
    req.onerror = () => resolve()
    req.onsuccess = () => {
      const conn = req.result
      const tx = conn.transaction('conversations', 'readwrite')
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

function mountPanel() {
  return mount(ChatPanel, {
    global: {
      plugins: [i18n, router],
      stubs: { ProjectList: true, SessionList: true, Icon: true },
    },
  })
}

describe('T4 乙：读空而库非空 ⇒ 重试一次＋人话（不静默空态）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    localStorage.clear()
    unionMock.mockReset()
    await resetTestDbs()
    setDbAccount(ACCT)
  })

  it('① 首次读空·库非空 ⇒ 重试一次 ⇒ 最终列表**非空**', async () => {
    const actual = await vi.importActual<typeof import('../src/db')>('../src/db')
    await seedRawDb(dbNameFor(ACCT), [
      { id: 'c-real', title: '本账号历史', createdAt: 1, updatedAt: 1 },
    ])
    unionMock.mockImplementationOnce(async () => [])
    unionMock.mockImplementation(actual.readConversationsUnion)

    const session = useSessionStore()
    await session.load()

    expect(
      session.conversations.map((row) => row.id),
      '空而库非空 ⇒ 重试一次后历史须回来',
    ).toContain('c-real')
    expect(unionMock.mock.calls.length, '须**重试一次**（共两次读）').toBe(2)
    expect(session.loadNotice, '数据已回来 ⇒ 不打扰用户（不显异常人话）').toBe('')
  })

  it('② 重试后**仍空** ⇒ 人话上屏（`data-load-notice="1"`）∧ 恰重试一次', async () => {
    await seedRawDb(dbNameFor(ACCT), [
      { id: 'c-real', title: '本账号历史', createdAt: 1, updatedAt: 1 },
    ])
    unionMock.mockResolvedValue([])

    const session = useSessionStore()
    await session.load()

    expect(session.conversations, '替身恒空 ⇒ 列表仍空').toEqual([])
    expect(unionMock.mock.calls.length, '恰重试**一次**（不无限重试）').toBe(2)
    expect(session.loadNotice, '**不静默空态**：人话须落到 store').not.toBe('')
    expect(session.loadNotice, '人话须说明数据未删').toContain('未删')

    const el = mountPanel().find('[data-load-notice="1"]')
    expect(el.exists(), '人话必须**上屏**（注掉渲染块 ⇒ 必红）').toBe(true)
    expect(el.attributes('role')).toBe('status')
    expect(el.text()).toBe(session.loadNotice)
  })

  it('③ 对照：库**真为空** ⇒ 不重试、不提示（防误报）', async () => {
    unionMock.mockImplementation(async () => [])
    const session = useSessionStore()
    await session.load()

    expect(unionMock.mock.calls.length, '空库 ⇒ 只读一次（不重试）').toBe(1)
    expect(session.loadNotice, '空库是正常态 ⇒ 不显异常人话').toBe('')
  })

  it('④ 对照：无法清点库 ⇒ 不重试、不提示（不可判即不猜）', async () => {
    await seedRawDb(dbNameFor(ACCT), [
      { id: 'c-real', title: '本账号历史', createdAt: 1, updatedAt: 1 },
    ])
    unionMock.mockResolvedValue([])
    const saved = indexedDB.databases
    // 旧内核：无 `databases()` ⇒ 清点不可用（`null`）
    Object.defineProperty(indexedDB, 'databases', { value: undefined, configurable: true })

    try {
      const session = useSessionStore()
      await session.load()
      expect(unionMock.mock.calls.length, '不可判 ⇒ 不重试').toBe(1)
      expect(session.loadNotice, '不可判 ⇒ 不猜、不提示').toBe('')
    } finally {
      Object.defineProperty(indexedDB, 'databases', { value: saved, configurable: true })
    }
  })
})
