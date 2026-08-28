import type { Bridge, CapabilityName } from './types'

interface PickerWindow extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}

// 授权目录句柄缓存：同一会话内可反复读取该目录，证明"授权后可读"而非上传。
const pickedDirHandles = new Map<string, FileSystemDirectoryHandle>()

/** FileReader 把 File 转 base64 dataURL，作为图片缩略图直接喂给 <img :src> */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read error'))
    reader.readAsDataURL(file)
  })
}

/** 隐藏原生 file input：click() 需元素在文档中，但不能占布局空间/可见，
 * 否则默认尺寸会撑出页面滚动条并在点击前闪现。绝对定位移出视口 + 零尺寸。 */
function hideInput(input: HTMLInputElement) {
  input.style.position = 'fixed'
  input.style.left = '-9999px'
  input.style.top = '0'
  input.style.width = '0'
  input.style.height = '0'
  input.style.opacity = '0'
  input.style.border = '0'
  input.style.padding = '0'
  input.style.margin = '0'
}

// Web 桥接实现：浏览器 API；本机文件能力降级为不可用/文件选取。
export function createWebBridge(): Bridge {
  const capabilities = new Set<CapabilityName>(['clipboard', 'notification'])
  capabilities.add('fs.pick')
  capabilities.add('fs.pickAttachment')
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
          hideInput(input)
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
      /** 选择任意文件作为聊天附件：图片读 dataURL 作为缩略图；纯文本同步读 content；
       *  二进制文件只携带元信息，节省内存（M2 接 Rust 后二进制可直接读字节） */
      async pickAttachment() {
        return new Promise((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '*/*'
          hideInput(input)
          const cleanup = () => input.remove()
          const finish = async (file: File) => {
            cleanup()
            const isImage = file.type.startsWith('image/')
            // 二进制（图片、压缩包等）内容由后端在发送时读取，本期不读
            const isText =
              file.type.startsWith('text/') ||
              /\.(txt|md|markdown|json|toml|ya?ml|rs|ts|tsx|js|css|html|csv|log|sql|sh|py|java|go|c|cpp|h|hpp|vue)$/i.test(
                file.name,
              )
            try {
              if (isImage) {
                const dataUrl = await readAsDataUrl(file)
                resolve({
                  name: file.name,
                  kind: 'image',
                  mimeType: file.type || 'image/*',
                  size: file.size,
                  dataUrl,
                })
                return
              }
              resolve({
                name: file.name,
                kind: 'file',
                mimeType: file.type || 'application/octet-stream',
                size: file.size,
                content: isText ? await file.text().catch(() => '') : undefined,
              })
            } catch {
              resolve(null)
            }
          }
          input.onchange = () => {
            const file = input.files?.[0]
            if (!file) {
              cleanup()
              resolve(null)
              return
            }
            void finish(file)
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
          hideInput(input)
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
