// 工作区 store：项目 + 任务（普通/定时，含完整调度配置）。
import { defineStore } from 'pinia'

export type TaskMode = 'cloud' | 'local'
export type TaskCycle = 'monthly' | 'weekly' | 'daily' | 'hourly' | 'interval' | 'once'

export interface TaskDraft {
  title: string
  instruction: string
  mode: TaskMode
  cycle: TaskCycle
  day: number
  weekday: number
  time: string
  every: number
  unit: 'minute' | 'hour' | 'day'
  /** DEBT-546 once 档：datetime-local 值（"YYYY-MM-DDTHH:mm"——本地时——
   * 仅 cycle='once' 时消费；送 daemon 前转 runAtSecs epoch 秒） */
  runAt?: string
}

export interface ProjectItem {
  id: string
  title: string
}

export interface TaskItem {
  id: string
  title: string
  instruction: string
  schedule?: TaskDraft
  projectId?: string
  /** 是否开启（仅定时任务卡片展示开关，默认开启） */
  enabled?: boolean
  /** 创建时间（ms 时间戳），用于展示「刚刚 / 5 分钟前」等相对时间 */
  createdAt: number
}

let seq = 0

export function createEmptyTaskDraft(): TaskDraft {
  return {
    title: '',
    instruction: '',
    mode: 'cloud',
    cycle: 'daily',
    day: 1,
    weekday: 1,
    time: '09:00',
    every: 30,
    unit: 'minute',
    runAt: '',
  }
}

/** 根据 ms 时间戳得到「刚刚 / N 分钟前 / N 小时前 / N 天前」的友好文本 */
export function formatRelativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    // **MSG-3528（老板 2026-09-23 22:1x 亲口）**：**默认不出预设** ——
    // 项目与任务**初始为空**（旧版在此硬编码 2 个项目「客户管理／Rust 工具箱」＋
    // 6 条演示任务 ⇒ 新装即"默认有"，与"只有用户新建才会有"的口径相悖）。
    // 照录：**本刀不删任何既有数据**（老板机上既有的 2 项目/3 预设任务处置另呈堂）；
    // 演示态仍可由 `seedDemo()`（demo 模式）自行播种。
    projects: [] as ProjectItem[],
    tasks: [] as TaskItem[],
  }),
  getters: {
    projectById: (state) => (id: string) =>
      state.projects.find((project) => project.id === id) ?? null,
  },
  actions: {
    addProject(title: string) {
      if (!title.trim()) return
      seq += 1
      this.projects.unshift({ id: `p-${Date.now().toString(36)}-${seq}`, title: title.trim() })
    },
    /** **MSG-3528**：项目**改名**（空名拒；返回是否成） */
    renameProject(id: string, title: string): boolean {
      const next = title.trim()
      if (!next) return false
      const p = this.projects.find((item) => item.id === id)
      if (!p) return false
      p.title = next
      return true
    },
    /** **MSG-3528**：项目**删除**（只删项目行；其下任务保留但解除关联——不静默删任务） */
    removeProject(id: string): boolean {
      const before = this.projects.length
      this.projects = this.projects.filter((item) => item.id !== id)
      if (this.projects.length === before) return false
      for (const t of this.tasks) {
        if (t.projectId === id) delete t.projectId
      }
      return true
    },
    /** 演示态播种（仅 demo 模式调用；真机默认零播种） */
    seedDemo() {
      if (this.projects.length === 0) {
        this.projects = [
          { id: 'p-1', title: '客户管理' },
          { id: 'p-2', title: 'Rust 工具箱' },
        ]
      }
    },
    addTask(draft: TaskDraft) {
      if (!draft.title.trim()) return
      seq += 1
      this.tasks.unshift({
        id: `t-${Date.now().toString(36)}-${seq}`,
        title: draft.title.trim(),
        instruction: draft.instruction,
        schedule: { ...draft, title: draft.title.trim() },
        createdAt: Date.now(),
      })
    },
    addPlainTask(title: string, instruction: string, projectId?: string) {
      if (!title.trim()) return
      seq += 1
      this.tasks.unshift({
        id: `t-${Date.now().toString(36)}-${seq}`,
        title: title.trim(),
        instruction,
        projectId,
        createdAt: Date.now(),
      })
    },
    updateTask(id: string, draft: TaskDraft) {
      const task = this.tasks.find((item) => item.id === id)
      if (!task) return
      task.title = draft.title.trim()
      task.instruction = draft.instruction
      task.schedule = { ...draft, title: draft.title.trim() }
    },
    removeTask(id: string) {
      this.tasks = this.tasks.filter((item) => item.id !== id)
    },
    /** 切换定时任务开关状态（enabled 缺省视为开启） */
    toggleTask(id: string) {
      const task = this.tasks.find((item) => item.id === id)
      if (!task) return
      task.enabled = task.enabled === false
    },
  },
})
