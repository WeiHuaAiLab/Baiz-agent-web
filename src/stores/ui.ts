// UI 状态：聊天区中央创建模式（会话/普通任务/定时任务）。
import { defineStore } from 'pinia'
import { useSessionStore } from './session'

export type CreateMode = '' | 'session' | 'task' | 'scheduled'

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
    toasts: [] as ToastItem[],
    paletteOpen: false,
    showOnboarding: !onboardingSeen,
    pendingPrompt: '',
  }),
  actions: {
    openCreate(mode: 'session' | 'task' | 'scheduled') {
      if (mode === 'session') {
        // 新建会话：清空当前选中，聊天区回到空白新会话页（消息列表为空）
        useSessionStore().activeId = ''
      }
      this.createMode = mode
    },
    closeCreate() {
      this.createMode = ''
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
  },
})
