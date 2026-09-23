// 记忆可视化：baiz 记住了什么（**daemon 真数据优先**；演示态保种子）。
//
// MSG-3503 A9（DEBT-876／测试员 T8）：病灶＝daemon 侧无 `memory.*` RPC
// （MSG-3494 §②A9 勘定）+ 本 store 只有**演示种子**且仅演示态播种
// ⇒ **真机上恒空**（用户「看不懂：系统上没有记忆内容的直观显示」）。
// 本件接线：`load()` 走 daemon `memory.list`（**只回本人**——归属由 daemon 侧
// 会话令牌查证）；三态明示（loading／error／notReady），**禁静默假成功**
// （DEBT-738 教训）。删除仍是**本地演示面**：daemon 侧本刀**只读、无写面**。
import { defineStore } from 'pinia'
import { getClient } from '../client/singleton'
import { useAuthStore } from './auth'
import { mapRpcError } from '../utils/errors'

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

/** 读取态（三态分开：**读不到 ≠ 没有记忆**——与 A8 同族口径） */
export type MemoryLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'notReady'

export const useMemoryStore = defineStore('memory', {
  state: () => ({
    facts: [] as MemoryFact[],
    /** 读取态（缺省 idle） */
    status: 'idle' as MemoryLoadStatus,
    /** 失败人话（error 态） */
    error: '',
    /** 失败键（mapRpcError） */
    errorKey: '',
    /** daemon 回的归属（只回本人——空串＝未登录面） */
    owner: '',
    /** daemon 回的人话说明（零令牌面） */
    note: '',
  }),
  getters: {
    loading: (state) => state.status === 'loading',
    failed: (state) => state.status === 'error',
    notReady: (state) => state.status === 'notReady',
  },
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
    /**
     * 读记忆（daemon `memory.list`）：
     * 成功 ⇒ `ready`（条目表，**只本人**）；-32601 ⇒ `notReady`；
     * 其余失败 ⇒ `error`（可重试）。**空表是正常态**（"还没沉淀"），不是错误。
     */
    async load() {
      this.status = 'loading'
      this.error = ''
      this.errorKey = ''
      const token = useAuthStore().sessionToken
      try {
        const res = await getClient().memoryList(token ? { token } : {})
        this.facts = (res?.items ?? []).map((item) => ({
          id: item.id,
          text: item.text,
          source: item.source,
          createdAt: Date.parse(item.created_at) || 0,
        }))
        this.owner = res?.owner ?? ''
        this.note = res?.note ?? ''
        this.status = 'ready'
      } catch (error) {
        const mapped = mapRpcError(error)
        this.errorKey = mapped.key
        if (mapped.key === 'methodNotFound') {
          // 契约先行：daemon 还没这个端点 ⇒ 明说"服务端未就绪"，不假装成功
          this.status = 'notReady'
          this.error = ''
          return
        }
        this.status = 'error'
        this.error = mapped.detail
      }
    },
    /** 本地移除一条（**仅演示/本地视图面**；daemon 侧记忆写面未开，撤回须另刀） */
    removeFact(id: string) {
      this.facts = this.facts.filter((fact) => fact.id !== id)
    },
  },
})
