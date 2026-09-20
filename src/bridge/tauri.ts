import type {
  AttachmentPayload,
  Bridge,
  CapabilityName,
  FileEntry,
  UpdateCheckResult,
} from './types'

// Tauri 桥接实现：经 Rust 壳 command 转发（fs/剪贴板/通知/对话框）。
export function createTauriBridge(): Bridge {
  // 能力集必须诚实：Rust 壳尚未注册的命令不声明为可用，避免 has() 误报
  // 待注册契约：
  //   proxy_fs_list_drives(): string[]            —— 枚举 Windows 盘符（如 ["C:\\","D:\\"]）
  //   proxy_fs_create_dir(parent, name): string   —— 在 parent 下新建文件夹，返回完整路径
  // 注册后需在此声明 'fs.drives' 与 'fs.createDir'，前端即自动启用"新建空白项目"落盘。
  const capabilities = new Set<CapabilityName>([
    'window.control',
    'fs.pickDir',
    'fs.pickAttachment',
    // MSG-3203 DEBT-741：壳已注册 updater 插件（tauri.conf plugins.updater）
    // ——前端 @tauri-apps/plugin-updater check 面可用
    'updater.check',
  ])
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
      // DEBT-540-A：tauri 形态附件选择——Rust 壳 proxy_pick_attachment
      // （web 形态 pickAttachment 语义镜像：image→dataUrl/文本→content）
      async pickAttachment() {
        const { invoke } = await import('@tauri-apps/api/core')
        try {
          const out = await invoke<AttachmentPayload | null>('proxy_pick_attachment')
          return out
        } catch {
          return null
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
    // MSG-3203 DEBT-741（移植 MSG-2726）：自动更新检查（tauri-plugin-updater——
    // 壳侧已注册——check→available/version——install 触发 downloadAndInstall 被动装）
    async checkUpdate(): Promise<UpdateCheckResult | null> {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check().catch(() => null)
      if (!update) return { available: false }
      // rust-expert MSG-3203 复审 D 点（三陷阱）：
      // ① `Update` 是 Resource（JS 持 Rust 侧 rid）——本闭包**强引用**它，
      //    不脱离作用域，故 GC 不会提前 close；
      // ② `downloadAndInstall` **消费**该资源，二次调用必败 ⇒ `consumed` 闸；
      // ④ 勿长期持有「检查→安装」：安装时**重取**（用户确认可能已过数小时，
      //    期间发布会变）——重取返 null 即视为已无更新（静默收口，不误报失败）。
      let consumed = false
      return {
        available: true,
        version: update.version,
        async install() {
          if (consumed) {
            throw new Error('该更新对象已消费——请重新检查更新')
          }
          consumed = true
          const fresh = await check().catch(() => null)
          if (!fresh) return
          await fresh.downloadAndInstall()
        },
      }
    },
  }
}
