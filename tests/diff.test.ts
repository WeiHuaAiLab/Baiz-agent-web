import { describe, expect, it } from 'vitest'
import { computeLineDiff, diffStats } from '../src/utils/diff'

describe('行级 diff', () => {
  it('统计增删行数', () => {
    const stats = diffStats('a\nb\nc\n', 'a\nb2\nc\nd\n')
    expect(stats.added).toBe(2)
    expect(stats.removed).toBe(1)
  })

  it('行号与类型正确', () => {
    const lines = computeLineDiff('x\ny\n', 'x\nz\ny\n')
    const added = lines.find((line) => line.type === 'added' && line.text === 'z')
    expect(added?.newNo).toBe(2)
    expect(lines.find((line) => line.type === 'unchanged' && line.text === 'x')?.oldNo).toBe(1)
  })
})
