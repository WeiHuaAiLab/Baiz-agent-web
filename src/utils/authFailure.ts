// **MSG-3558**（老板 2026-09-24 亲提）：模型鉴权失败 ⇒ **人话**；身份未建立 ⇒ **显式提示**。
//
// 口径（照令 §二）：
//   · **只认错误分型**：RPC/SSE 错误面里出现 engine 一类分型词（`engine_error`／`unavailable`／
//     `stream HTTP`／`api key`／`provider`／`model`）**且**文案含 `401`／`403`／`Unauthorized`／`invalid`；
//   · **禁用**「回复为空」「超时」冒充鉴权失败（本件对二者恒返回 false）；
//   · **禁把密钥原文上屏**：原因片段一律经 `maskedReason()` 过一遍（服务端已掩码形态照旧保留）。

/** 鉴权/授权类字面（401/403/Unauthorized/invalid）——须与 engine 分型词**同时**命中 */
const AUTH_TOKEN = /(?:^|[^0-9])(401|403)(?:[^0-9]|$)|unauthorized|invalid/i
/** engine 一类分型词（防"空回复/超时"冒充） */
const ENGINE_HINT = /engine_error|engine error|unavailable|stream\s+http|api\s*key|provider|model/i
/** 明确**不算**鉴权失败的两类（照令禁用） */
const NOT_AUTH = /(回复为空|empty (reply|response)|timeout|timed out|超时)/i

export function isModelAuthFailure(text: string | undefined | null): boolean {
  const raw = String(text ?? '')
  if (!raw.trim()) return false
  if (!AUTH_TOKEN.test(raw)) return false
  if (!ENGINE_HINT.test(raw)) return false
  // 「401 超时」这类混合串：只在**没有任何鉴权分型证据**时才被挡（此处已有 AUTH_TOKEN＋ENGINE_HINT）
  if (NOT_AUTH.test(raw) && !/unauthorized|invalid|401|403/i.test(raw)) return false
  return true
}

/**
 * 原因片段（**只允许掩码形态上屏**）：
 * 去控制字符／折叠空白／截断 160 码点／把疑似密钥串替换为 `****`。
 */
export function maskedReason(text: string | undefined | null, max = 160): string {
  let out = String(text ?? '')
  // 控制字符与 ANSI（终端色码）——不得进界面
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\u001b\[[0-9;]*m/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ')
  out = out.replace(/\s+/g, ' ').trim()
  // 密钥形态一律掩掉（sk-xxx／长随机串／api key 值）
  out = out.replace(/\b(sk|ak|api[_-]?key)[-_:=]?[A-Za-z0-9_-]{6,}/gi, (_m, p1: string) => `${p1}-****`)
  out = out.replace(/"?(api[_-]?key|token|secret)"?\s*[:=]\s*"?[^",\s}]+/gi, (_m, p1: string) => `${p1}=****`)
  out = out.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '****')
  if (out.length > max) out = `${out.slice(0, max)}…`
  return out
}

/** 当前模型名（与设置页枚举同源；未知值回落 Pro 名） */
export function modelDisplayName(model: string | undefined | null): string {
  return model === 'deepseek-v4-flash' ? 'DeepSeek V4 Flash' : 'DeepSeek V4 Pro'
}

/** 身份未建立（未登录面）：**空 uid** ⇒ true（已持有令牌但身份未建立也算） */
export function isIdentityMissing(userId: string | undefined | null): boolean {
  return String(userId ?? '').trim().length === 0
}

// ── T3／DEBT-875(a)：「乱输入也能登录」的**前端面**闸 ──
//
// 病灶（DEBT-875 原文 · 测试员 T3a）：`LoginView.vue` 改前对账号密码**只判非空、不判形态**——
// `:disabled="auth.loading || !email || !password"` 连「纯空白串」都挡不住（`'   '` 是 JS 真值），
// 更遑论 `asdf` 这类明显不是账号的输入：一律原样发给后端。
//
// **本闸只拦"明显非法"**：空／纯空白／无 @／多 @／@ 两侧缺／域名无点／含空白字符。
// 三条自我约束（勿越界）：
//   ① **不做**口令复杂度、长度、字符集策略——那是口径决策，不是前端该自拟的东西；
//   ② **不替代**后端校验——前端闸从来不是安全边界，后端**仍须独立校验**（本条不改后端）；
//   ③ 判据是**纯函数**，故可机判、可单测，不依赖组件挂载。

/**
 * 账号形态判据：**只认明显非法** ⇒ true。
 *
 * 邮箱形有据：`LoginView.vue:5` 的登录提示（"请使用 https://kb.ruiac.net/ 的账号登录"）
 * 与 `:20` 的 `placeholder="邮箱"`，且 `stores/auth.ts:167` 的别名写入点即按「邮箱形／归一形」
 * 登记 ⇒ 本产品的账号**就是邮箱形**。
 * 若日后放开非邮箱用户名，**只需放宽本函数**（唯一判据点），组件与测试无须动。
 */
export function isObviouslyInvalidAccount(raw: string): boolean {
  const value = String(raw ?? '').trim()
  if (!value) return true
  if (/\s/.test(value)) return true
  const parts = value.split('@')
  if (parts.length !== 2) return true
  const [local, domain] = parts
  if (!local) return true
  // 域名须至少一段点分层级（`a@b` 属明显非法；`a@b.c` 放行）
  return !/^[^@.\s]+(\.[^@.\s]+)+$/.test(domain)
}

/**
 * 登录表单校验（纯函数·可机判）：**空串＝通过**；否则返回**人话**（组件直接上屏）。
 * 顺序固定：先账号后口令——一次只说一条，免得两句同时挂着让人不知道先改哪个。
 */
export function validateLoginInput(account: string, password: string): string {
  if (!String(account ?? '').trim()) return '请输入账号'
  if (isObviouslyInvalidAccount(account)) return '账号格式不对——请填完整邮箱，例如 you@example.com'
  if (!String(password ?? '').trim()) return '请输入密码'
  return ''
}
