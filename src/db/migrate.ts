// **MSG-3561 · 单元 B2/B3**（老板裁：并入 1.0.24 二次热修）：**旧库只增导入 ＋ 可重入迁移器**。
//
// 口径（照令）：
//   · **只增**：把旧库（`baiz` 无账号段旧库 ＋ 任何 `baiz-u-*` 旧段库）里的会话/消息/草稿
//     复制进**当前账号库**；**同 id 已存在⇒跳过**（不覆盖、不重复）；
//   · **旧库保留不删**：读取一律用 `indexedDB.open(name)` **不带版本**（绝不触发升级/改写）；
//   · **迁移器带 `schema_version` ＋幂等标记**（`localStorage['baiz.migration']`）：同一源库
//     计数未变 ⇒ **直接跳过**；**连跑两次结果一致**（计数与行数均不增）。
import Dexie from 'dexie'
import { LEGACY_DB_NAME, currentDbName, db } from './index'

/** 迁移状态持久键 */
export const MIGRATION_KEY = 'baiz.migration'
/** 迁移器版本（新增一步＝在 `migrate()` 里追加 case，不改旧步——见方案 §六） */
export const SCHEMA_VERSION = 1

export interface ImportedCounts {
  conversations: number
  messages: number
  drafts: number
  at: number
}
export interface MigrationState {
  schema_version: number
  imported: Record<string, ImportedCounts>
}

const EMPTY_STORES = ['conversations', 'messages', 'drafts'] as const
type StoreName = (typeof EMPTY_STORES)[number]

export function readMigrationState(): MigrationState {
  try {
    const raw = localStorage.getItem(MIGRATION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MigrationState
      if (parsed && typeof parsed.schema_version === 'number' && parsed.imported) return parsed
    }
  } catch {
    /* 损坏的标记按"未迁移"处理（只增导入本身幂等，重跑无害） */
  }
  return { schema_version: SCHEMA_VERSION, imported: {} }
}

function writeMigrationState(state: MigrationState): void {
  try {
    localStorage.setItem(MIGRATION_KEY, JSON.stringify(state))
  } catch {
    /* storage 不可用：不阻断（下次重跑，只增导入仍安全） */
  }
}

/** 列出候选源库（当前库除外）：旧无账号库 ＋ 任何 `baiz-u-*` 旧段库 */
export async function candidateSourceDbs(): Promise<string[]> {
  const current = currentDbName()
  const out: string[] = []
  try {
    if (typeof indexedDB.databases !== 'function') {
      return [LEGACY_DB_NAME].filter((n) => n !== current)
    }
    const list = await indexedDB.databases()
    for (const entry of list) {
      const name = entry?.name ?? ''
      if (!name || name === current) continue
      if (name === LEGACY_DB_NAME || name.startsWith('baiz-u-')) out.push(name)
    }
  } catch {
    return [LEGACY_DB_NAME].filter((n) => n !== current)
  }
  return out.sort()
}

interface RawSnapshot {
  name: string
  rows: Record<StoreName, Record<string, unknown>[]>
  counts: ImportedCounts
}

/** 只读快照：`indexedDB.open` **不带版本** ⇒ 绝不升级/改写旧库 */
function snapshot(name: string): Promise<RawSnapshot | null> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(name)
    } catch {
      resolve(null)
      return
    }
    req.onerror = () => resolve(null)
    req.onupgradeneeded = () => {
      // 不带版本时不会走到这里；万一走到 ⇒ 立刻中止（不建新库、不改旧库）
      try {
        req.transaction?.abort()
      } catch {
        /* noop */
      }
    }
    req.onsuccess = () => {
      const conn = req.result
      const present = EMPTY_STORES.filter((s) => conn.objectStoreNames.contains(s))
      if (present.length === 0) {
        conn.close()
        resolve(null)
        return
      }
      const rows = { conversations: [], messages: [], drafts: [] } as Record<
        StoreName,
        Record<string, unknown>[]
      >
      const tx = conn.transaction(present as unknown as string[], 'readonly')
      let pending = present.length
      const done = () => {
        pending -= 1
        if (pending > 0) return
        conn.close()
        resolve({
          name,
          rows,
          counts: {
            conversations: rows.conversations.length,
            messages: rows.messages.length,
            drafts: rows.drafts.length,
            at: Date.now(),
          },
        })
      }
      for (const store of present) {
        const all = tx.objectStore(store).getAll()
        all.onsuccess = () => {
          rows[store] = (all.result ?? []) as Record<string, unknown>[]
          done()
        }
        all.onerror = () => done()
      }
    }
  })
}

/** 目标库里已有的主键（只增导入的判据） */
async function existingKeys(store: StoreName): Promise<Set<string>> {
  const table = db[store] as unknown as Dexie.Table<Record<string, unknown>, string>
  const keys = (await table.toCollection().primaryKeys()) as unknown as string[]
  return new Set(keys.map((k) => String(k)))
}

export interface ImportReport {
  imported: string[]
  skipped: string[]
  added: { conversations: number; messages: number; drafts: number }
}

/**
 * **只增导入**：把候选旧库中"当前库还没有的主键"复制进当前库。
 * 幂等：已登记且计数未变 ⇒ 跳过；重复调用 ⇒ `added` 恒为 0（**连跑两次结果一致**）。
 */
export async function importLegacyIntoCurrent(
  names?: string[],
): Promise<ImportReport> {
  const state = readMigrationState()
  state.schema_version = SCHEMA_VERSION
  const sources = names ?? (await candidateSourceDbs())
  const report: ImportReport = {
    imported: [],
    skipped: [],
    added: { conversations: 0, messages: 0, drafts: 0 },
  }
  for (const name of sources) {
    const snap = await snapshot(name)
    if (!snap) continue
    const prev = state.imported[name]
    if (
      prev &&
      prev.conversations === snap.counts.conversations &&
      prev.messages === snap.counts.messages &&
      prev.drafts === snap.counts.drafts
    ) {
      report.skipped.push(name)
      continue
    }
    for (const store of EMPTY_STORES) {
      const rows = snap.rows[store]
      if (!rows.length) continue
      const have = await existingKeys(store)
      const fresh = rows.filter((row) => !have.has(String(row.id ?? row.conversationId ?? '')))
      if (!fresh.length) continue
      const table = db[store] as unknown as Dexie.Table<Record<string, unknown>, string>
      for (const row of fresh) {
        await table.add(row)
        report.added[store] += 1
      }
    }
    state.imported[name] = { ...snap.counts }
    report.imported.push(name)
  }
  writeMigrationState(state)
  return report
}

/** 该源库是否已登记且计数未变（诊断用） */
export function isImported(name: string, counts: Omit<ImportedCounts, 'at'>): boolean {
  const prev = readMigrationState().imported[name]
  return Boolean(
    prev &&
      prev.conversations === counts.conversations &&
      prev.messages === counts.messages &&
      prev.drafts === counts.drafts,
  )
}
