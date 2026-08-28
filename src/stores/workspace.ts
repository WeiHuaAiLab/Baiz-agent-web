// 工作区 store：项目 + 任务（普通/定时，含完整调度配置）。
import { defineStore } from 'pinia'

export type TaskMode = 'cloud' | 'local'
export type TaskCycle = 'monthly' | 'weekly' | 'daily' | 'hourly' | 'interval'

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
    projects: [
      { id: 'p-1', title: '客户管理' },
      { id: 'p-2', title: 'Rust 工具箱' },
    ],
    tasks: [
      // 普通任务演示数据
      {
        id: 't-demo-1',
        title: '客户日报汇总',
        instruction: '汇总当天微信客户沟通记录，按意向程度分组并生成 markdown 日报',
        projectId: 'p-1',
        createdAt: Date.now() - 5 * 60_000,
      },
      {
        id: 't-demo-2',
        title: 'Rust 学习笔记整理',
        instruction: '把最近一周的 Rust 学习要点整理成结构化笔记，输出到「Rust 工具箱」项目',
        projectId: 'p-2',
        createdAt: Date.now() - 2 * 60 * 60_000,
      },
      {
        id: 't-demo-3',
        title: '竞品功能对比',
        instruction: '对比豆包、Kimi、百度搭子三款 AI 产品的底部菜单结构，写一段简短结论',
        createdAt: Date.now() - 26 * 60 * 60_000,
      },
      {
        id: 't-demo-4',
        title: '零散需求归类',
        instruction: '把这周收集到的零散需求整理成一个清单，按优先级排序',
        createdAt: Date.now() - 3 * 24 * 60 * 60_000,
      },
      // 定时任务演示数据
      {
        id: 't-demo-s1',
        title: '每日客户日报',
        instruction: '每天早晨汇总前一天微信客户沟通记录，生成日报发送到「客户管理」项目',
        schedule: {
          title: '每日客户日报',
          instruction: '每天早晨汇总前一天微信客户沟通记录，生成日报发送到「客户管理」项目',
          mode: 'cloud',
          cycle: 'daily',
          day: 1,
          weekday: 1,
          time: '09:00',
          every: 30,
          unit: 'minute',
        },
        projectId: 'p-1',
        createdAt: Date.now() - 4 * 60 * 60_000,
      },
      {
        id: 't-demo-s2',
        title: 'Rust 工具箱每周备份',
        instruction: '每周一晚上把 Rust 工具箱项目变更提交归档，生成 changelog',
        schedule: {
          title: 'Rust 工具箱每周备份',
          instruction: '每周一晚上把 Rust 工具箱项目变更提交归档，生成 changelog',
          mode: 'local',
          cycle: 'weekly',
          day: 1,
          weekday: 1,
          time: '20:00',
          every: 30,
          unit: 'minute',
        },
        projectId: 'p-2',
        createdAt: Date.now() - 2 * 24 * 60 * 60_000,
      },
      {
        id: 't-demo-s3',
        title: '服务健康巡检',
        instruction: '每小时检查一次本地服务进程状态，异常时输出告警',
        schedule: {
          title: '服务健康巡检',
          instruction: '每小时检查一次本地服务进程状态，异常时输出告警',
          mode: 'cloud',
          cycle: 'hourly',
          day: 1,
          weekday: 1,
          time: '09:00',
          every: 30,
          unit: 'minute',
        },
        createdAt: Date.now() - 6 * 24 * 60 * 60_000,
      },
    ] as TaskItem[],
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
