// **MSG-3577 · P9**：「重置演示数据」按钮**护栏**（四条）。
//
// 病灶（照令 §一）：旧 `DemoCard.resetDemo()` ＝ `confirm` ⇒ **`db.delete()`** ⇒ 删**所有**
// `baiz.*` 键 ⇒ `reload()`。它能**清掉真数据**：本地分段库（会话/消息/任务镜像）**整库删除**；
// 账号键与**别名表**一并清 ⇒ 破坏 `MSG-3573` 的 P2 两字形并读（旧字形数据再次看不见）；
// 而**前端无"列会话"daemon RPC** ⇒ 删后不可回填。现仅一层浏览器 `confirm`。
//
// 本件四条（**逐条对应令 §二**）：
//   ① **正式版收口**：`demoResetAvailable()`——仅 dev 构建或显式演示构建可用（正式版**不可达**）；
//   ② **输入式确认**：`phraseMatches()`（须逐字输入「重置」）＋界面**逐条列出将清什么**；
//   ③ **清前备份**：`collectBackup()`＋`downloadTextFile()` 先导出 `baiz-backup-<ts>.json`；
//      **禁 `db.delete()`**——只清**当前账号库三表**（库本体保留·可诊断）；
//   ④ **别名表保护**：清 `baiz.*` 时**保留** `baiz.accountAlias`（P2 并读的字面来源）。
import { db } from '../db'
import { ACCOUNT_ALIAS_KEY } from '../db/alias'

/** ② 输入式确认口令（逐字） */
export const DEMO_RESET_PHRASE = '重置'

/** ④ 受保护键（清 `baiz.*` 时**保留**）：别名表＝P2 两字形并读的字面来源 */
export const PROTECTED_LOCAL_KEYS: readonly string[] = [ACCOUNT_ALIAS_KEY]

export function isProtectedLocalKey(key: string): boolean {
  return PROTECTED_LOCAL_KEYS.some((protectedKey) => key === protectedKey)
}

/**
 * ① **正式版收口**：只有 **dev 构建**（`import.meta.env.DEV`）或**显式演示构建**
 * （`VITE_BAIZ_DEMO=1`）才可用——正式版**不渲染该卡**（代码保留·不可达）。
 * 显式传 `env` 便于单测（默认读真实构建变量）。
 */
export function demoResetAvailable(env?: { dev?: boolean; demo?: string }): boolean {
  const resolved = env ?? {
    dev: import.meta.env.DEV === true,
    demo: import.meta.env.VITE_BAIZ_DEMO as string | undefined,
  }
  return resolved.dev === true || String(resolved.demo ?? '') === '1'
}

/** ② 输入式确认判据（纯函数·可机判）：首尾空白不算，须逐字等于口令 */
export function phraseMatches(input: string): boolean {
  return String(input ?? '').trim() === DEMO_RESET_PHRASE
}

/** 将清的 `baiz.*` 键（**保护键除外**）——供界面**逐条列出** */
export function keysToClear(storage: Storage = localStorage): string[] {
  return Object.keys(storage)
    .filter((key) => key.startsWith('baiz.') && !isProtectedLocalKey(key))
    .sort()
}

/** 备份文件名（时间戳形态·可排序） */
export function backupFileName(now: number = Date.now()): string {
  return `baiz-backup-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`
}

export interface DemoBackup {
  schema: 'baiz-local-backup/1'
  at: string
  /** 逐条说明（给用户看：这份备份里有什么、没有什么） */
  note: string
  localStorage: Record<string, string>
  conversations: unknown[]
  messages: unknown[]
  drafts: unknown[]
}

/**
 * ③ **清前备份**：当前账号库三表全文 ＋ **全部** `baiz.*` 键（**含别名表**）。
 * 只读（**不写不删**）；读失败即抛（调用方**不得**在无备份的情况下继续清场）。
 */
export async function collectBackup(
  storage: Storage = localStorage,
  now: number = Date.now(),
): Promise<DemoBackup> {
  const local: Record<string, string> = {}
  for (const key of Object.keys(storage)) {
    if (key.startsWith('baiz.')) local[key] = String(storage.getItem(key) ?? '')
  }
  return {
    schema: 'baiz-local-backup/1',
    at: new Date(now).toISOString(),
    note: '仅含本机数据（本地会话库三表 ＋ baiz.* 设置键，含账号别名表）；不含 daemon/服务器数据。',
    localStorage: local,
    conversations: (await db.conversations.toArray()) as unknown[],
    messages: (await db.messages.toArray()) as unknown[],
    drafts: (await db.drafts.toArray()) as unknown[],
  }
}

export function backupJsonText(backup: DemoBackup): string {
  return JSON.stringify(backup, null, 2)
}

/** 触发一次本地下载（无网络·零上传） */
export function downloadTextFile(
  name: string,
  text: string,
  doc: Document = document,
): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = doc.createElement('a')
  anchor.href = url
  anchor.download = name
  doc.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export interface DemoResetResult {
  clearedTables: string[]
  removedKeys: string[]
  keptKeys: string[]
}

/**
 * ③④ **清场**（**禁 `db.delete()`**）：
 *   · 只清**当前账号库**的 `conversations`／`messages`／`drafts` 三表（**库本体保留**）；
 *   · 只删**非保护**的 `baiz.*` 键；**别名表保留**（`keptKeys` 回报·可断言）；
 *   · **不动** daemon/服务器数据（前端根本无该通路）。
 */
export async function clearLocalDemoData(storage: Storage = localStorage): Promise<DemoResetResult> {
  const clearedTables: string[] = []
  const tables = [db.conversations, db.messages, db.drafts]
  const names = ['conversations', 'messages', 'drafts']
  for (let i = 0; i < tables.length; i += 1) {
    await tables[i].clear()
    clearedTables.push(names[i])
  }
  const removedKeys: string[] = []
  const keptKeys: string[] = []
  for (const key of Object.keys(storage)) {
    if (!key.startsWith('baiz.')) continue
    if (isProtectedLocalKey(key)) {
      keptKeys.push(key)
      continue
    }
    storage.removeItem(key)
    removedKeys.push(key)
  }
  return { clearedTables, removedKeys, keptKeys }
}
