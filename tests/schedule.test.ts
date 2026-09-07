import { describe, expect, it } from 'vitest'
import { formatRunAtSecs, nextRunAt, toScheduleCreateParams } from '../src/utils/tasks'
import type { TaskDraft } from '../src/stores/workspace'

// DEBT-546 once 档红证（2688 详设④＋907dfb7 契约面——once 转换/展示/nextRun 三面）
function draft(over: Partial<TaskDraft> = {}): TaskDraft {
  return {
    id: 'd1',
    title: 't',
    instruction: 'i',
    mode: 'local',
    cycle: 'once',
    day: 0,
    weekday: 0,
    time: '10:30',
    unit: 'minute',
    every: 5,
    runAt: '2026-09-08T10:30',
    enabled: true,
    ...over,
  }
}

describe('once 档转换（toScheduleCreateParams）', () => {
  it('once runAt → runAtSecs 本地时 epoch 秒', () => {
    const p = toScheduleCreateParams(draft())
    // datetime-local 值按本地时解析（勿误作 UTC）——epoch 秒与本地 Date 一致
    const local = new Date('2026-09-08T10:30')
    expect(p.cycle).toBe('once')
    expect(p.runAtSecs).toBe(Math.floor(local.getTime() / 1000))
    // once 时 timeSecs 置 0（time/day 组不消费）
    expect(p.timeSecs).toBe(0)
  })

  it('非 once（daily/interval）runAtSecs=0 且 time/everySecs 语义正确', () => {
    const daily = toScheduleCreateParams(draft({ cycle: 'daily', runAt: undefined }))
    expect(daily.runAtSecs).toBe(0)
    expect(daily.timeSecs).toBe(10 * 3600 + 30 * 60)
    const interval = toScheduleCreateParams(
      draft({ cycle: 'interval', runAt: undefined, unit: 'hour', every: 2 }),
    )
    expect(interval.runAtSecs).toBe(0)
    expect(interval.everySecs).toBe(2 * 3600)
  })

  it('once 且 runAt 空/非法 → runAtSecs 0（不产 NaN）', () => {
    const empty = toScheduleCreateParams(draft({ runAt: '' }))
    expect(empty.runAtSecs).toBe(0)
    const bad = toScheduleCreateParams(draft({ runAt: 'not-a-date' }))
    expect(bad.runAtSecs).toBe(0)
  })
})

describe('once 展示与 nextRun', () => {
  it('formatRunAtSecs：epoch → "MM月DD日 HH:mm"（本地时）', () => {
    const local = new Date('2026-09-08T10:30')
    const secs = Math.floor(local.getTime() / 1000)
    const out = formatRunAtSecs(secs)
    expect(out).toContain('9月8日')
    expect(out).toContain('10:30')
    // 0 → 空串（未设面）
    expect(formatRunAtSecs(0)).toBe('')
  })

  it('nextRunAt once：runAt datetime-local 直解（未到即该时刻）', () => {
    const future = new Date(Date.now() + 3600_000)
    const iso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}T${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`
    const next = nextRunAt(draft({ runAt: iso }))
    expect(next).not.toBeNull()
    if (next) {
      expect(Math.abs(next.getTime() - future.getTime())).toBeLessThan(60_000)
    }
  })

  it('nextRunAt once：runAt 缺省 → null', () => {
    expect(nextRunAt(draft({ runAt: '' }))).toBeNull()
  })
})
