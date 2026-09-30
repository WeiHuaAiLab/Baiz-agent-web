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

/**
 * `apply_patch` 统一补丁文本 → DiffLine 数组（零后端改动）。
 *
 * **位置变更（令·补24）**：原为 `chat/message/ApprovalCard.vue` 内的私有函数，随迁至此——
 * 判据是**纯函数**（照本仓 `normalizeRisk`／`hasLoginHint` 同法：可机判、可单测、不依赖挂载），
 * 且卡面行数闸（`scripts/loc-baseline.json` 钉 `ApprovalCard.vue = 693`）要求组件只留接线。
 * **逻辑逐字未改**（`+++`／`---` 头行仍按上下文行计）。
 */
export function parsePatch(patch: string): DiffLine[] {
  if (!patch.trim()) return []
  const lines: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      newNo += 1
      lines.push({ type: 'added', text: raw.slice(1), newNo })
    } else if (raw.startsWith('-') && !raw.startsWith('---')) {
      oldNo += 1
      lines.push({ type: 'removed', text: raw.slice(1), oldNo })
    } else {
      oldNo += 1
      newNo += 1
      lines.push({ type: 'unchanged', text: raw, oldNo, newNo })
    }
  }
  return lines
}
