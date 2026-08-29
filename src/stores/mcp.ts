// MCP 服务 store：MCP（Model Context Protocol）服务配置管理，
// 包括增删改查、启停切换与本地持久化。保存的项由 daemon 在下一次运行时加载。
import { defineStore } from 'pinia'

export type McpTransport = 'stdio' | 'http'
export type McpRiskLevel = 'low' | 'medium' | 'high'
export type McpCapability = 'tools' | 'prompts' | 'resources' | 'sampling'

export interface McpServer {
  id: string
  name: string
  transport: McpTransport
  protocolVersion: string
  command: string
  riskLevel: McpRiskLevel
  capabilities: McpCapability[]
  description: string
  enabled: boolean
}

// 表单草稿：编辑时使用，与 McpServer 等价但 id 可选，且所有字段可编辑
export interface McpDraft {
  id?: string
  name: string
  transport: McpTransport
  protocolVersion: string
  command: string
  riskLevel: McpRiskLevel
  capabilities: McpCapability[]
  description: string
  enabled: boolean
}

const STORAGE_KEY = 'baiz.mcp.servers'

function readServers(): McpServer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // 过滤掉已损坏的项
    return parsed.filter(
      (item): item is McpServer =>
        !!item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        (item.transport === 'stdio' || item.transport === 'http') &&
        typeof item.command === 'string',
    )
  } catch {
    return []
  }
}

function persist(servers: McpServer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers))
  } catch {
    // localStorage 不可用（隐私模式 / 满载）时静默忽略
  }
}

function uid(): string {
  return `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export const useMcpStore = defineStore('mcp', {
  state: () => ({
    servers: readServers() as McpServer[],
  }),
  getters: {
    enabledCount: (state) => state.servers.filter((s) => s.enabled).length,
  },
  actions: {
    addServer(draft: McpDraft) {
      const item: McpServer = {
        id: uid(),
        name: draft.name.trim(),
        transport: draft.transport,
        protocolVersion: draft.protocolVersion,
        command: draft.command.trim(),
        riskLevel: draft.riskLevel,
        capabilities: [...draft.capabilities],
        description: draft.description.trim(),
        enabled: draft.enabled,
      }
      this.servers.push(item)
      persist(this.servers)
    },
    updateServer(id: string, draft: McpDraft) {
      const item = this.servers.find((s) => s.id === id)
      if (!item) return
      item.name = draft.name.trim()
      item.transport = draft.transport
      item.protocolVersion = draft.protocolVersion
      item.command = draft.command.trim()
      item.riskLevel = draft.riskLevel
      item.capabilities = [...draft.capabilities]
      item.description = draft.description.trim()
      item.enabled = draft.enabled
      persist(this.servers)
    },
    removeServer(id: string) {
      this.servers = this.servers.filter((s) => s.id !== id)
      persist(this.servers)
    },
    setEnabled(id: string, enabled: boolean) {
      const item = this.servers.find((s) => s.id === id)
      if (!item) return
      item.enabled = enabled
      persist(this.servers)
    },
    makeDraft(): McpDraft {
      return {
        name: '',
        transport: 'stdio',
        protocolVersion: '2025-11-25',
        command: '',
        riskLevel: 'low',
        capabilities: ['tools'],
        description: '',
        enabled: true,
      }
    },
    cloneForEdit(s: McpServer): McpDraft {
      return {
        id: s.id,
        name: s.name,
        transport: s.transport,
        protocolVersion: s.protocolVersion,
        command: s.command,
        riskLevel: s.riskLevel,
        capabilities: [...s.capabilities],
        description: s.description,
        enabled: s.enabled,
      }
    },
  },
})
