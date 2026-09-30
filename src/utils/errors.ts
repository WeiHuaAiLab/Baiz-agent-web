// RPC 错误 → 友好错误键：UI 据此渲染本地化文案，原始信息作详情展示。
export type FriendlyErrorKey =
  | 'network'
  | 'unauthorized'
  /** DEBT-742：会话失效（-32002 且语义为"会话已失效／服务端重启／身份不可证"） */
  | 'sessionExpired'
  /** DEBT-743：知识库（WeKnora）未配置——引导去设置页填 base_url＋api_key */
  | 'kbNotConfigured'
  /** DEBT-873：**被安全策略拒绝**（沙箱／许可面）——与 `network` **分家**。 */
  | 'policyDenied'
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
 * DEBT-873：**安全策略拒绝**分型（许可面口径）。
 *
 * 只认**策略专属词**（沙箱／安全策略／policy／sandbox）——照 `authFailure.ts`／
 * `failureText.ts` 同法："看着像就归"一律禁。故：
 *   · `Permission denied`／`Access is denied (os error 5)` 一类**系统权限·IO 面**
 *     **不**归本件（那是文件不可读，走既有预览人话），本件只认**策略拒绝**；
 *   · 裸 `denied`／`401`／`403` **不**归本件（鉴权族另有专径）。
 */
const POLICY_DENIED_RE =
  /沙箱|安全策略|策略拒绝|策略拦截|policy\s*(?:deny|denied|denies|violation|blocked|refus)|denied\s*by\s*(?:the\s+)?(?:policy|sandbox)|blocked\s*by\s*(?:the\s+)?(?:policy|sandbox)|sandbox\s*(?:deny|denied|denies|block|reject|violation)/i

/** 该文案是否＝**被安全策略拒绝**（非网络／服务失败；**终态**——不会自己好转） */
export function isPolicyDenied(text: string | undefined | null): boolean {
  return POLICY_DENIED_RE.test(String(text ?? ''))
}

/**
 * 策略拒绝的**人话**——**单一句源**：字幕（`stores/message.ts`）与工具行
 * （`utils/commandTranslator.ts`）这两个**非 i18n 面**同用此句；i18n 面
 * （toast／页头）用 `errors.policyDenied`（zh-CN／en-US）同义文案。
 * 三处口径一致：①说是**策略拒绝**不是网络；②说明**下一步**；③**不承诺重试**。
 */
export const POLICY_DENIED_HUMAN = '被安全策略拒绝（不是网络或服务失败）——这条不会自动重试，需要先放行（审批卡「申请放行」或「设置 → 工作区」授权目录）'

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
  // DEBT-873：**策略拒绝先于码面分流**——沙箱拒可随任意 JSON-RPC 码到达
  // （daemon 侧拒执行多为 `-32603`＝internal），只按码走会把"被策略拒"显成
  // 「服务内部错误」。会话失效族**除外**（照 `failureText.ts` 同法——该族另有
  // 「重新登录」专径，不得被本件吞）。
  if (isPolicyDenied(raw) && !isSessionExpiredMessage(raw)) {
    return { key: 'policyDenied', detail: raw }
  }
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
  // DEBT-873：旧式此处含 `denied` ⇒ **把"被拒"一律显成「无法连接 daemon，请检查网关设置」**
  // （凭据面真因被网络话术盖掉，用户去查网关——本债之根）。`denied` 已摘除：
  // 策略拒绝走上分流；其余 `denied` 落 `unknown`（原文照透，不谎称网络）。
  if (/failed to fetch|network|load failed|connect/i.test(raw)) {
    return { key: 'network', detail: raw }
  }
  return { key: 'unknown', detail: raw }
}
