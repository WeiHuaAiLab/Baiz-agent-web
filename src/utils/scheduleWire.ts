// **MSG-3511 · S1/S2**：定时任务「**读取面接线**」与「**创建落库**」桥件。
//
// 口径（照令）：UI 接 daemon 的 `schedule.list`／`schedule.list_runs`；
// `CreateTask` 由内存 `addTask` 改为**经 RPC 真落 daemon**（重登／重启后仍在）。
// **uid 语义不变**：daemon 侧 `TaskSpec.user_id` 为**服务端覆写**（勿信客户端自报）
// ⇒ 本件**从不传 `user_id`**。
//
// ⚠ **MSG-3511 契约勘误**：`client/types.ts` 的 schedule 两型旧为 **camelCase**
// （`timeSecs`…），而 daemon `scheduled_store::TaskSpec` 的 serde 键是 **snake_case**
// （无 `rename` 属性）——照旧声明发包会被 `#[serde(default)]` **静默置零**
// （每日 09:00 变 00:00）。本刀把该两型与 `toScheduleCreateParams` 的输出键名纠回
// snake_case（差异照录于讫报）。
import type { BaizClient } from '../client'
import type { ScheduleRun, ScheduleTask } from '../client/types'
import { toScheduleCreateParams } from './tasks'
import type { TaskDraft, TaskItem } from '../stores/workspace'

/** wire（daemon `TaskSpec` 行）→ 视图 `TaskItem`。 */
export function toTaskItem(s: ScheduleTask): TaskItem {
  return {
    id: s.id,
    title: s.title,
    instruction: s.instruction ?? '',
    schedule: {
      title: s.title,
      instruction: s.instruction ?? '',
      mode: 'cloud',
      cycle: (s.cycle ?? 'daily') as TaskDraft['cycle'],
      day: 0,
      weekday: 0,
      time: '',
      every: 0,
      unit: 'minute',
    },
    enabled: s.enabled !== false,
    createdAt: (s.created_at ?? 0) > 0 ? Number(s.created_at) * 1000 : Date.now(),
  }
}

/** RPC 失败人话（**不得空白**）。 */
export function humanizeRpcError(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e ?? '')).trim()
  if (/未登录|unauthor/i.test(raw)) return '未登录：定时任务归属当前账号，请先登录后重试'
  if (/调度器未就绪|scheduled\.db/i.test(raw)) {
    return '本机调度器未就绪（scheduled.db 打开失败）——请重启应用后重试'
  }
  if (/title 不能为空/i.test(raw)) return '任务标题不能为空'
  if (/invalid cycle/i.test(raw)) return '周期档不支持（须为 每月／每周／每日／每小时／间隔／一次）'
  return raw ? `读取／写入失败：${raw}` : '读取／写入失败：未知错误（详见日志）'
}

/** 人话状态标签（runs.status 四态）。 */
export function runStatusLabel(status: string): string {
  if (status === 'success') return '成功'
  if (status === 'error') return '失败'
  if (status === 'skipped') return '跳过'
  if (status === 'once_done') return '单次已完成'
  return status || '未知'
}

// ── 变更总线（创建成功 ⇒ 列表自动重拉）──
const listeners = new Set<() => void>()
/** 订阅「定时任务集合有变」；返回退订函数。 */
export function onScheduleChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
/** 通知变更（创建成功后调）。 */
export function notifyScheduleChanged(): void {
  listeners.forEach((fn) => fn())
}

/** **S1 接线**：拉当前账号定时任务（空表 ⇒ `[]`，由视图给人话空态）。 */
export async function loadScheduledTasks(
  client: Pick<BaizClient, 'scheduleList'>,
): Promise<TaskItem[]> {
  const list = await client.scheduleList()
  const arr = Array.isArray(list) ? (list as ScheduleTask[]) : []
  return arr.filter((s) => s && typeof s.id === 'string').map(toTaskItem)
}

/** **S1 接线（执行记录）**：真在跑与产出。 */
export async function loadTaskRuns(
  client: Pick<BaizClient, 'scheduleListRuns'>,
  taskId: string,
  limit = 10,
): Promise<ScheduleRun[]> {
  const runs = await client.scheduleListRuns(taskId, limit)
  return Array.isArray(runs) ? runs : []
}

/** **S2 落库**：经 RPC 建任务（失败上抛——由调用方给人话·**不回落内存**）。
 * 参数走 `toScheduleCreateParams`（snake_case·**不含 `user_id`**——服务端覆写）。 */
export async function createScheduledTask(
  client: Pick<BaizClient, 'scheduleCreate'>,
  draft: TaskDraft,
): Promise<string> {
  const res = await client.scheduleCreate(toScheduleCreateParams(draft))
  notifyScheduleChanged()
  const id = (res as { id?: string } | undefined)?.id
  return typeof id === 'string' ? id : ''
}
