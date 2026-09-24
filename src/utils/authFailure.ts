// **MSG-3558**（老板 2026-09-24 亲提）：模型鉴权失败 ⇒ **人话**；身份未建立 ⇒ **显式提示**。
//
// 口径（照令 §二）：
//   · **只认错误分型**：RPC/SSE 错误面里出现 engine 一类分型词（`engine_error`／`unavailable`／
//     `stream HTTP`／`api key`／`provider`／`model`）**且**文案含 `401`／`403`／`Unauthorized`／`invalid`；
//   · **禁用**「回复为空」「超时」冒充鉴权失败（本件对二者恒返回 false）；
//   · **禁把密钥原文上屏**：原因片段一律经 `maskedReason()` 过一遍（服务端已掩码形态照旧保留）。

// 补席 B（KIMI 点名②-b）：登录面文案走 i18n（改前硬编码中文 ⇒ en-US 用户看中文）
import { t } from '../locales/runtime'

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
 *
 * 补席 B（KIMI 点名②-b）：三句**走 i18n**（`login.*`）——改前是硬编码中文，
 * en-US 用户切了语言、登录页仍出中文（＝文案没走 i18n）。判据面**零行为变化**：
 * 未登记 i18n 面（单测）按 `locales/runtime.ts` 口径回落 zh-CN 源文案，字面与改前逐字一致。
 */
export function validateLoginInput(account: string, password: string): string {
  if (!String(account ?? '').trim()) return t('login.needAccount')
  if (isObviouslyInvalidAccount(account)) return t('login.badAccount')
  if (!String(password ?? '').trim()) return t('login.needPassword')
  return ''
}

// ── 补席 B（KIMI 点名②-a）：登录失败的**传输面／5xx** 分型 ──
//
// 病灶：`stores/auth.ts:199-204` 把 `e.message`（剥 RPC 前缀后）**原样透传上屏**，
// 只在命中 `mock|password|token|secret|key` 时才回落通用词 ⇒ 下列机器语**照上屏**：
//   · web 径 fetch 失败 ⇒ `Failed to fetch`（浏览器英文原话，用户看不懂）；
//   · `/stream` 非 2xx ⇒ `http stream failed: 500`（`client/transports/http.ts:57`）；
//   · 壳未连通 ⇒ `transport not connected`（`client/transports/tauri.ts:174`）；
//   · 未配网关且未开演示 ⇒ `未连接本地服务：…VITE_BAIZ_GATEWAY…`（`client/factory.ts:43,67`
//     ——把环境变量名糊到用户脸上）；
//   · 5xx 正文非 JSON ⇒ `response.json()` 解包即败（`http.ts:72`）：`Unexpected token '<' …`。
// 这些**都不是**"账号密码错"，也不该让用户去猜 —— 一律转人话（`login.unreachable`）。
//
// 判据纪律：**逐字面型**（上列各条＋同族通用名）——照本仓 `utils/errors.ts` 的
// `POLICY_DENIED_RE`／`authFailure.ts` 的 `ENGINE_HINT` 同法："看着像就归"一律禁。
// **不**按裸数字判 5xx（`\b5\d\d\b` 会把"500 字节"这类计数误归 ⇒ 反而盖掉真因）。
const TRANSPORT_FAILURE_RE = new RegExp(
  [
    'failed to fetch', // 浏览器 fetch 失败（网络不通／被拦／DNS）
    'network\\s*error', // Firefox 实形 `NetworkError when attempting to fetch resource`／RN 同族
    'network request failed',
    'load failed', // Safari 同族
    'http stream failed', // 本仓 http.ts:57（5xx 的 status 原文挂在此句尾）
    'transport not connected', // 本仓 tauri.ts:174（壳未连通）
    '未连接本地服务', // 本仓 factory.ts:43,67（未配网关、未开演示）
    'econnrefused',
    'etimedout',
    'network is unreachable',
    'connection refused',
    'connection reset',
    'connection closed',
    'timed out',
    'timeout',
    '超时',
    'unexpected token', // 5xx 非 JSON 正文 ⇒ json() 解包失败
    'is not valid json',
    'malformed rpc response', // 本仓 http.ts:77（应答不成形）
  ].join('|'),
  'i',
)

/**
 * 是否「连不上服务／服务端没给出可用应答」一族（**非**账号密码错）。
 * 纯函数·可机判；命中的调用方应上屏**人话**（`login.unreachable`），不得透传原文。
 */
export function isTransportFailure(text: string | undefined | null): boolean {
  const raw = String(text ?? '')
  if (!raw.trim()) return false
  return TRANSPORT_FAILURE_RE.test(raw)
}
