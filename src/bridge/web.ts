import type { Bridge, CapabilityName } from './types'

interface PickerWindow extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}

// 授权目录句柄缓存：同一会话内可反复读取该目录，证明"授权后可读"而非上传。
const pickedDirHandles = new Map<string, FileSystemDirectoryHandle>()

// Web 桥接实现：浏览器 API；本机文件能力降级为不可用/文件选取。
export function createWebBridge(): Bridge {
  const capabilities = new Set<CapabilityName>(['clipboard', 'notification'])
  capabilities.add('fs.pick')
  capabilities.add('fs.pickDir')
  capabilities.add('fs.drives')
  capabilities.add('fs.createDir')
  const SAFE_PROTOCOL = /^(https?:|mailto:)/i

  return {
    runtime: 'web',
    capabilities,
    has: (name) => capabilities.has(name),
    fs: {
      async readTextFile() {
        // Web 形态没有本机文件系统；文件经 daemon 网关上传/下载（M2）
        return Promise.reject(new Error('fs.read unavailable in web runtime'))
      },
      async listDir() {
        return Promise.reject(new Error('fs.read unavailable in web runtime'))
      },
      async pickAndReadText() {
        return new Promise((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.txt,.md,.rs,.toml,.json,.csv,.log,.yaml,.yml,text/*'
          const cleanup = () => input.remove()
          input.onchange = async () => {
            const file = input.files?.[0]
            cleanup()
            if (!file) {
              resolve(null)
              return
            }
            try {
              resolve({ name: file.name, content: await file.text() })
            } catch {
              resolve(null)
            }
          }
          input.addEventListener('cancel', () => {
            cleanup()
            resolve(null)
          })
          document.body.appendChild(input)
          input.click()
        })
      },
      async pickDirectory() {
        const picker = window as PickerWindow
        if (typeof picker.showDirectoryPicker === 'function') {
          try {
            const handle = await picker.showDirectoryPicker()
            pickedDirHandles.set(handle.name, handle)
            return { name: handle.name, path: handle.name }
          } catch {
            return null // 用户取消
          }
        }
        // 非 Chromium 兜底：webkitdirectory（浏览器不暴露绝对路径，仅作标签）
        return new Promise((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.setAttribute('webkitdirectory', '')
          input.setAttribute('directory', '')
          const cleanup = () => input.remove()
          input.onchange = () => {
            const file = input.files?.[0]
            cleanup()
            if (!file) {
              resolve(null)
              return
            }
            // 浏览器不暴露绝对路径：以所选文件夹名作为工作区标识
            const name = file.webkitRelativePath.split('/')[0] || 'workspace'
            resolve({ name, path: name })
          }
          input.addEventListener('cancel', () => {
            cleanup()
            resolve(null)
          })
          document.body.appendChild(input)
          input.click()
        })
      },
      async listPickedDirectory(key: string) {
        const handle = pickedDirHandles.get(key)
        if (!handle) return []
        const entries: import('./types').FileEntry[] = []
        for await (const entry of handle.values()) {
          entries.push({
            name: entry.name,
            path: `${key}/${entry.name}`,
            isDir: entry.kind === 'directory',
          })
        }
        return entries
      },
      // 浏览器形态没有"盘符"概念：返回空，前端降级为"选择父目录"后在其下创建。
      async listDrives() {
        return []
      },
      async createDir(parent: string, name: string) {
        const handle = pickedDirHandles.get(parent)
        if (!handle) return null
        try {
          const child = await handle.getDirectoryHandle(name, { create: true })
          const key = `${parent}/${name}`
          pickedDirHandles.set(key, child)
          return key
        } catch {
          return null
        }
      },
    },
    clipboard: {
      async readText() {
        return navigator.clipboard.readText()
      },
      async writeText(text) {
        await navigator.clipboard.writeText(text)
      },
    },
    notification: {
      async show(title, body) {
        if ('Notification' in window) {
          const permission = await Notification.requestPermission()
          if (permission === 'granted') new Notification(title, { body })
        }
      },
    },
    dialog: {
      async openFile() {
        // TODO(M2): 用 <input type="file"> 桥接
        return null
      },
    },
    windowControl: {
      async minimize() {
        return Promise.reject(new Error('window.control unavailable in web runtime'))
      },
      async setAlwaysOnTop() {
        return Promise.reject(new Error('window.control unavailable in web runtime'))
      },
    },
    openExternal: {
      async open(url) {
        if (!SAFE_PROTOCOL.test(url)) return
        window.open(url, '_blank', 'noopener')
      },
    },
  }
}
