// 工具与技能清单（能力扩展数据源）。
//
// 刀 D2（2026-09-29）：**技能面接线（死件转活）**——旧 `KNOWN_SKILLS` 是四条
// **写死假技能**（coding-discipline／security／evolution／memory——磁盘上根本
// 不存在）＋ `enabledSkills` 假开关（点击无实效）⇒ 测试员在本地技能目录加的
// 真技能（如 `ui-designer`）在界面**看不到**。现改为**异步拉取** daemon
// `skills.list`（磁盘真技能：name／description／path／source）：
//   · 拉取失败 ⇒ **空列表＋可重试提示**（**不得回落假清单**——假数据比没有更坏）；
//   · 启停语义未开 ⇒ 界面**只读展示**，**不**做假开关（点击无实效＝比没有更坏）。
// 工具（`KNOWN_TOOLS`）面本刀不动。
import { defineStore } from 'pinia'
import { getClient } from '../client/singleton'
import type { SkillEntry } from '../client/types'
import { mapRpcError } from '../utils/errors'

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

/** 技能条目（UI 形状：字段归一为串；空描述由界面渲染成「（无描述）」） */
export interface SkillInfo {
  /** 技能目录名（磁盘真名，如 `ui-designer`） */
  name: string
  /** 技能描述（空串＝无描述） */
  description: string
  /** 技能目录路径（展示用；可为空串） */
  path: string
  /** 来源层级：account／global／workspace（未知源照原文；空串＝未标注） */
  source: string
}

/** 技能读取态（照 `stores/memory.ts` 同族口径：**读不到 ≠ 没有技能**） */
export type SkillsLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'notReady'

export const useToolStore = defineStore('tools', {
  state: () => ({
    available: KNOWN_TOOLS.map((tool) => tool.name),
    enabled: Object.fromEntries(KNOWN_TOOLS.map((tool) => [tool.name, true])) as Record<
      string,
      boolean
    >,
    /** 技能清单（初值**空**——拉取前不显任何技能；**不得**回落写死清单） */
    skills: [] as SkillInfo[],
    /** 技能读取态（缺省 idle） */
    status: 'idle' as SkillsLoadStatus,
    /** 失败人话（error 态） */
    error: '',
    /** 失败键（mapRpcError） */
    errorKey: '',
  }),
  getters: {
    count(state): number {
      return state.available.length
    },
    skillsLoading: (state) => state.status === 'loading',
    skillsFailed: (state) => state.status === 'error',
    skillsNotReady: (state) => state.status === 'notReady',
  },
  actions: {
    toggleTool(name: string) {
      this.enabled[name] = !this.enabled[name]
    },
    /**
     * 拉取技能清单（daemon `skills.list`——磁盘真技能目录）：
     * 成功 ⇒ `ready`（逐条 name／description／path／source）；
     * -32601 ⇒ `notReady`（服务端未就绪，明说不假装）；
     * 其余失败 ⇒ `error`（空列表＋界面可见重试；**禁回落假清单**）。
     * 空表是正常态（"还没加技能"），不是错误。
     */
    async loadSkills() {
      this.status = 'loading'
      this.error = ''
      this.errorKey = ''
      try {
        const res = await getClient().skillsList()
        const list = Array.isArray(res) ? (res as SkillEntry[]) : []
        this.skills = list
          .filter((item) => item && typeof item.name === 'string' && item.name.trim() !== '')
          .map((item) => ({
            name: item.name.trim(),
            description: String(item.description ?? '').trim(),
            path: String(item.path ?? '').trim(),
            source: String(item.source ?? '').trim(),
          }))
        this.status = 'ready'
      } catch (error) {
        const mapped = mapRpcError(error)
        this.errorKey = mapped.key
        // 失败**显式清空**：既不留旧读数，更不得回落写死假清单
        this.skills = []
        if (mapped.key === 'methodNotFound') {
          this.status = 'notReady'
          this.error = ''
          return
        }
        this.status = 'error'
        this.error = mapped.detail
      }
    },
  },
})
