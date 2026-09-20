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

/**
 * MSG-3218 ①：列目录失败文案归一（**禁静默兜空**）。
 * 壳侧原文形＝`目录读取失败: {os error}`（`src-tauri/src/host.rs:67`）——原文一律透传，
 * 仅在缺前导时补 `目录读取失败：`，并在缺"怎么修"时补一句可行动指引。
 * 三处吞错点（tauri 桥／web 桥／store）与面板共用此文案，保证**同形可断言**。
 */
export function dirReadFailedText(key: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  const head = detail.includes('目录读取失败') ? detail : `目录读取失败：${detail}`
  if (head.includes('重新授权')) return head
  return `${head}（授权目录：${key}）——该目录可能已失效、被移动或不可访问，请在「设置 → 工作区」重新授权后再试`
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
