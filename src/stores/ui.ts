// UI 状态：聊天区中央创建模式（会话/普通任务/定时任务）。
import { defineStore } from 'pinia'
import { useSessionStore } from './session'

export type CreateMode = '' | 'session' | 'task' | 'scheduled' | 'project'

/** 从新建会话/任务/聊天输入框跳到「创建项目」时的回归上下文：创建完成后回到原视图。
 * mode 为空字符串表示来自聊天输入框（ChatInput）——创建完成后回到普通会话视图。 */
export interface CreateReturn {
  mode: 'session' | 'task' | ''
  input: string
}

export interface ToastItem {
  id: number
  type: 'info' | 'success' | 'error'
  message: string
}

const onboardingSeen = (() => {
  try {
    return localStorage.getItem('baiz.onboarded') === '1'
  } catch {
    return false
  }
})()

let toastSeq = 0

export const useUiStore = defineStore('ui', {
  state: () => ({
    createMode: '' as CreateMode,
    // 创建模式进入计数：每次 openCreate 递增，CreateChat 据此感知「重复打开同一模式」
    // （如新建会话页已打开时再次点新建/点项目），以便重置表单或换选项目
    createEpoch: 0,
    toasts: [] as ToastItem[],
    paletteOpen: false,
    showOnboarding: !onboardingSeen,
    pendingPrompt: '',
    sidebarCollapsed: false,
    // 创建项目完成后的回归上下文 + 待自动选中的项目 id（CreateChat 重新挂载时消费）
    createReturn: null as CreateReturn | null,
    pendingProjectId: '',
  }),
  actions: {
    openCreate(mode: 'session' | 'task' | 'scheduled' | 'project') {
      if (mode === 'session') {
        // 新建会话：清空当前选中，聊天区回到空白新会话页（消息列表为空）
        useSessionStore().activeId = ''
      }
      this.createMode = mode
      this.createEpoch += 1
    },
    closeCreate() {
      this.createMode = ''
      // 清理「创建项目」回归上下文，避免残留导致后续误回跳/误选中
      this.createReturn = null
      this.pendingProjectId = ''
      this.createEpoch += 1
    },
    /** 从创建流程回到普通会话视图（如 ChatInput 发起新建项目后回跳）：
     * 保留 pendingProjectId，供 ChatInput 重新挂载时消费并自动选中新项目 */
    backToChat() {
      this.createMode = ''
      this.createReturn = null
      this.createEpoch += 1
    },
    toast(message: string, type: ToastItem['type'] = 'info') {
      const id = ++toastSeq
      this.toasts.push({ id, type, message })
      setTimeout(() => {
        this.toasts = this.toasts.filter((item) => item.id !== id)
      }, 3500)
    },
    openPalette() {
      this.paletteOpen = true
    },
    closePalette() {
      this.paletteOpen = false
    },
    completeOnboarding() {
      this.showOnboarding = false
      try {
        localStorage.setItem('baiz.onboarded', '1')
      } catch {
        /* storage unavailable */
      }
    },
    setPendingPrompt(text: string) {
      this.pendingPrompt = text
    },
    /** 展开/收起左侧侧栏 */
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },
  },
})
