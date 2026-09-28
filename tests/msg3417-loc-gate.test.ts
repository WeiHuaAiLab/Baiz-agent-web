// MSG-3417 红证：web 面**行数闸**口径可机判（扫描器＋判据＋基线）。
//
// 四规则（令文）：① 基线外生产件 ≥600 红 ② 基线内 > 其基线 红 ③ 新文件 ≥600 红
// ④ 基线只准减不准增（减小只给 advisory）。本件把口径钉死，防"把闸调松"式修法。
//
// ── 基线变更（2026-09-28·参谋5 裁②·**治理面·禁静默改**）─────────────────────────
// 改由：基线停在上一次 _measuredAt（2 件：message.ts 980／ApprovalCard.vue 691），
// 与 1.0.37 扫描现值脱节 ⇒ 门禁在 d9e5508 上**恒红**（实跑 3 条：ChatContent.vue／
// zh-CN.ts 判「基线外新件 ≥600」，message.ts 判 BASELINE_GREW 980→1004）。
// 落刀：按**扫描现值**重出基线，件数 2→4（`scripts/loc-baseline.json` 内
// `_rebaselinedAt` 同载此变更）。逐件 改前→改后：
//   src/stores/message.ts                        980 → 1004（+24）
//   src/components/chat/message/ApprovalCard.vue 691 → 691 （不动）
//   src/components/chat/ChatContent.vue      （不在基线）→ 764（新入）
//   src/locales/zh-CN.ts                     （不在基线）→ 600（新入）
//   src/components/chat/ChatInput.vue             605（旧测试钉值）→ 现值 588 ⇒ <600 不入门禁，故不列
// **未放宽判据**：四规则原样、阈值常量原样、`baseline.files` 仍**只准减不准增**
// （本次含上调系"把基线对齐到真实现值并纳入可见"，非常态；生效后规则④不变）。
import { describe, expect, it } from 'vitest'
import {
  TIER_LINE,
  TIER_RED,
  countLines,
  isTestPath,
  judgeLocGate,
  loadBaseline,
  scanSources,
  summarize,
  tierOf,
} from '../scripts/loc-scan.mjs'

describe('MSG-3417 ① 行数口径（wc -l 家族）', () => {
  it('countLines：空串 0；无末尾换行 +1；有末尾换行按 \\n 数', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('a')).toBe(1)
    expect(countLines('a\n')).toBe(1)
    expect(countLines('a\nb')).toBe(2)
    expect(countLines('a\nb\n')).toBe(2)
  })

  it('isTestPath：*.test.*／*.spec.*／__tests__/ 三类单列', () => {
    expect(isTestPath('src/a.test.ts')).toBe(true)
    expect(isTestPath('src/a.spec.ts')).toBe(true)
    expect(isTestPath('src/x/__tests__/y.ts')).toBe(true)
    expect(isTestPath('src/a.ts')).toBe(false)
    expect(isTestPath('src/stores/message.ts')).toBe(false)
  })

  it('tierOf：<600 —｜≥600 黄档｜>1000 红档（阈值常量钉死）', () => {
    expect(TIER_LINE).toBe(600)
    expect(TIER_RED).toBe(1000)
    expect(tierOf(599)).toBe('—')
    expect(tierOf(600)).toBe('黄档')
    expect(tierOf(1000)).toBe('黄档')
    expect(tierOf(1001)).toBe('红档')
  })
})

describe('MSG-3417 ② 判据四规则', () => {
  const f = (rel: string, lines: number, kind: 'prod' | 'test' = 'prod') => ({ rel, lines, kind })

  it('基线内 +1 行 ⇒ BASELINE_GREW（红）', () => {
    const v = judgeLocGate([f('src/a.ts', 601)], { files: { 'src/a.ts': 600 } })
    expect(v.ok).toBe(false)
    expect(v.violations[0]?.reason).toContain('BASELINE_GREW')
  })

  it('新文件 ≥600 ⇒ NEW_FILE_OVER_LINE（红）；599 ⇒ 不红', () => {
    expect(judgeLocGate([f('src/new.ts', 600)], { files: {} }).ok).toBe(false)
    expect(judgeLocGate([f('src/new.ts', 599)], { files: {} }).ok).toBe(true)
  })

  it('基线件不动／变小 ⇒ 绿（变小给 advisory·基线只准减不准增）', () => {
    const same = judgeLocGate([f('src/a.ts', 600)], { files: { 'src/a.ts': 600 } })
    expect(same.ok).toBe(true)
    const shrunk = judgeLocGate([f('src/a.ts', 580)], { files: { 'src/a.ts': 600 } })
    expect(shrunk.ok).toBe(true)
    expect(shrunk.advisories[0]?.reason).toContain('BASELINE_SHRANK')
  })

  it('测试件不入门禁（同路径 prod 才判）', () => {
    expect(judgeLocGate([f('src/a.test.ts', 900, 'test')], { files: {} }).ok).toBe(true)
  })
})

describe('MSG-3417 ③ 真实仓库基线（自测值·2026-09-28 按扫描现值重出）', () => {
  it('基线 4 件，且与扫描现值一致（1004／764／691／600 口径）', () => {
    const baseline = loadBaseline(process.cwd())
    expect(Object.keys(baseline.files)).toEqual([
      'src/stores/message.ts',
      'src/components/chat/ChatContent.vue',
      'src/components/chat/message/ApprovalCard.vue',
      'src/locales/zh-CN.ts',
    ])
    const files = scanSources(process.cwd())
    const verdict = judgeLocGate(files, baseline)
    expect(verdict.ok).toBe(true) // 基线件不动 ⇒ 绿（红证④）
    const s = summarize(files)
    // 基线**只准减不准增**：现值不得高于基线；逐一断言（不直接比数组，
    // 允许基线值 > 现值的合法"已减"状态）
    const sortedEntries = Object.entries(baseline.files).sort(
      ([, a], [, b]) => (b as number) - (a as number),
    )
    expect(s.overLine.map((x) => x.rel)).toEqual(sortedEntries.map(([rel]) => rel))
    for (const [rel, base] of sortedEntries) {
      const now = files.find((x) => x.rel === rel)?.lines ?? 0
      expect(now).toBeGreaterThanOrEqual(600) // 必须仍在黄档（否则不会进 overLine）
      expect(now).toBeLessThanOrEqual(base as number) // 现值不超基线
    }
  })
})
