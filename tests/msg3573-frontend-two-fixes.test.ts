// **MSG-3573 前端窗 · `1.0.25` 前端两修 · 红证／绿证**（令 §一 P1甲/丙 · P2读径）
//
// **本件可在"改前尖"直接跑**（只用 `ad0686a` 就有的 API）——红证＝把本件拷到
// `ad0686a` 工作树上跑，**下列 Δ 条必 FAIL**；绿证＝本支（改后）跑**全绿**：
//   Δ1 甲：`persisted && 空 uid` 旧口径恒判「身份未建立」⇒ 两页假提示（改前必显提示条）；
//   Δ2 丙：登录成功后重载**恒同 client**（不换新连接）；
//   Δ3 丙：`reloadAccountScoped()` 失败只 `console.warn` 吞 ⇒ 恒 resolve（不上抛）；
//   Δ4 丙：登录径装载失败仍判"成功"（无显式人话）；
//   Δ5 P2：同账号两字面形**只读当前形** ⇒ 旧字形（邮箱形段）库里的历史会话不可见。
// 对照（两侧皆绿·防误伤）：甲②（已持令牌而身份未建立仍须提示）、P2②（写径仍落当前形·旧库零写）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { resetBridgeForTests } from '../src/bridge'
import { createMockBridge } from '../src/bridge/mock'
import type { Bridge } from '../src/bridge'
import { db, dbNameFor, setDbAccount } from '../src/db'
import { MIGRATION_KEY } from '../src/db/migrate'
import { useAuthStore } from '../src/stores/auth'
import { useSessionStore } from '../src/stores/session'
import ScheduledView from '../src/components/working/ScheduledView.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 测试账号（**非凭据**：口令为假值；邮箱形／归一形与同仓既有件同源） */
const EMAIL = '1554408909@qq.com'
const NORM = 'x-h-1b7249424147d193'
const OLD_SEG_DB = 'baiz-u-h70813df3'
const ACCT = 'acct-3573@example.test'
const PW = 'pw-3573-not-real'
const LATE_UID = 'x-h-3573-late'

