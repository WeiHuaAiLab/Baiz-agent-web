// **MSG-3511** S1/S2 桥件单测（红证针：注掉接线 ⇒ S1 条红；注掉落库 ⇒ S2 条红）。
import { describe, expect, it, vi } from 'vitest'
import {
  createScheduledTask,
  humanizeRpcError,
  loadScheduledTasks,
  loadTaskRuns,
  runStatusLabel,
} from '../src/utils/scheduleWire'
import { toScheduleCreateParams } from '../src/utils/tasks'
import type { TaskDraft } from '../src/stores/workspace'

const draft = (over: Partial<TaskDraft> = {}): TaskDraft => ({
  title: '日报',
  instruction: '写日报',
  mode: 'cloud',
  cycle: 'daily',
  day: 1,
  weekday: 1,
  time: '09:30',
  every: 30,
  unit: 'minute',
  ...over,
})

describe('MSG-3511 S1/S2 桥件', () => {
  it('S2 参数面：键名＝daemon TaskSpec 的 snake_case（旧 camelCase 会被静默置零）', () => {
    const s = toScheduleCreateParams(draft({ cycle: 'daily', time: '09:30' }))
    expect(s.time_secs).toBe(9 * 3600 + 30 * 60)
    expect(s.every_secs).toBe(0)
    expect(s.run_at_secs).toBe(0)
    expect('user_id' in s).toBe(false)

    const iv = toScheduleCreateParams(draft({ cycle: 'interval', every: 2, unit: 'hour' }))
    expect(iv.every_secs).toBe(7200)

    const once = toScheduleCreateParams(draft({ cycle: 'once', runAt: '2026-09-24T08:00' }))
    expect(once.time_secs).toBe(0)
    expect(once.run_at_secs).toBeGreaterThan(0)
  })

  it('S1：loadScheduledTasks **真调 scheduleList** 并映射（注掉接线必红）', async () => {
    const client = {
      scheduleList: vi.fn(async () => [
        { id: 's1', title: 'A', cycle: 'daily', enabled: true, created_at: 1 },
      ]),
    }
    const list = await loadScheduledTasks(client as never)
    expect(client.scheduleList).toHaveBeenCalledTimes(1)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('s1')
    expect(list[0].enabled).toBe(true)
  })

  it('S1：loadTaskRuns **真调 scheduleListRuns**', async () => {
    const client = {
      scheduleListRuns: vi.fn(async () => [
        { id: 1, task_id: 's1', triggered_at: 1, status: 'success' },
      ]),
    }
    const runs = await loadTaskRuns(client as never, 's1', 5)
    expect(client.scheduleListRuns).toHaveBeenCalledWith('s1', 5)
    expect(runs[0].status).toBe('success')
  })

  it('S2：createScheduledTask **真调 scheduleCreate**（注掉落库必红）', async () => {
    const client = { scheduleCreate: vi.fn(async () => ({ id: 'sched-1' })) }
    const id = await createScheduledTask(client as never, draft())
    expect(client.scheduleCreate).toHaveBeenCalledTimes(1)
    const arg = (client.scheduleCreate.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    // 真上链的载荷：snake_case 键 + **无 user_id**（服务端覆写归属）
    expect(Object.keys(arg)).toContain('time_secs')
    expect(Object.keys(arg)).not.toContain('timeSecs')
    expect('user_id' in arg).toBe(false)
    expect(id).toBe('sched-1')
  })

  it('人话：空/错均有话（不得空白）', () => {
    expect(humanizeRpcError(new Error('schedule.create: 未登录——…'))).toContain('未登录')
    expect(humanizeRpcError(new Error(''))).not.toBe('')
    expect(humanizeRpcError(new Error('some odd failure'))).toContain('some odd failure')
    expect(runStatusLabel('success')).toBe('成功')
    expect(runStatusLabel('weird')).toBe('weird')
  })
})
