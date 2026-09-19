// RPC 错误 → 友好错误键：UI 据此渲染本地化文案，原始信息作详情展示。
export type FriendlyErrorKey =
  | 'network'
  | 'unauthorized'
  /** DEBT-742：会话失效（-32002 且语义为"会话已失效／服务端重启／身份不可证"） */
  | 'sessionExpired'
  /** DEBT-743：知识库（WeKnora）未配置——引导去设置页填 base_url＋api_key */
  | 'kbNotConfigured'
  | 'invalidParams'
  | 'methodNotFound'
  | 'taskNotFound'
  | 'internal'
  | 'unknown'

/**
 * DEBT-742：`-32002` **必须按语义分流**——daemon 的 `-32002` 有两种：
 * ①会话失效（「会话已失效或服务端重启后身份不可证——请重新登录」）⇒ **登录过期**族，
 * 　 引导**重新登录**（清失效 token），**不是** API Key 问题；
 * ②真正的未授权（凭据面）⇒ 保留 KEY 族文案。
 * 旧版一律映射 `unauthorized` ⇒ 把用户引到 API Key 上去（KEY 其实早存好了）——本债之根。
 */
const SESSION_EXPIRED_RE =
  /会话已失效|会话失效|服务端重启|身份不可证|重新登录|登录已过期|session\s*(?:expired|invalid|revoked)|not\s+authenticated|re-?login/i

export function isSessionExpiredMessage(message: string): boolean {
  return SESSION_EXPIRED_RE.test(message)
}

export function mapRpcError(error: unknown): { key: FriendlyErrorKey; detail: string } {
  const raw = error instanceof Error ? error.message : String(error)
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: number }).code
    if (code === -32002) {
      return { key: isSessionExpiredMessage(raw) ? 'sessionExpired' : 'unauthorized', detail: raw }
    }
    if (code === -32010) return { key: 'kbNotConfigured', detail: raw }
    if (code === -32602) return { key: 'invalidParams', detail: raw }
    if (code === -32601) return { key: 'methodNotFound', detail: raw }
    if (code === -32001) return { key: 'taskNotFound', detail: raw }
    if (code === -32700 || code === -32600 || code === -32603) return { key: 'internal', detail: raw }
  }
  if (/failed to fetch|network|load failed|connect|denied/i.test(raw)) {
    return { key: 'network', detail: raw }
  }
  return { key: 'unknown', detail: raw }
}
