// **MSG-3577（P9 演示数据按钮护栏）＋ MSG-3578（P10 迁移源限本账号）红证／绿证**
//
// 病灶（改前尖 `e164dcd`）：
//   · **P9**：`DemoCard.resetDemo()` ＝ `confirm` ⇒ **`db.delete()`** ⇒ 删**所有** `baiz.*`
//     （**连账号别名表一起清**）⇒ 本地分段库整库消失·P2 两字形并读的字面来源丢失，
//     且前端**无 daemon"列会话"RPC** ⇒ 不可回填；
//   · **P10**：`candidateSourceDbs()` 把**任意** `baiz-u-*` 当源 ⇒ **跨账号导入**（串档）。
//
// 判据（本件**只用改前尖就有的 API**，可在改前尖直接跑）：
//   Δ1 点「重置演示数据」**（即使 confirm 被自动确认）**也不得清数据/别名表（须改为输入式确认）；
//   Δ2 走完确认后：**先有备份下载**、**库未被 `db.delete()`**（仍可读）、**别名表保留**；
//   Δ3 **P10**：他账号 `baiz-u-*` **不作迁移源**（当前账号库里不得出现其行）且**其原库逐字未动**。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { resetClientForTests } from '../src/client/singleton'
import DemoCard from '../src/components/settings/DemoCard.vue'
import { db, dbNameFor, setDbAccount } from '../src/db'
import { ACCOUNT_ALIAS_KEY } from '../src/db/alias'
import { useSessionStore } from '../src/stores/session'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 测试账号（**非凭据**） */
const ACCT = 'acct-3577-a'
const OTHER_EMAIL = 'other-3577@example.test'

