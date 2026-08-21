// 行级 diff：Myers（diff 库）→ 带行号的 DiffLine 数组，供红绿渲染。
import { diffLines } from 'diff'

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  text: string
  oldNo?: number
  newNo?: number
}

export interface DiffStats {
  added: number
  removed: number
}

export function computeLineDiff(original: string, current: string): DiffLine[] {
  const parts = diffLines(original, current)
  const lines: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  for (const part of parts) {
    const rawLines = part.value.split('\n')
    if (rawLines[rawLines.length - 1] === '') rawLines.pop()
    for (const text of rawLines) {
      if (part.added) {
        newNo += 1
        lines.push({ type: 'added', text, newNo })
      } else if (part.removed) {
        oldNo += 1
        lines.push({ type: 'removed', text, oldNo })
      } else {
        oldNo += 1
        newNo += 1
        lines.push({ type: 'unchanged', text, oldNo, newNo })
      }
    }
  }
  return lines
}

export function diffStats(original: string, current: string): DiffStats {
  let added = 0
  let removed = 0
  for (const line of computeLineDiff(original, current)) {
    if (line.type === 'added') added += 1
    if (line.type === 'removed') removed += 1
  }
  return { added, removed }
}
