// **令·补24**（危险动作「逐次提权卡」MVP）**卡面判据**（纯函数·可机判）：
//   · 高危卡（片 A P0-1）：档位区不渲染、「同意」不得为 accent 实心（后端本已禁复用，前端对齐）；
//   · 复用可见（片 A P0-1 ④）：daemon 下发的「本动作已免卡执行 M 次」＋撤销落点；
//   · 可逆性三径（片 E P1-8）：**只认 daemon 实测事实**——三径皆无 ⇒ 按「不可撤销」呈现。
//
// 三条纪律（照 `approvalText.ts` 的 `normalizeRisk`／`authFailure.ts` 的 `hasLoginHint` 同法）：
//   ① **判据是纯函数** ⇒ 可机判、可单测，不依赖组件挂载；
//   ② **取不到 ＝ 按最保守说**（不可逆／不渲染），绝不猜、绝不凑数——「看着像就归」一律禁；
//   ③ **只认 `=== true`／有限数**——字符串 `'yes'`／`1`／`'true'` 一律不算（防第二套真源）。
import { normalizeRisk } from './approvalText'
import type { MessageMeta } from '../models'

/** 片 A-1／A-3：高危卡判据。档位区与「记住这条」据此不渲染。 */
export function isHighRiskCard(meta?: MessageMeta | null): boolean {
  return normalizeRisk(meta?.risk) === 'high'
}

/** 片 A-4：免卡执行次数——**只认 ≥1 的有限数**（缺省／非数／<1 ⇒ 0 ⇒ 整块不渲染，禁伪造次数） */
export function reuseCount(meta?: MessageMeta | null): number {
  const raw = meta?.reuseCount
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 0
}

/** 片 A-4：免卡执行对应之规则 id（撤销的落点）；无 ⇒ 事实照说，但不给按不动的假钮 */
export function reuseRuleId(meta?: MessageMeta | null): string {
  return typeof meta?.reuseRuleId === 'string' ? meta.reuseRuleId.trim() : ''
}

/** 片 E：可逆性三径（与 daemon 面钉死的三径同名，勿改名——协议对卯点） */
export type ReversibilityPath = 'recycle' | 'manifest' | 'backup'

/** 三径 → i18n 键（唯一映射点；加径只动这里＋两语文件） */
export const REV_LABEL_KEY: Record<ReversibilityPath, string> = {
  recycle: 'approval.revRecycle',
  manifest: 'approval.revManifest',
  backup: 'approval.revBackup',
}

/**
 * 片 E：可逆性判据——**只认 `=== true`**。
 * 无任何事实依据 ⇒ **空集** ⇒ 卡面按「不可撤销」呈现（**fail-closed**：不承诺没根据的可逆性）。
 */
export function reversibilityPaths(meta?: MessageMeta | null): ReversibilityPath[] {
  const paths: ReversibilityPath[] = []
  if (meta?.recycleBin === true) paths.push('recycle')
  if (meta?.changeManifest === true) paths.push('manifest')
  if (meta?.backupVerified === true) paths.push('backup')
  return paths
}

/**
 * 片 E：标签文案——有据**只列真有据**的那几径（不凑数）；无据走「不可撤销」。
 *
 * **取词口由调用方注入**（不引 `locales/runtime`）：`{paths}` 是**带占位符**的串，
 * 而非组件面的 runtime 回落**不做插值**（`locales/runtime.ts::lookupSource` 只取值）——
 * 落那儿会把 `可撤销（{paths}）` 原样上屏。故本函数只拼参数，插值交给**组件面**
 * `useI18n().t`（装机面口径统一），顺带使本判据对 i18n 零依赖、可裸测。
 */
export function reversibilityText(
  paths: ReversibilityPath[],
  translate: (key: string, named?: Record<string, unknown>) => string,
): string {
  if (paths.length === 0) return translate('approval.irreversible')
  return translate('approval.reversible', {
    paths: paths.map((path) => translate(REV_LABEL_KEY[path])).join('／'),
  })
}

/** 片 E：徽章色调——有据＝绿档／无据＝红档（复用 risk 徽章同族 token，见 `.rev` 选择器） */
export function reversibilityTone(paths: ReversibilityPath[]): 'low' | 'high' {
  return paths.length > 0 ? 'low' : 'high'
}

/** 片 E：撤销入口只在**真执行过**的卡上给（待决／被拒／已失效 ⇒ 无可撤） */
export function canUndoAction(meta: MessageMeta | null | undefined, paths: ReversibilityPath[]): boolean {
  return meta?.approved === true && paths.length > 0
}

/** 卡面渲染面（组件只取此一物——避免组件里散落判据）；文案由组件面取词后拼装 */
export interface ApprovalCardFace {
  highRisk: boolean
  revPaths: ReversibilityPath[]
  revTone: 'low' | 'high'
  reuseCount: number
  reuseRuleId: string
  canUndo: boolean
}

export function approvalCardFace(meta?: MessageMeta | null): ApprovalCardFace {
  const revPaths = reversibilityPaths(meta)
  return {
    highRisk: isHighRiskCard(meta),
    revPaths,
    revTone: reversibilityTone(revPaths),
    reuseCount: reuseCount(meta),
    reuseRuleId: reuseRuleId(meta),
    canUndo: canUndoAction(meta, revPaths),
  }
}