function seedRawDb(name: string, rows: Record<string, unknown>[]): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      const conn = req.result
      if (!conn.objectStoreNames.contains('conversations')) {
        conn.createObjectStore('conversations', { keyPath: 'id' })
      }
      if (!conn.objectStoreNames.contains('messages')) {
        conn.createObjectStore('messages', { keyPath: 'id' })
      }
    }
    req.onerror = () => resolve()
    req.onsuccess = () => {
      const conn = req.result
      const tx = conn.transaction(['conversations'], 'readwrite')
      for (const row of rows) tx.objectStore('conversations').put(row)
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

function rawRows(name: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    const req = indexedDB.open(name)
    req.onerror = () => resolve([])
    req.onsuccess = () => {
      const conn = req.result
      if (!conn.objectStoreNames.contains('conversations')) {
        conn.close()
        resolve([])
        return
      }
      const tx = conn.transaction('conversations', 'readonly')
      const all = tx.objectStore('conversations').getAll()
      all.onsuccess = () => {
        const rows = (all.result ?? []) as Record<string, unknown>[]
        conn.close()
        resolve(rows)
      }
      all.onerror = () => {
        conn.close()
        resolve([])
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

describe('MSG-3577 P9 · 演示数据按钮护栏', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetClientForTests()
    sessionStorage.clear()
    localStorage.clear()
    await resetTestDbs()
    setDbAccount(ACCT)
    // 真数据＋别名表（P2 并读的字面来源）
    await db.conversations.put({ id: 'c-real', title: '真会话', createdAt: 1, updatedAt: 1 })
    localStorage.setItem(ACCOUNT_ALIAS_KEY, JSON.stringify({ [ACCT]: ACCT }))
    localStorage.setItem('baiz.account', ACCT)
  })

  it('Δ1 点按钮（confirm 被自动确认）⇒ 一条数据都不得清；且不得再用 window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mount(DemoCard, { global: { plugins: [i18n] } })
    await flushPromises()
    const button = wrapper.find('button')
    expect(button.exists(), 'dev 构建下按钮在位').toBe(true)
    await button.trigger('click')
    await flushPromises()

    // ★ Δ1（改前必红：`confirm` 一真即 `db.delete()` ＋ 清空 `baiz.*`）
    expect(
      await db.conversations.count(),
      '点一下按钮不得清掉真数据（须输入式确认后才可能清）',
    ).toBe(1)
    expect(localStorage.getItem(ACCOUNT_ALIAS_KEY), '别名表不得被清（P2 并读字面来源）').not.toBeNull()
    expect(confirmSpy, '旧 confirm 须被输入式确认取代').not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('Δ2 走完输入式确认 ⇒ 先有备份下载、库仍在、别名表保留', async () => {
    // 备份以 Blob 下载（本地·零上传）：记录 Blob 内容作**强证据**（含 schema 与别名表）
    const blobs: Blob[] = []
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((payload: Blob | MediaSource) => {
        if (payload instanceof Blob) blobs.push(payload)
        return 'blob:baiz-test'
      })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const wrapper = mount(DemoCard, { global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    const input = wrapper.find('input')
    expect(input.exists(), '须出现输入式确认（旧版只有 confirm）').toBe(true)
    await input.setValue('重置')
    await flushPromises()
    const buttons = wrapper.findAll('button')
    await buttons[buttons.length - 1].trigger('click')
    // 确认径是**异步链**（备份读库 → 下载 → 清场 → 刷新）：轮询等它真跑完（勿抢跑判绿）
    await vi.waitFor(() => {
      expect(createUrl, '清前必须先导出备份（Blob 下载）').toHaveBeenCalled()
    })

    // ★ Δ2（改前必红：无输入框、无备份下载）
    expect(blobs, '备份体须真产出').toHaveLength(1)
    // jsdom Blob 无 `.text()`：此处只验**形态**（JSON 态·非空）；**内容**（schema＋别名表）
    // 由 `tests/msg3577-demo-guard-unit.test.ts` ③ 逐字断言（collectBackup 同源）
    expect(blobs[0].type).toBe('application/json')
    expect(blobs[0].size, '备份体非空').toBeGreaterThan(0)
    expect(
      localStorage.getItem(ACCOUNT_ALIAS_KEY),
      '④ 别名表必须保留（其余 baiz.* 才清）',
    ).not.toBeNull()
    expect(await db.conversations.count(), '③ 只清行·不 db.delete()：库仍在（可再读）').toBe(0)

    createUrl.mockRestore()
  })
})

describe('MSG-3578 P10 · 迁移源限本账号字面集', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    localStorage.clear()
    await resetTestDbs()
  })

  it('Δ3 他账号 `baiz-u-*` 不作迁移源（不串档）且其原库逐字未动', async () => {
    // 他账号库（旧口径段名）：若被当源 ⇒ 会把它的会话塞进当前账号库
    const otherDb = dbNameFor(OTHER_EMAIL)
    await seedRawDb(otherDb, [{ id: 'c-other', title: '他人会话', createdAt: 1, updatedAt: 1 }])
    setDbAccount(ACCT)
    const { candidateSourceDbs } = await import('../src/db/migrate')
    // ★ Δ3 主判据（改前必红：他账号库落在候选源里 ⇒ 串档）
    expect(
      await candidateSourceDbs(),
      '他账号 `baiz-u-*` 不得进候选源（迁移源限本账号字面集）',
    ).not.toContain(otherDb)

    await useSessionStore().load()

    // ★ Δ3 次判据（改前必红：他账号行会被导进当前账号库）
    expect(
      (await db.conversations.toArray()).map((row) => row.id),
      '他账号库不得被迁入当前账号库（跨账号＝串档）',
    ).not.toContain('c-other')
    // ★ Δ3 收口：他账号原库**逐字未动**
    expect(
      (await rawRows(otherDb)).map((row) => row.id),
      '他账号原库零删零改（保留原库）',
    ).toEqual(['c-other'])
  })

  it('对照 P10②：本账号字面形旧库**仍要迁**（口径未被误伤）', async () => {
    // 本账号的"旧字形（邮箱形段）"库：先见归一形 ⇒ 该库不在当前稳定段上
    const ownLegacy = 'baiz-u-h70813df3'
    await seedRawDb(ownLegacy, [{ id: 'c-own', title: '本账号旧字形', createdAt: 1, updatedAt: 1 }])
    // 让别名表认得两形（登录径同源）：邮箱↔归一
    const { rememberAccountLogin } = await import('../src/db/alias')
    rememberAccountLogin('1554408909@qq.com', 'x-h-1b7249424147d193')
    setDbAccount('x-h-1b7249424147d193')

    await useSessionStore().load()
    expect(
      (await db.conversations.toArray()).map((row) => row.id),
      '本账号字面形的旧库仍须只增导入（MSG-3561 B2/B3 口径不破）',
    ).toContain('c-own')
  })
})
