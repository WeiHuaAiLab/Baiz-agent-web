// 工具与技能清单（能力扩展数据源）。
import { defineStore } from 'pinia'

export interface ToolInfo {
  name: string
  category: 'shell' | 'fs' | 'web' | 'memory' | 'code' | 'business'
}

export const KNOWN_TOOLS: ToolInfo[] = [
  { name: 'shell.exec', category: 'shell' },
  { name: 'fs.read', category: 'fs' },
  { name: 'web.search', category: 'web' },
  { name: 'memory.recall', category: 'memory' },
  { name: 'code.edit', category: 'code' },
  { name: 'classify_customers', category: 'business' },
]

export interface SkillInfo {
  id: string
  labelKey: string
}

export const KNOWN_SKILLS: SkillInfo[] = [
  { id: 'coding-discipline', labelKey: 'skills.codingDiscipline' },
  { id: 'security', labelKey: 'skills.security' },
  { id: 'evolution', labelKey: 'skills.evolution' },
  { id: 'memory', labelKey: 'skills.memory' },
]

export const useToolStore = defineStore('tools', {
  state: () => ({
    available: KNOWN_TOOLS.map((tool) => tool.name),
    enabled: Object.fromEntries(KNOWN_TOOLS.map((tool) => [tool.name, true])) as Record<
      string,
      boolean
    >,
    skills: KNOWN_SKILLS,
    enabledSkills: Object.fromEntries(KNOWN_SKILLS.map((skill) => [skill.id, true])) as Record<
      string,
      boolean
    >,
  }),
  getters: {
    count(state): number {
      return state.available.length
    },
  },
  actions: {
    toggleTool(name: string) {
      this.enabled[name] = !this.enabled[name]
    },
    toggleSkill(id: string) {
      this.enabledSkills[id] = !this.enabledSkills[id]
    },
  },
})
