// 微信展示页数据层（MSG-2418 甲）：读接收端归档接口。
// 契约照 2418 乙终态：GET /wechat-recv/messages?since=N → {messages:[{id,type,from,text,ts}]}
// ——同源路径（nginx /wechat-view/ 与 /wechat-recv/ 同站点——零 CORS 实证面）。
// 凭据纪律：token 由页面配置占位（老板直注）——本层仅携带（非空才带
// Authorization: Bearer），零落盘零硬码。

/** 接收端归档消息行（契约字段——id 为递增游标）。 */
export interface WechatRecvMessage {
  id: number
  type: string
  from: string
  text: string
  ts: number
}

export interface WechatFetchResult {
  messages: WechatRecvMessage[]
}

/** 拉取一页：since=游标（0=从头）——空批即尾。token 空串不携带。 */
export async function fetchWechatMessages(
  since: number,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WechatRecvMessage[]> {
  const headers: Record<string, string> | undefined = token
    ? { Authorization: `Bearer ${token}` }
    : undefined
  const res = await fetchImpl(
    `/wechat-recv/messages?since=${since}`,
    headers ? { headers } : undefined,
  )
  if (!res.ok) {
    throw new Error(`wechat-recv 拉取失败 HTTP ${res.status}`)
  }
  const body = (await res.json()) as WechatFetchResult
  return Array.isArray(body.messages) ? body.messages : []
}

/** 全量拉取：since=0 逐页推进至空批——无重无漏（游标即末 id 续拉）。 */
export async function fetchAllWechatMessages(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WechatRecvMessage[]> {
  const all: WechatRecvMessage[] = []
  let since = 0
  for (let guard = 0; guard < 1000; guard += 1) {
    const page = await fetchWechatMessages(since, token, fetchImpl)
    if (page.length === 0) break
    all.push(...page)
    since = page[page.length - 1].id
  }
  return all
}
