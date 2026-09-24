// **账号 → 库名段**（纯函数·无副作用）——从 `db/index.ts` 拆出，供别名表复用（免循环依赖）。
/** 账号 → 库名段：可读 id 直用；含异常字符则取稳定哈希（FNV-1a 32 位·十六进制）。
 *  **MSG-3592 P0**：入参允许 `undefined`（层错／缺字段面）——**一律兜底空串**，禁抛。 */
export function accountSegment(userId: string | undefined | null): string {
  const id = (userId ?? '').trim()
  if (/^[A-Za-z0-9._-]{1,48}$/.test(id)) return id
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `h${hash.toString(16).padStart(8, '0')}`
}
