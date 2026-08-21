// 工作树：agent 读/改文件的快照（original/current），支撑聊天引用与右侧 diff 视图。
import { defineStore } from 'pinia'

export interface WorkingFile {
  path: string
  original: string
  current: string
  viewed: boolean
}

const DEMO_FILES: Record<string, { original: string; current: string }> = {
  'src/stores/message.ts': {
    original:
      'import { defineStore } from \'pinia\'\n\nexport const useMessageStore = defineStore(\'message\', {\n  state: () => ({\n    byConversation: {},\n    runs: {},\n  }),\n  actions: {\n    async load() {},\n  },\n})\n',
    current:
      'import { defineStore } from \'pinia\'\n\nexport const useMessageStore = defineStore(\'message\', {\n  state: () => ({\n    byConversation: {} as Record<string, ChatMessage[]>,\n    runs: {} as Record<string, RunState>,\n    callToMessage: {},\n    requestToMessage: {},\n  }),\n  actions: {\n    async load() {},\n    async sendUserMessage() {},\n    stopRun(taskId: string) {},\n  },\n})\n',
  },
  'src/components/ChatView.vue': {
    original:
      '<script setup lang="ts">\nconst input = ref(\'\')\n</script>\n\n<template>\n  <form @submit.prevent="send">\n    <input v-model="input" />\n  </form>\n</template>\n',
    current:
      '<script setup lang="ts">\nconst input = ref(\'\')\nconst messages = useMessageStore()\n</script>\n\n<template>\n  <form @submit.prevent="send">\n    <input v-model="input" placeholder="请输入内容" />\n    <button type="submit">发送</button>\n  </form>\n</template>\n',
  },
  'src/models.ts': {
    original:
      'export interface Conversation {\n  id: string\n  title: string\n}\n',
    current:
      'export interface Conversation {\n  id: string\n  title: string\n  pinnedAt?: number\n  archived?: boolean\n}\n',
  },
}

export const useWorkingTreeStore = defineStore('workingTree', {
  state: () => ({
    files: {} as Record<string, WorkingFile>,
    activePath: '',
  }),
  getters: {
    list(): WorkingFile[] {
      return Object.values(this.files).sort((a, b) => a.path.localeCompare(b.path))
    },
    active(state): WorkingFile | null {
      return state.activePath ? (state.files[state.activePath] ?? null) : null
    },
  },
  actions: {
    seedDemo() {
      for (const [path, content] of Object.entries(DEMO_FILES)) {
        if (!this.files[path]) {
          this.files[path] = { path, ...content, viewed: true }
        }
      }
    },
    upsert(path: string, original: string, current: string) {
      const existing = this.files[path]
      this.files[path] = {
        path,
        original,
        current,
        viewed: existing ? existing.viewed : false,
      }
      if (!this.activePath) this.activePath = path
    },
    noteChange(path: string) {
      const file = this.files[path]
      if (file) file.viewed = false
    },
    selectFile(path: string) {
      this.activePath = path
      const file = this.files[path]
      if (file) file.viewed = true
    },
    applyChanges(path: string) {
      const file = this.files[path]
      if (!file) return
      file.original = file.current
      file.viewed = true
    },
    revertChanges(path: string) {
      const file = this.files[path]
      if (!file) return
      file.current = file.original
      file.viewed = true
    },
    closeViewer() {
      this.activePath = ''
    },
    clear() {
      this.files = {}
      this.activePath = ''
    },
  },
})
