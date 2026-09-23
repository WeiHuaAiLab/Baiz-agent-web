// MSG-3485（T12 前端取值面）：会话/消息/草稿**按账号分段**——甲案＝**库名分段**。
//
// 病灶（MSG-3471 定位·MSG-3480 判「T12 端到端不成立」）：Dexie 库名**恒为 `baiz`**，
// 且 `conversations/messages/drafts` 三表**无账号维** ⇒ 换账号仍见旧会话（跨账号串档）。
//
// 本件（甲案）三条：
//   ① 库名＝`baiz-u-<账号段>`（登录后）／`baiz-anon`（未登录或账号未知·fail-closed）；
//   ② 旧库 **`baiz` 一律不打开**——既有一切数据**零删零改**（原地保留·可清点·不静默丢）；
//   ③ **单点收口**：`db` 为"当前账号库"的**懒门面**，既有 30+ 调用点（session／message／
//      drafts／demo seed／设置卡）**零改**即自动带账号维。
//
// 为何选甲案（而非"三表加 owner 维并过滤"）：
//   ① 分区最彻底——跨账号**连库都不共享**，无"漏加谓词即回漏"的散点风险；
//   ② 无主旧数据天然"不归任何账号"，语义与 daemon 侧「按账号分区＋旧数据不显示」一致；
//   ③ 改动面最小且**不碰行数基线件**（`src/stores/message.ts` 已顶 980 行基线，
//      任何在该件加行即触 loc-gate 红；乙案必改该件所有查询点）。
import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { ChatMessage, Conversation } from '../models'

export interface DraftRow {
  conversationId: string
  text: string
  updatedAt: number
}

/** 1.0.21 及以前的唯一库名（无账号维）——新代码**永不打开**（旧数据零删零改） */
export const LEGACY_DB_NAME = 'baiz'
/** 未登录／账号未知 ⇒ 独立库（fail-closed：宁空勿串档） */
export const ANON_DB_NAME = 'baiz-anon'
/** 登录后库名前缀：`baiz-u-<账号段>` */
export const ACCOUNT_DB_PREFIX = 'baiz-u-'
/** 账号标识的本地持久键（**非凭据**：只存 daemon 下发的 user_id，供"重载后仍落同库"） */
export const ACCOUNT_STORAGE_KEY = 'baiz.account'

/** 账号 → 库名段：可读 id 直用；含异常字符则取稳定哈希（FNV-1a 32 位·十六进制） */
export function accountSegment(userId: string): string {
  const id = userId.trim()
  if (/^[A-Za-z0-9._-]{1,48}$/.test(id)) return id
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `h${hash.toString(16).padStart(8, '0')}`
}

/** 账号 → 库名（**唯一映射点**：全部取值面都经此处 ⇒ 注掉账号维必然整体回漏） */
export function dbNameFor(userId: string | null | undefined): string {
  const id = (userId ?? '').trim()
  return id ? `${ACCOUNT_DB_PREFIX}${accountSegment(id)}` : ANON_DB_NAME
}

class BaizDatabase extends Dexie {
  conversations!: Table<Conversation, string>
  messages!: Table<ChatMessage, string>
  drafts!: Table<DraftRow, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      conversations: 'id, title, createdAt, updatedAt',
      messages: 'id, conversationId, createdAt',
    })
    this.version(2).stores({
      conversations: 'id, title, createdAt, updatedAt',
      messages: 'id, conversationId, createdAt',
      drafts: 'conversationId, updatedAt',
    })
    this.version(3).stores({
      conversations: 'id, title, createdAt, updatedAt, pinnedAt',
      messages: 'id, conversationId, createdAt',
      drafts: 'conversationId, updatedAt',
    })
  }
}

const instances = new Map<string, BaizDatabase>()

/** 当前账号（空＝未登录／账号未知）。启动恢复与登录/登出时由 auth store 经 `setDbAccount` 写入。 */
let currentAccount = ''

export function setDbAccount(userId: string | null | undefined): void {
  currentAccount = (userId ?? '').trim()
}

export function currentDbAccount(): string {
  return currentAccount
}

export function currentDbName(): string {
  return dbNameFor(currentAccount)
}

function instanceFor(name: string): BaizDatabase {
  let inst = instances.get(name)
  if (!inst) {
    inst = new BaizDatabase(name)
    instances.set(name, inst)
  }
  return inst
}

/**
 * 懒门面：每次属性访问**按当前账号**解析库实例（切账号零重建、零残留）；
 * 函数项绑定到该实例（`db.delete()`／`db.table()` 等内部依赖 Dexie 实例自身 this）。
 */
export const db: BaizDatabase = new Proxy({} as BaizDatabase, {
  get(_target, prop) {
    const inst = instanceFor(currentDbName())
    const value = (inst as unknown as Record<PropertyKey, unknown>)[prop]
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(inst)
      : value
  },
})

/** 账号键本地持久（**非凭据**）：为"重载后仍落同库"；storage 不可用仅失该续用，不阻断登录。 */
export function readStoredAccount(): string {
  try {
    return (localStorage.getItem(ACCOUNT_STORAGE_KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export function storeAccount(userId: string): void {
  try {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, userId)
  } catch {
    /* storage 不可用：零阻断（只是重载后退回"账号未知"fail-closed） */
  }
}

export function clearStoredAccount(): void {
  try {
    localStorage.removeItem(ACCOUNT_STORAGE_KEY)
  } catch {
    /* 同上 */
  }
}

export interface LegacySummary {
  name: string
  conversations: number
  messages: number
  drafts: number
}

/**
 * **旧库（无账号段 `baiz`）只读清点**：只数不写、**不建库**、不删改——供"存在 N 条旧版
 * 会话（本版不显示）"的显式提示用（**不许静默丢**：旧数据原地保留，要归属须显式迁移令）。
 * 清点能力缺失（无 `indexedDB.databases`）⇒ 返全 0（**宁不提示，也不为清点建库**）。
 */
export async function legacyDbSummary(): Promise<LegacySummary> {
  const empty: LegacySummary = {
    name: LEGACY_DB_NAME,
    conversations: 0,
    messages: 0,
    drafts: 0,
  }
  try {
    if (typeof indexedDB.databases !== 'function') return empty
    const list = await indexedDB.databases()
    if (!list.some((entry) => entry.name === LEGACY_DB_NAME)) return empty
    return { ...empty, ...(await countLegacyStores()) }
  } catch {
    return empty
  }
}

function countLegacyStores(): Promise<Partial<LegacySummary>> {
  return new Promise((resolve) => {
    const req = indexedDB.open(LEGACY_DB_NAME)
    req.onerror = () => resolve({})
    req.onsuccess = () => {
      const conn = req.result
      const names = ['conversations', 'messages', 'drafts'].filter((store) =>
        conn.objectStoreNames.contains(store),
      )
      if (names.length === 0) {
        conn.close()
        resolve({})
        return
      }
      const out: Record<string, number> = {}
      let pending = names.length
      const done = () => {
        pending -= 1
        if (pending === 0) {
          conn.close()
          resolve(out as Partial<LegacySummary>)
        }
      }
      const tx = conn.transaction(names, 'readonly')
      for (const name of names) {
        const countReq = tx.objectStore(name).count()
        countReq.onsuccess = () => {
          out[name] = countReq.result
          done()
        }
        countReq.onerror = () => done()
      }
    }
  })
}
