// 设置 store：语言/主题/Key 状态/授权目录/模型偏好/连接状态，localStorage 持久化。
import { defineStore } from 'pinia'

export type Locale = 'zh-CN' | 'en-US'
export type Theme = 'light' | 'dark'
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'resync'
// MSG-2358 枚举换正：deepseek 系双名（qwen 假面下架——daemon 侧已归一）；
// vision-exp 尾系实验件勿入枚举（1.0 勿宣称实验面）
export type ModelPref = 'deepseek-v4-pro' | 'deepseek-v4-flash'

/** MSG-2358 旧值迁移闸：localStorage 存量旧值（deepseek/qwen/任意串）系
 * 枚举外值——回落默认 v4-pro（一役双销——S 2351 P3 强转注记并治） */
function readModelPref(): ModelPref {
  const raw = readLocal('baiz.model', 'deepseek-v4-pro')
  return raw === 'deepseek-v4-pro' || raw === 'deepseek-v4-flash'
    ? raw
    : 'deepseek-v4-pro'
}
export type MemoryScope = 'session' | 'recent' | 'all'

function readLocal(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function readLocalArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    locale: readLocal('baiz.locale', 'zh-CN') as Locale,
    theme: readLocal('baiz.theme', 'light') as Theme,
    keyConfigured: readLocal('baiz.keyConfigured', '0') === '1',
    gateway: '',
    workspaces: readLocalArray('baiz.workspaces'),
    activeWorkspace: readLocal('baiz.activeWorkspace', ''),
    connection: 'idle' as ConnectionState,
    demoMode: false,
    model: readModelPref(),
    username: readLocal('baiz.username', '本地用户'),
    memoryEnabled: readLocal('baiz.memoryEnabled', '1') === '1',
    memoryScope: readLocal('baiz.memoryScope', 'recent') as MemoryScope,
    autoDistill: readLocal('baiz.autoDistill', '1') === '1',
  }),
  actions: {
    setLocale(locale: Locale) {
      this.locale = locale
      localStorage.setItem('baiz.locale', locale)
    },
    setTheme(theme: Theme) {
      this.theme = theme
      localStorage.setItem('baiz.theme', theme)
    },
    setKeyConfigured(configured: boolean) {
      this.keyConfigured = configured
      localStorage.setItem('baiz.keyConfigured', configured ? '1' : '0')
    },
    addWorkspace(path: string) {
      const trimmed = path.trim()
      if (!trimmed || this.workspaces.includes(trimmed)) return
      this.workspaces.push(trimmed)
      localStorage.setItem('baiz.workspaces', JSON.stringify(this.workspaces))
      if (!this.activeWorkspace) this.activeWorkspace = trimmed
      localStorage.setItem('baiz.activeWorkspace', this.activeWorkspace)
    },
    removeWorkspace(path: string) {
      this.workspaces = this.workspaces.filter((item) => item !== path)
      localStorage.setItem('baiz.workspaces', JSON.stringify(this.workspaces))
      if (this.activeWorkspace === path) {
        this.activeWorkspace = ''
        localStorage.setItem('baiz.activeWorkspace', '')
      }
    },
    setActiveWorkspace(path: string) {
      this.activeWorkspace = path
      localStorage.setItem('baiz.activeWorkspace', path)
    },
    setConnection(state: ConnectionState) {
      this.connection = state
    },
    setDemoMode(demo: boolean) {
      this.demoMode = demo
    },
    setModel(model: ModelPref) {
      this.model = model
      localStorage.setItem('baiz.model', model)
    },
    setMemoryEnabled(enabled: boolean) {
      this.memoryEnabled = enabled
      localStorage.setItem('baiz.memoryEnabled', enabled ? '1' : '0')
    },
    setMemoryScope(scope: MemoryScope) {
      this.memoryScope = scope
      localStorage.setItem('baiz.memoryScope', scope)
    },
    setAutoDistill(enabled: boolean) {
      this.autoDistill = enabled
      localStorage.setItem('baiz.autoDistill', enabled ? '1' : '0')
    },
  },
})
