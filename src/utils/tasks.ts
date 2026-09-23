// 定时任务"下次执行"计算与展示。
import type { TaskDraft, TaskItem } from '../stores/workspace'
// MSG-3511：参数型**不再本地另立**（旧本地型同为 camelCase，双份易漂移）——
// 统一用 `client/types` 的 `ScheduleCreateParams`（键名对卯 daemon `TaskSpec`）。
import type { ScheduleCreateParams } from '../client/types'

export type { ScheduleCreateParams }

function parseTime(time: string): { h: number; m: number } {
  const [h, m] = (time || '09:00').split(':').map(Number)
  return { h: Number.isFinite(h) ? h : 9, m: Number.isFinite(m) ? m : 0 }
}

function toSecs(time: string): number {
  const { h, m } = parseTime(time)
  return h * 3600 + m * 60
}

/** draft → `schedule.create` RPC 参数（once：`run_at_secs` 本地时 epoch 秒——
 * datetime-local 值按本地时解析，勿误作 UTC）。**键名＝daemon `TaskSpec` 的
 * snake_case**（MSG-3511 勘误：旧版输出 camelCase ⇒ 被 serde `default` 静默置零）。 */
export function toScheduleCreateParams(draft: TaskDraft): ScheduleCreateParams {
  const unitSecs =
    draft.unit === 'minute' ? 60 : draft.unit === 'hour' ? 3600 : 86_400
  let runAtSecs = 0
  if (draft.cycle === 'once' && draft.runAt) {
    const local = new Date(draft.runAt)
    if (!Number.isNaN(local.getTime())) {
      runAtSecs = Math.floor(local.getTime() / 1000)
    }
  }
  return {
    title: draft.title,
    instruction: draft.instruction,
    mode: draft.mode,
    cycle: draft.cycle,
    day: draft.day,
    weekday: draft.weekday,
    time_secs: draft.cycle === 'once' ? 0 : toSecs(draft.time),
    every_secs: draft.cycle === 'interval' ? Math.max(1, draft.every) * unitSecs : 0,
    run_at_secs: runAtSecs,
  }
}

/** once 档展示时间（runAtSecs→本地时 "MM月DD日 HH:mm"——daemon 回显面用） */
export function formatRunAtSecs(runAtSecs: number): string {
  if (!runAtSecs) return ''
  const d = new Date(runAtSecs * 1000)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
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

  if (schedule.cycle === 'once') {
    // once：runAt datetime-local 值（本地时）直解——未到即该时刻；已过
    // 则显过去（执行态由 daemon runs 表回显——此处仅展示）
    if (!schedule.runAt) return null
    const at = new Date(schedule.runAt)
    return Number.isNaN(at.getTime()) ? null : at
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

/** 任务调度规则摘要（仅显示定时规则，不含模式/下次执行时间），用于列表展示 */
export function scheduleText(task: TaskItem, t: (key: string) => string): string {
  const schedule = task.schedule
  if (!schedule) return t('tasks.notConfigured')
  if (schedule.cycle === 'monthly') {
    return `${t('tasks.cycleMonthly')} ${schedule.day} 日 ${schedule.time}`
  }
  if (schedule.cycle === 'weekly') {
    return `${t('tasks.cycleWeekly')} ${t(`tasks.weekday.${schedule.weekday}`)} ${schedule.time}`
  }
  if (schedule.cycle === 'daily') {
    return `${t('tasks.cycleDaily')} ${schedule.time}`
  }
  if (schedule.cycle === 'hourly') {
    return t('tasks.cycleHourly')
  }
  if (schedule.cycle === 'once') {
    return schedule.runAt ? `${t('tasks.cycleOnce')} ${schedule.runAt.replace('T', ' ')}` : t('tasks.cycleOnce')
  }
  const unit =
    schedule.unit === 'minute'
      ? t('tasks.unitMinute')
      : schedule.unit === 'hour'
        ? t('tasks.unitHour')
        : t('tasks.unitDay')
  return `${t('tasks.cycleInterval')} ${schedule.every} ${unit}`
}
