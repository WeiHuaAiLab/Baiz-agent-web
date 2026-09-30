// **MSG-3577 · P9 新件单测**（护栏四条的可机判面；组件级「红/绿双跑」见
// `tests/msg3577-demo-guard-p10.test.ts`）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  DEMO_RESET_PHRASE,
  backupFileName,
  backupJsonText,
  clearLocalDemoData,
  collectBackup,
  demoResetAvailable,
  isProtectedLocalKey,
  keysToClear,
  phraseMatches,
} from '../src/utils/demoReset'
import { ACCOUNT_ALIAS_KEY } from '../src/db/alias'
import { db, setDbAccount } from '../src/db'

describe('MSG-3577 P9 护栏单测', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    setDbAccount('acct-3577-unit')
    if (typeof indexedDB.databases === 'function') {
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
  })

  it('① 正式版收口：仅 dev 或显式演示构建可用（正式版 false）', () => {
    expect(demoResetAvailable({ dev: false, demo: undefined }), '正式构建须不可用').toBe(false)
    expect(demoResetAvailable({ dev: false, demo: '0' })).toBe(false)
    expect(demoResetAvailable({ dev: true, demo: undefined })).toBe(true)
    expect(demoResetAvailable({ dev: false, demo: '1' }), '显式演示构建可用').toBe(true)
  })

  it('② 输入式确认判据：须逐字（首尾空白不算）', () => {
    expect(DEMO_RESET_PHRASE).toBe('重置')
    expect(phraseMatches('重置')).toBe(true)
    expect(phraseMatches('  重置 ')).toBe(true)
    expect(phraseMatches('重置吧')).toBe(false)
    expect(phraseMatches('')).toBe(false)
  })

  it('④ 别名表保护：将清清单不含别名表；清场后别名表仍在', async () => {
    localStorage.setItem(ACCOUNT_ALIAS_KEY, JSON.stringify({ a: 'a' }))
    localStorage.setItem('baiz.account', 'a')
    localStorage.setItem('baiz.theme', 'dark')
    localStorage.setItem('other.app', 'x')
    expect(isProtectedLocalKey(ACCOUNT_ALIAS_KEY)).toBe(true)
    expect(keysToClear()).toEqual(['baiz.account', 'baiz.theme'])

    await db.conversations.put({ id: 'c1', title: 't', createdAt: 1, updatedAt: 1 })
    const result = await clearLocalDemoData()
    expect(result.clearedTables).toEqual(['conversations', 'messages', 'drafts'])
    expect(result.removedKeys.sort()).toEqual(['baiz.account', 'baiz.theme'])
    expect(result.keptKeys, '别名表须回报"保留"').toContain(ACCOUNT_ALIAS_KEY)
    expect(localStorage.getItem(ACCOUNT_ALIAS_KEY), '别名表逐字保留').not.toBeNull()
    expect(localStorage.getItem('other.app'), '非 baiz.* 键不动').toBe('x')
    expect(await db.conversations.count(), '只清行（不 db.delete()）').toBe(0)
  })

  it('③ 备份：文件名形态＋内容含本地库行与全部 baiz.* 键（含别名表）', async () => {
    localStorage.setItem(ACCOUNT_ALIAS_KEY, JSON.stringify({ a: 'a' }))
    localStorage.setItem('baiz.account', 'a')
    await db.conversations.put({ id: 'c-b', title: '备份用的', createdAt: 1, updatedAt: 1 })
    const backup = await collectBackup()
    expect(backupFileName(0)).toMatch(/^baiz-backup-\d{4}-\d{2}-\d{2}T.*\.json$/)
    expect(backup.conversations.map((row) => (row as { id: string }).id)).toContain('c-b')
    expect(backup.localStorage[ACCOUNT_ALIAS_KEY], '备份须含别名表').toBeTruthy()
    expect(backup.schema).toBe('baiz-local-backup/1')
    expect(backupJsonText(backup)).toContain('baiz-local-backup/1')
    expect(backup.note).toContain('不含 daemon')
  })

  it('③ 备份失败 ⇒ 不得静默（collectBackup 读失败即抛，调用方据此中止清场）', async () => {
    const spy = vi.spyOn(db.conversations, 'toArray').mockRejectedValue(new Error('read-fail'))
    await expect(collectBackup()).rejects.toThrow()
    spy.mockRestore()
  })
})
