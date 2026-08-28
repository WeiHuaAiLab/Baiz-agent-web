// 文件 store：目录树、文本读取、上传预览（经桥接层）。
import { defineStore } from 'pinia'
import { getBridge } from '../bridge'
import type { FileEntry } from '../bridge'
import { useUiStore } from './ui'

export interface AttachmentItem {
  id: string
  /** 'image' 渲染正方形缩略图，'file' 渲染文件名 + 类型·大小 */
  kind: 'image' | 'file'
  name: string
  /** MIME（image/png 等），可能为空字符串 */
  mimeType: string
  /** 字节数 */
  size: number
  /** 文本文件原始内容（M2 完整化后由后端读取二进制） */
  content?: string
  /** 仅图片：dataURL base64，前端 <img :src> 直接展示 */
  dataUrl?: string
}

export const useFilesStore = defineStore('files', {
  state: () => ({
    entries: [] as FileEntry[],
    selectedPath: '',
    previewName: '',
    content: '',
    loading: false,
    attachments: [] as AttachmentItem[],
    pickedDirs: {} as Record<string, { name: string; path: string }>,
  }),
  getters: {
    createDirSupported(state): boolean {
      return getBridge().has('fs.createDir')
    },
  },
  actions: {
    async loadDir(path = '/') {
      const bridge = getBridge()
      if (!bridge.has('fs.read')) return
      this.loading = true
      try {
        this.entries = await bridge.fs.listDir(path)
      } catch {
        this.entries = []
      } finally {
        this.loading = false
      }
    },
    async openPath(path: string) {
      const bridge = getBridge()
      const content = await bridge.fs.readTextFile(path)
      this.selectedPath = path
      this.previewName = path.split(/[\\/]/).pop() ?? path
      this.content = content
    },
    async upload() {
      const bridge = getBridge()
      const picked = await bridge.fs.pickAndReadText()
      if (!picked) return
      this.previewName = picked.name
      this.content = picked.content
    },
    async attachFromPicker() {
      const bridge = getBridge()
      if (!bridge.has('fs.pickAttachment')) {
        useUiStore().toast('当前形态暂不支持选择附件', 'error')
        return
      }
      const picked = await bridge.fs.pickAttachment()
      if (!picked) return
      this.attachments.push({
        id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        kind: picked.kind,
        name: picked.name,
        mimeType: picked.mimeType,
        size: picked.size,
        content: picked.content,
        dataUrl: picked.dataUrl,
      })
    },
    async authorizeDir(): Promise<{ name: string; path: string } | null> {
      const bridge = getBridge()
      if (!bridge.has('fs.pickDir')) {
        useUiStore().toast('当前形态暂不支持授权文件夹', 'error')
        return null
      }
      try {
        const picked = await bridge.fs.pickDirectory()
        if (!picked) return null
        this.pickedDirs[picked.path] = picked
        return picked
      } catch {
        useUiStore().toast('授权文件夹失败', 'error')
        return null
      }
    },
    async loadAuthorizedDir(key: string): Promise<FileEntry[]> {
      const bridge = getBridge()
      if (!bridge.has('fs.pickDir')) return []
      try {
        return await bridge.fs.listPickedDirectory(key)
      } catch {
        return []
      }
    },
    async listDrives(): Promise<string[]> {
      const bridge = getBridge()
      if (!bridge.has('fs.drives')) return []
      try {
        return await bridge.fs.listDrives()
      } catch {
        return []
      }
    },
    async createDir(parent: string, name: string): Promise<string | null> {
      const bridge = getBridge()
      if (!bridge.has('fs.createDir')) {
        useUiStore().toast('当前形态暂不支持新建文件夹（桌面端待 Rust 壳注册）', 'error')
        return null
      }
      try {
        return await bridge.fs.createDir(parent, name)
      } catch {
        useUiStore().toast('新建文件夹失败', 'error')
        return null
      }
    },
    bindDir(path: string, name: string) {
      if (!path || this.pickedDirs[path]) return
      this.pickedDirs[path] = { name: name || path.split(/[\\/]/).pop() || path, path }
    },
    removeAttachment(id: string) {
      this.attachments = this.attachments.filter((item) => item.id !== id)
    },
    clearAttachments() {
      this.attachments = []
    },
    clearPreview() {
      this.previewName = ''
      this.content = ''
      this.selectedPath = ''
    },
  },
})
