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
