// 补席 B（KIMI 点名②-b）：**非组件面**的取词口（store／纯函数用）。
//
// 病灶：改前 store 与 utils 里的用户文案一律**硬编码中文**——`stores/auth.ts` 的登录败词
// （"登录失败，请检查账号密码"）与 `utils/authFailure.ts` 的校验三句（"请输入账号"等）
// ⇒ en-US 用户切了语言，登录面照样出中文（＝文案没走 i18n）。
//
// 口径：vue-i18n 的组件面取词口是 `useI18n()`；**非组件面**（pinia action／纯函数）没有
// setup 上下文，官方口径是全局实例 `i18n.global` ⇒ 本件把它**登记**在此，供两侧取词。
//
// 未登记时（单测／启动早期：`main.ts` 尚未接线）⇒ **回落 zh-CN 源文案**：
//   · 单一事实源仍是 `locales/zh-CN.ts`（**不另抄一份中文**——那才是"第二套实现"）；
//   · 空表/缺键 ⇒ 返回 key 本身（**不显空白**、不抛），便于当场看出漏配。
import zhCN from './zh-CN'

/** 取词面最小契约：vue-i18n 的 `i18n.global` 满足它。
 *  **不引 vue-i18n 的类型**——免得 store／纯函数被迫依赖其内部型别。 */
export interface I18nRuntime {
  t: (key: string, named?: Record<string, unknown>) => string
}

let runtime: I18nRuntime | null = null

/** 由 `main.ts` 在 `createI18n()` 之后登记（**唯一接线点**）。
 *  传 `null` ＝ 复位（单测用：复位后回落 zh-CN 源文案，不污染同文件其他用例）。 */
export function setI18nRuntime(global: I18nRuntime | null): void {
  runtime = global
}

/** 源文案点路径取值（仅未登记时用；缺键 ⇒ 返 key 本身，不抛） */
function lookupSource(key: string): string {
  let node: unknown = zhCN
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return key
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : key
}

/** 非组件面取词：已登记 ⇒ 走真 i18n（随 locale）；未登记 ⇒ zh-CN 源文案 */
export function t(key: string, named?: Record<string, unknown>): string {
  if (runtime) return runtime.t(key, named ?? {})
  return lookupSource(key)
}