/** 造一个"旧字形（邮箱形段）库"（raw indexedDB·只用于喂读径） */
function seedRawDb(
  name: string,
  conversations: Record<string, unknown>[],
  messages: Record<string, unknown>[] = [],
): Promise<void> {
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
      const tx = conn.transaction(['conversations', 'messages'], 'readwrite')
      for (const row of conversations) tx.objectStore('conversations').put(row)
      for (const row of messages) tx.objectStore('messages').put(row)
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

/** 登记旧库"已导入且计数未变"⇒ 迁移器跳过 ⇒ 本条**只考读径**（不靠复制导入） */
function markImported(name: string, counts: { conversations: number; messages: number }): void {
  localStorage.setItem(
    MIGRATION_KEY,
    JSON.stringify({
      schema_version: 1,
      imported: {
        [name]: { conversations: counts.conversations, messages: counts.messages, drafts: 0, at: 1 },
      },
    }),
  )
}

/** 本地 raw 只读（**不引用本刀新 API**，本件整份可在改前尖直接跑） */
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

/**
 * 测试库隔离：删掉本进程内**测试造出的** `baiz-*` 库（fake-indexeddb 内存库·非用户数据）。
 * 目的：前序用例会建出各自账号库，若不隔离，既有迁移器（源＝**全部** `baiz-u-*` 库）
 * 会把它们导进本用例的当前库，混淆计据。
 */
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

/** 壳：首问只回 `loggedIn`、`userId` 空；再问才回 uid（＝"uid 待补"实况） */
function bridgeWithLateUid(): Bridge {
  const b = createMockBridge()
  let calls = 0
  b.identity.status = vi.fn(async () => {
    calls += 1
    return calls === 1 ? { loggedIn: true, userId: '' } : { loggedIn: true, userId: LATE_UID }
  })
  return b
}

function useCleanPinia(): void {
  setActivePinia(createPinia())
  resetClientForTests()
  sessionStorage.clear()
  localStorage.clear()
}

describe('MSG-3573 P1甲 · 持久面 uid 暂空（假提示）', () => {
  beforeEach(() => {
    useCleanPinia()
    return resetTestDbs()
  })

  it('Δ1 持久面命中而 uid 暂空 ⇒ 不显「身份未建立」，且再取一次把 uid 补齐', async () => {
    resetBridgeForTests(bridgeWithLateUid())
    const auth = useAuthStore()
    await expect(auth.hydrateAsync()).resolves.toBe(true)
    expect(auth.loggedIn, '持久面命中 ⇒ 已登录').toBe(true)
    expect(auth.userId, '壳首问未回 uid（本刀病根情形）').toBe('')

    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([])
    const wrapper = mount(ScheduledView, { global: { plugins: [i18n] } })
    await flushPromises()
    // ★ Δ1（改前必红：旧口径 `loggedIn && 空 uid` 恒真 ⇒ 假提示条）
    expect(
      wrapper.find('.identity-notice').exists(),
      '持久面命中（壳已认身份）而 uid 暂空 ⇒ 不得显「身份未建立」',
    ).toBe(false)
    // 补 uid：再取一次壳身份态 ⇒ uid 到位＋库面切本账号（T12 分段库）
    expect(auth.userId, 'uid 须补齐（再取一次 identity.status）').toBe(LATE_UID)
    expect(dbNameFor(auth.userId)).toBe(`baiz-u-${LATE_UID}`)
  })

  it('对照 甲②：已持令牌而身份未建立（非持久面）⇒ 仍须显式提示（MSG-3558 口径不受扰）', async () => {
    const b = createMockBridge()
    b.identity.status = vi.fn(async () => ({ loggedIn: false, userId: '' }))
    resetBridgeForTests(b)
    const auth = useAuthStore()
    auth.sessionToken = 'tok-placeholder'
    auth.userId = ''
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([])

    const wrapper = mount(ScheduledView, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(
      wrapper.find('.identity-notice').exists(),
      '已持令牌但身份未建立 ⇒ 提示条不得消失',
    ).toBe(true)
    expect(wrapper.text().includes(zhCN.working.emptyScheduledTitle)).toBe(false)
  })
})

describe('MSG-3573 P1丙 · 登录后同进程重载（新 client／失败上抛）', () => {
  beforeEach(() => {
    useCleanPinia()
    return resetTestDbs()
  })

  it('Δ2 登录成功 ⇒ 重载走**全新 client**', async () => {
    const auth = useAuthStore()
    const before = getClientSetup().client
    await expect(auth.login(ACCT, PW)).resolves.toBe(true)
    expect(auth.sessionToken, 'DEV 下 mock 径应换到新令牌').not.toBe('')
    // ★ Δ2（改前必红：不换连接 ⇒ 恒同实例）
    expect(
      getClientSetup().client,
      '登录后重载必须走新 client（旧连接或仍绑旧令牌）',
    ).not.toBe(before)
    expect(auth.userId, '登录须落本账号（库面据此分段）').not.toBe('')
  })

  it('Δ3 本账号重载失败 ⇒ **上抛**（禁只 console.warn 吞）', async () => {
    const auth = useAuthStore()
    const session = useSessionStore()
    session.conversations = [{ id: 'stale', title: '上一账号残留', createdAt: 1, updatedAt: 1 }]
    const spy = vi.spyOn(session, 'load').mockRejectedValue(new Error('load-fail-3573'))
    // ★ Δ3（改前必红：仅 warn ⇒ resolves）
    await expect(
      auth.reloadAccountScoped('acct-x'),
      '失败必须上抛（否则"重登即空"被静默判成成功）',
    ).rejects.toThrow()
    spy.mockRestore()
  })

  it('Δ4 登录径：账号面装载失败 ⇒ 显式上屏人话，不判"成功却空壳"', async () => {
    const auth = useAuthStore()
    const session = useSessionStore()
    vi.spyOn(session, 'load').mockRejectedValue(new Error('boom-3573'))
    // ★ Δ4（改前必红：返回 true 且 error 为空）
    await expect(auth.login(ACCT, PW)).resolves.toBe(false)
    expect(auth.error, '失败须显式上屏').toMatch(/装载失败/)
  })
})

describe('MSG-3573 P2读径 · 同账号两字面形并读（零写入）', () => {
  beforeEach(() => {
    useCleanPinia()
    return resetTestDbs()
  })

  it('Δ5 旧字形（邮箱形段）库里的历史会话须可见，且不复制／写入当前库', async () => {
    // 先见**归一形**（daemon 回的正是它）⇒ 改前尖上当前库＝`x-h` 段库，邮箱形段库被留在外面
    setDbAccount(NORM)
    dbNameFor(NORM)
    // 旧字形库＝邮箱形段（1.0.24 别名表落地**之前**写下）；本机实据同源
    await seedRawDb(OLD_SEG_DB, [
      { id: 'c-old', title: '旧字形会话', createdAt: 1, updatedAt: 1 },
    ])
    markImported(OLD_SEG_DB, { conversations: 1, messages: 0 })
    // 登录时登记邮箱形（改后＝`auth.login()` 内的**别名唯一写入点**；
    // 改前尖无该写入点，此处显式调用以**只考读径**——"未登记"那半由
    // `tests/msg3573-alias-union-unit.test.ts` 单测覆盖）
    dbNameFor(EMAIL)

    const session = useSessionStore()
    await session.load()
    // ★ Δ5（改前必红：只读当前库 ⇒ 旧字形会话不可见）
    expect(
      session.conversations.map((row) => row.id),
      '两形并读后旧字形会话须可见',
    ).toContain('c-old')
    expect(
      (await db.conversations.toArray()).map((row) => row.id),
      '并读是**读径**：老字形会话不得被复制／写入当前库',
    ).not.toContain('c-old')
  })

  it('对照 P2②：写径不变——新建会话落当前字形库，旧字形库零写', async () => {
    setDbAccount(NORM)
    dbNameFor(NORM)
    await seedRawDb(OLD_SEG_DB, [
      { id: 'c-old', title: '旧字形会话', createdAt: 1, updatedAt: 1 },
    ])
    dbNameFor(EMAIL)

    const session = useSessionStore()
    await session.load()
    await session.create('新会话-3573')

    expect(
      (await rawRows(OLD_SEG_DB)).map((row) => row.id),
      '旧字形库零写（零删除·不动数据）',
    ).toEqual(['c-old'])
    expect(
      (await db.conversations.toArray()).some((row) => row.title === '新会话-3573'),
      '写径仍落**当前形**库',
    ).toBe(true)
  })
})
