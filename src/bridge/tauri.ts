import type { Bridge, CapabilityName, FileEntry } from './types'

// Tauri 桥接实现：经 Rust 壳 command 转发（fs/剪贴板/通知/对话框）。
export function createTauriBridge(): Bridge {
  // 能力集必须诚实：Rust 壳尚未注册的命令不声明为可用，避免 has() 误报
  // 待注册契约：
  //   proxy_fs_list_drives(): string[]            —— 枚举 Windows 盘符（如 ["C:\\","D:\\"]）
  //   proxy_fs_create_dir(parent, name): string   —— 在 parent 下新建文件夹，返回完整路径
  // 注册后需在此声明 'fs.drives' 与 'fs.createDir'，前端即自动启用"新建空白项目"落盘。
  const capabilities = new Set<CapabilityName>(['window.control', 'fs.pickDir'])
  const SAFE_PROTOCOL = /^(https?:|mailto:)/i

  return {
    runtime: 'tauri',
    capabilities,
    has: (name) => capabilities.has(name),
    fs: {
      async readTextFile(path) {
        const { invoke } = await import('@tauri-apps/api/core')
        return invoke<string>('proxy_fs_read_text', { path })
      },
      async listDir(path) {
        const { invoke } = await import('@tauri-apps/api/core')
        return invoke<FileEntry[]>('proxy_fs_list_dir', { path })
      },
      async pickAndReadText() {
        const { invoke } = await import('@tauri-apps/api/core')
        const path = await invoke<string | null>('proxy_dialog_open')
        if (!path) return null
        const content = await invoke<string>('proxy_fs_read_text', { path })
        return { name: path.split(/[\\/]/).pop() ?? path, content }
      },
      async pickDirectory() {
        const { invoke } = await import('@tauri-apps/api/core')
        const path = await invoke<string | null>('proxy_dialog_open_dir')
        if (!path) return null
        return { name: path.split(/[\\/]/).pop() ?? path, path }
      },
      async listPickedDirectory(key: string) {
        const { invoke } = await import('@tauri-apps/api/core')
        try {
          return await invoke<FileEntry[]>('proxy_fs_list_dir', { path: key })
        } catch {
          return []
        }
      },
    },
    clipboard: {
      async readText() {
        const { invoke } = await import('@tauri-apps/api/core')
        return invoke<string>('proxy_clipboard_read')
      },
      async writeText(text) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('proxy_clipboard_write', { text })
      },
    },
    notification: {
      async show(title, body) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('proxy_notify', { title, body })
      },
    },
    dialog: {
      async openFile() {
        const { invoke } = await import('@tauri-apps/api/core')
        return invoke<string | null>('proxy_dialog_open')
      },
    },
    windowControl: {
      async minimize() {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().minimize()
      },
      async setAlwaysOnTop(flag) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().setAlwaysOnTop(flag)
      },
    },
    openExternal: {
      async open(url) {
        if (!SAFE_PROTOCOL.test(url)) return
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('proxy_open_external', { url })
      },
    },
  }
}
