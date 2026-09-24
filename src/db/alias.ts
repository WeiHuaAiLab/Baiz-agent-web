// **MSG-3561 · 单元 B1**（老板裁：并入 1.0.24 二次热修）：**库名稳定别名映射**。
//
// 病灶：库名段由账号**字面**推导（`dbNameFor`→`accountSegment`）——同一账号在 1.0.21→1.0.24
// 期间由**邮箱形**（`1554408909@qq.com`）变为 **归一形**（`x-h-<FNV-1a64>`）⇒ 库名由
// `baiz-u-h70813df3` 变 `baiz-u-x-h-1b7249424147d193` ⇒ **老库不被打开**（"记录从零"）。
//
// 本件三条（**单一映射点·可迁移·幂等**）：
//   ① 持久别名表 `baiz.accountAlias`：`字面 → 稳定段`（**非凭据**·可明文·storage 不可用仅失续用）；
//   ② 同一账号的**两种字面**（邮箱形／归一形）经 `canonicalAccountLiterals()` 桥接到**同一条目**
//      ——归一形＝`x-h-` ＋ FNV-1a64(邮箱) 十六进制（与 daemon 侧派生一致，已实测对卯）；
//   ③ **幂等**：同一字面重复调用恒得同一段；先来先定（段的取值沿用 `accountSegment()` 既有口径，
//      故既有库名**零漂移**——新字面只是"额外记住"，不会把老库名改写）。
import { accountSegment } from './segment'

/** 别名表持久键（**非凭据**：只存账号字面与其库名段） */
export const ACCOUNT_ALIAS_KEY = 'baiz.accountAlias'

type AliasMap = Record<string, string>

/** FNV-1a 64 位（BigInt）→ 16 位十六进制：daemon 侧 `x-h-<hex>` 的依据（实测对卯过） */
export function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i))
    hash = BigInt.asUintN(64, hash * prime)
  }
  return hash.toString(16).padStart(16, '0')
}

/** 同一账号可能出现的**全部字面**（去重·保序）：原字面 ＋（邮箱形时）归一形 */
export function canonicalAccountLiterals(userId: string): string[] {
  const id = userId.trim()
  if (!id) return []
  const out = [id]
  if (id.includes('@')) {
    const norm = `x-h-${fnv1a64Hex(id)}`
    if (norm !== id) out.push(norm)
  }
  return out
}

function readAliasMap(): AliasMap {
  try {
    const raw = localStorage.getItem(ACCOUNT_ALIAS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: AliasMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeAliasMap(map: AliasMap): void {
  try {
    localStorage.setItem(ACCOUNT_ALIAS_KEY, JSON.stringify(map))
  } catch {
    /* storage 不可用：不阻断（只是下次仍按既有口径现算——段值一致，库名不变） */
  }
}

/**
 * 账号 → **稳定段**（库名段的唯一取值点）。
 * 命中既有别名 ⇒ 直接复用（**字面漂移不影响库名**）；未命中 ⇒ 以 `accountSegment()` 现算一段，
 * 并把该账号的**全部字面**登记到同一条目（先来先定·幂等）。
 */
export function stableAccountSegment(userId: string): string {
  const id = userId.trim()
  if (!id) return ''
  const map = readAliasMap()
  const literals = canonicalAccountLiterals(id)
  for (const lit of literals) {
    const hit = map[lit]
    if (hit) {
      if (!map[id]) {
        map[id] = hit
        writeAliasMap(map)
      }
      return hit
    }
  }
  const seg = accountSegment(id)
  for (const lit of literals) map[lit] = seg
  writeAliasMap(map)
  return seg
}

/** 只读别名表（诊断／验证用；返回副本） */
export function readAccountAliases(): AliasMap {
  return { ...readAliasMap() }
}
