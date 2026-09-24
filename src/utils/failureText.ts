// **MSG-3575 · P5 前端面**：失败**人话＋降噪**（外网取件／知识库不可用）。
//
// 口径（照令 §一 P5）：
//   · 外网取件／KB 不可用 ⇒ **一句人话**（"网络取件不可用·已跳过"／"知识库暂不可用"）；
//   · **同类重复失败合并**（不刷屏）——连续同类失败折成一条（带 ×N）；
//   · **不得**显示内部号／术语（`-32xxx`、方法名、URL、base_url 一律不上屏）。
//
// 判据形态（与 `authFailure.ts` 同法）：**只认分型词**，禁"看着像就归"——
//   · 外网取件须命中**取件分型**（`web_fetch`／`web.search`／外网域名族／DNS/连接拒绝）；
//   · 知识库须命中 **KB 分型**（`weknora`／`kb_list`／知识库）；
//   · **会话失效／鉴权**类**不归本件**（走 DEBT-742/743 既有面：重新登录／配 Key）；
//   · 一律不把原文交给界面渲染（本件返回 i18n 键，原文只进日志）。

/** 外网取件分型（须含**取件专属词**——裸 "timeout" 不认，免把模型超时误报成取件失败） */
const NET_FETCH_RE =
  /web[_\s.-]?fetch|web[_\s.-]?search|外网|取件|无法取件|hn\.algolia|ycombinator|\bbing\b|\bnet::|enotfound|econnrefused|dns\s*(?:error|failure)|connection\s*(?:refused|reset|timed?\s*out)/i
/** 知识库分型 */
const KB_RE = /weknora|kb[_\s.-]?(?:list|search|query)|\bknowledge\s*base\b|知识库/i
/** 会话失效／鉴权类（**本件不接**——各归既有面） */
const AUTH_OR_SESSION_RE = /会话已失效|会话失效|服务端重启|身份不可证|未授权|unauthor|401|403/i

export type RuntimeFailureKind = 'netFetch' | 'kb'

/** 分型（非本件范围 ⇒ null） */
export function classifyRuntimeFailure(text: string | undefined | null): RuntimeFailureKind | null {
  const raw = String(text ?? '')
  if (!raw.trim()) return null
  if (AUTH_OR_SESSION_RE.test(raw)) return null
  if (KB_RE.test(raw)) return 'kb'
  if (NET_FETCH_RE.test(raw)) return 'netFetch'
  return null
}

/** i18n 键（`errors.*`）——命中本件分型才有；无 ⇒ null（原样按既有面渲染） */
export function runtimeFailureI18nKey(
  text: string | undefined | null,
): 'netFetchUnavailable' | 'kbUnavailable' | null {
  const kind = classifyRuntimeFailure(text)
  if (kind === 'netFetch') return 'netFetchUnavailable'
  if (kind === 'kb') return 'kbUnavailable'
  return null
}

export interface CompactedItem<T> {
  item: T
  /** 本条代表了几条同类失败（1＝未合并） */
  repeat: number
}

/**
 * **同类重复失败合并（不刷屏）**：把**连续**且**同类**（`kindOf` 返回值相同且非空）的项折成
 * 一条（代表项＝首条，`repeat` 计数）；非本件分型（`null`）**逐条照原**——零误伤。
 * 纯函数（可机判），调用方（`ChatContent`）据此少渲染 N−1 张同类失败条。
 */
export function compactRuntimeFailures<T>(
  items: T[],
  kindOf: (item: T) => RuntimeFailureKind | null,
): CompactedItem<T>[] {
  const out: CompactedItem<T>[] = []
  for (const item of items) {
    const kind = kindOf(item)
    const last = out[out.length - 1]
    if (kind && last && kindOf(last.item) === kind) {
      last.repeat += 1
      continue
    }
    out.push({ item, repeat: 1 })
  }
  return out
}
