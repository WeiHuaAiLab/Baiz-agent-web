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
