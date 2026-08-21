// 记忆可视化：baiz 记住了什么（演示种子 + 可逐条删除），信任机制与"白泽"叙事。
import { defineStore } from 'pinia'

export interface MemoryFact {
  id: string
  text: string
  source: string
  createdAt: number
}

const DEMO_FACTS: { text: string; source: string }[] = [
  { text: '客户 A 公司偏好每周一上午收到周报', source: '对话：今日客户总结' },
  { text: '你更习惯简洁、要点式的回复', source: '对话：Rust 项目重构' },
  { text: '常用项目目录：F:\\Projects\\BaizAgent', source: '工作区' },
]

let seq = 0

export const useMemoryStore = defineStore('memory', {
  state: () => ({
    facts: [] as MemoryFact[],
  }),
  actions: {
    seedDemo() {
      if (this.facts.length > 0) return
      for (const fact of DEMO_FACTS) {
        seq += 1
        this.facts.push({
          id: `m-${seq}-${Date.now().toString(36)}`,
          ...fact,
          createdAt: Date.now(),
        })
      }
    },
    removeFact(id: string) {
      this.facts = this.facts.filter((fact) => fact.id !== id)
    },
  },
})
