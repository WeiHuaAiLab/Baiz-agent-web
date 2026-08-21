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

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    projects: [
      { id: 'p-1', title: '客户管理' },
      { id: 'p-2', title: 'Rust 工具箱' },
    ],
    tasks: [] as TaskItem[],
  }),
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
      })
    },
    addPlainTask(title: string, instruction: string) {
      if (!title.trim()) return
      seq += 1
      this.tasks.unshift({
        id: `t-${Date.now().toString(36)}-${seq}`,
        title: title.trim(),
        instruction,
      })
    },
    updateTask(id: string, draft: TaskDraft) {
      const task = this.tasks.find((item) => item.id === id)
      if (!task) return
      task.title = draft.title.trim()
      task.instruction = draft.instruction
      task.schedule = { ...draft, title: draft.title.trim() }
    },
  },
})
