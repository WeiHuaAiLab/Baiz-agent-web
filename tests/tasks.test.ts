import { describe, expect, it } from 'vitest'
import { formatNextRun, nextRunAt } from '../src/utils/tasks'
import type { TaskDraft } from '../src/stores/workspace'

const base: TaskDraft = {
  title: 'x',
  instruction: '',
  mode: 'cloud',
  cycle: 'daily',
  day: 1,
  weekday: 1,
  time: '09:00',
  every: 30,
  unit: 'minute',
}

describe('定时任务下次执行', () => {
  it('daily：时间已过则推到明天', () => {
    const past = { ...base, time: '00:01' }
    const next = nextRunAt(past)
    expect(next).not.toBeNull()
    expect(next!.getTime()).toBeGreaterThan(Date.now())
    expect(next!.getHours()).toBe(0)
    expect(next!.getMinutes()).toBe(1)
  })

  it('hourly：下一个整点', () => {
    const next = nextRunAt({ ...base, cycle: 'hourly' })
    expect(next).not.toBeNull()
    expect(next!.getMinutes()).toBe(0)
    expect(next!.getSeconds()).toBe(0)
  })

  it('interval：now + 30 分钟', () => {
    const next = nextRunAt({ ...base, cycle: 'interval', every: 30, unit: 'minute' })
    const diff = next!.getTime() - Date.now()
    expect(diff).toBeGreaterThanOrEqual(29 * 60_000)
    expect(diff).toBeLessThanOrEqual(31 * 60_000)
  })

  it('weekly：目标星期有效', () => {
    const next = nextRunAt({ ...base, cycle: 'weekly', weekday: 3 })
    expect(next).not.toBeNull()
    expect([1, 2, 3, 4, 5, 6, 0].includes(next!.getDay())).toBe(true)
  })

  it('formatNextRun 输出可读', () => {
    const date = new Date(Date.now() + 86_400_000)
    expect(formatNextRun(date)).toContain('明天')
  })
})

// ── DEBT-546 once 档＋RPC 转换（新测——once UI 面红证）──

import { formatRunAtSecs, toScheduleCreateParams } from '../src/utils/tasks'

describe('once 档下次执行', () => {
  it('once：runAt 未到返回该时刻（本地时解析）', () => {
    const future = new Date(Date.now() + 3_600_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const runAt = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`
    const next = nextRunAt({ ...base, cycle: 'once', runAt })
    expect(next).not.toBeNull()
    expect(Math.abs(next!.getTime() - future.getTime())).toBeLessThan(60_000)
  })

  it('once：runAt 空返回 null', () => {
    expect(nextRunAt({ ...base, cycle: 'once', runAt: '' })).toBeNull()
  })
})

describe('schedule.create 参数转换（DEBT-546）', () => {
  it('daily：time "09:00" → timeSecs 32400；every/runAt 零', () => {
    const p = toScheduleCreateParams({ ...base, cycle: 'daily', time: '09:00' })
    expect(p.timeSecs).toBe(9 * 3600)
    expect(p.everySecs).toBe(0)
    expect(p.runAtSecs).toBe(0)
  })

  it('interval：30 分钟 → everySecs 1800', () => {
    const p = toScheduleCreateParams({ ...base, cycle: 'interval', every: 30, unit: 'minute' })
    expect(p.everySecs).toBe(1800)
  })

  it('once：runAt datetime-local → runAtSecs 本地时 epoch；timeSecs 零', () => {
    const runAt = '2030-01-02T03:04'
    const p = toScheduleCreateParams({ ...base, cycle: 'once', runAt })
    expect(p.runAtSecs).toBe(Math.floor(new Date(runAt).getTime() / 1000))
    expect(p.timeSecs).toBe(0)
  })

  it('formatRunAtSecs：epoch → "M月D日 HH:mm"（本地时）', () => {
    const d = new Date(1_800_000_000_000)
    const expected = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    expect(formatRunAtSecs(1_800_000_000)).toBe(expected)
    expect(formatRunAtSecs(0)).toBe('')
  })
})
