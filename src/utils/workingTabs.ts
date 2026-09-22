// MSG-3375 U-4：工作区**可见页签**＋**记忆上次页签**（纯函数·可机判）。
//
// 现状病灶（在册件 `1.0.20-总文档` U-4）：`/working` 只会 `redirect`
// 到 `/working/scheduled`，且**没有任何可见页签** ⇒ 用户从别处切回来
// 永远落在「定时任务」，**看不出还有别的页**，也**无法切回去**。
//
// 本件只承载"口径与读写"，**不含任何 UI**（UI 在 `WorkingView.vue`，
// 路由接线在 `router/index.ts`）——三处分离便于各自机判。

/** 可见页签（**顺序即展示顺序**）。`tasks` 页在册为"暂不展示"，故不入列。 */
export const WORKING_TABS = ['scheduled', 'extensions'] as const

export type WorkingTab = (typeof WORKING_TABS)[number]

/** 记忆键（localStorage；读写失败一律静默降级，不影响进页） */
export const WORKING_TAB_KEY = 'baiz.workingTab'

/** 首次进入（无记忆／记忆非法）时的落点——**保持既有行为**：定时任务。
 *  ⚠ 口径呈堂：默认面是否改「能力扩展」由参谋窗裁（见讫报 §未达）。 */
export const WORKING_DEFAULT_TAB: WorkingTab = 'scheduled'

export function isWorkingTab(value: unknown): value is WorkingTab {
  return typeof value === 'string' && (WORKING_TABS as readonly string[]).includes(value)
}

type ReadableStorage = { getItem(key: string): string | null } | null | undefined
type WritableStorage = { setItem(key: string, value: string): void } | null | undefined

/** 读上次页签：无记忆／值非法／存储不可用 ⇒ `WORKING_DEFAULT_TAB`（永不抛） */
export function readWorkingTab(storage?: ReadableStorage): WorkingTab {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage
    const raw = store?.getItem(WORKING_TAB_KEY) ?? null
    return isWorkingTab(raw) ? raw : WORKING_DEFAULT_TAB
  } catch {
    return WORKING_DEFAULT_TAB
  }
}

/** 记上次页签：写入失败静默（隐私模式／配额满不得阻断导航） */
export function rememberWorkingTab(tab: WorkingTab, storage?: WritableStorage): void {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage
    store?.setItem(WORKING_TAB_KEY, tab)
  } catch {
    /* 静默：记忆是体验优化，不是契约 */
  }
}

/** 页签 → 路由路径（路径形状唯一真源；勿在他处拼字符串） */
export function workingTabPath(tab: WorkingTab): string {
  return `/working/${tab}`
}
