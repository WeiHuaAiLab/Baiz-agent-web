// MSG-3417 红证：web 面**行数闸**口径可机判（扫描器＋判据＋基线）。
//
// 四规则（令文）：① 基线外生产件 ≥600 红 ② 基线内 > 其基线 红 ③ 新文件 ≥600 红
// ④ 基线只准减不准增（减小只给 advisory）。本件把口径钉死，防"把闸调松"式修法。
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

describe('MSG-3417 ③ 真实仓库基线（自测值）', () => {
  it('基线恰为 2 件，且与扫描现值一致（980／693 口径）', () => {
    const baseline = loadBaseline(process.cwd())
    expect(Object.keys(baseline.files)).toEqual([
      'src/stores/message.ts',
      'src/components/chat/message/ApprovalCard.vue',
    ])
    const files = scanSources(process.cwd())
    const verdict = judgeLocGate(files, baseline)
    expect(verdict.ok).toBe(true) // 基线件不动 ⇒ 绿（红证④）
    const s = summarize(files)
    expect(s.overLine.map((x) => [x.rel, x.lines])).toEqual([
      ['src/stores/message.ts', baseline.files['src/stores/message.ts']],
      ['src/components/chat/message/ApprovalCard.vue', baseline.files['src/components/chat/message/ApprovalCard.vue']],
    ])
    // 基线**只准减不准增**：现值不得高于基线
    for (const [rel, base] of Object.entries(baseline.files)) {
      const now = files.find((x) => x.rel === rel)?.lines ?? 0
      expect(now).toBeLessThanOrEqual(base as number)
    }
  })
})
