// 定时任务"下次执行"计算与展示。
import type { TaskDraft } from '../stores/workspace'

function parseTime(time: string): { h: number; m: number } {
  const [h, m] = (time || '09:00').split(':').map(Number)
  return { h: Number.isFinite(h) ? h : 9, m: Number.isFinite(m) ? m : 0 }
}

export function nextRunAt(schedule: TaskDraft): Date | null {
  const now = new Date()
  const time = parseTime(schedule.time)

  if (schedule.cycle === 'hourly') {
    const next = new Date(now)
    next.setHours(next.getHours() + 1, 0, 0, 0)
    return next
  }

  if (schedule.cycle === 'interval') {
    const unitMs = schedule.unit === 'minute' ? 60_000 : schedule.unit === 'hour' ? 3_600_000 : 86_400_000
    return new Date(now.getTime() + Math.max(1, schedule.every) * unitMs)
  }

  if (schedule.cycle === 'daily') {
    const next = new Date(now)
    next.setHours(time.h, time.m, 0, 0)
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
    return next
  }

  if (schedule.cycle === 'weekly') {
    const targetDay = schedule.weekday % 7 // 1=周一 … 7=周日 → JS 0=周日
    const next = new Date(now)
    next.setHours(time.h, time.m, 0, 0)
    let diff = (targetDay - next.getDay() + 7) % 7
    if (diff === 0 && next.getTime() <= now.getTime()) diff = 7
    next.setDate(next.getDate() + diff)
    return next
  }

  if (schedule.cycle === 'monthly') {
    const next = new Date(now)
    next.setDate(Math.min(schedule.day, 28))
    next.setHours(time.h, time.m, 0, 0)
    if (next.getTime() <= now.getTime()) next.setMonth(next.getMonth() + 1)
    return next
  }

  return null
}

export function formatNextRun(date: Date): string {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (date.toDateString() === now.toDateString()) return `今天 ${hm}`
  if (date.toDateString() === tomorrow.toDateString()) return `明天 ${hm}`
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`
}
