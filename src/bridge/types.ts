// 桥接能力抽象：前端业务只依赖此接口，不直接触碰平台 API。
export type Runtime = 'tauri' | 'web'

export type CapabilityName =
  | 'fs.read'
  | 'fs.pick'
  | 'fs.pickAttachment'
  | 'fs.pickDir'
  | 'fs.drives'
  | 'fs.createDir'
  | 'clipboard'
  | 'notification'
  | 'dialog'
  | 'window.control'
  | 'open.external'
  | 'updater.check'

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
}

/** 聊天附件的统一载荷。kind 用于在输入区上方按类型分支渲染：
 *  - 'image'：前端用 dataUrl 直接展示正方形缩略图
 *  - 'file' ：展示文件名 + 「类型·大小」meta 行 */
export interface AttachmentPayload {
  name: string
  /** 'image' 走缩略图，'file' 走名称+meta 行 */
  kind: 'image' | 'file'
  /** 完整 MIME（如 'image/png'）；空字符串兜底为 'FILE' */
  mimeType: string
  /** 字节数；展示时格式化 KB/MB */
  size: number
  /** 文本附件的内容（二进制图片等不读，省内存） */
  content?: string
  /** 仅图片：dataURL base64，前端 <img :src> 直接展示 */
  dataUrl?: string
}

export interface FsBridge {
  readTextFile(path: string): Promise<string>
  listDir(path: string): Promise<FileEntry[]>
  pickAndReadText(): Promise<{ name: string; content: string } | null>
  /** 选择任意文件作为聊天附件：返回 mimeType/size/可选 dataUrl。 */
  pickAttachment(): Promise<AttachmentPayload | null>
  pickDirectory(): Promise<{ name: string; path: string } | null>
  listPickedDirectory(key: string): Promise<FileEntry[]>
  listDrives(): Promise<string[]>
  createDir(parent: string, name: string): Promise<string | null>
}

export interface ClipboardBridge {
  readText(): Promise<string>
  writeText(text: string): Promise<void>
}

export interface NotificationBridge {
  show(title: string, body?: string): Promise<void>
}

export interface DialogBridge {
  openFile(): Promise<string | null>
}

export interface WindowControlBridge {
  minimize(): Promise<void>
  setAlwaysOnTop(flag: boolean): Promise<void>
}

export interface OpenExternalBridge {
  open(url: string): Promise<void>
}

/** **MSG-3509 P1/P2**：持久登录／显式退出的**壳侧**面。
 *
 * 硬口径：**零令牌输出**——`status()` 只回"是否已登录＋账号 id"，
 * 令牌只进**系统凭据库**（壳侧 `identity_store`）与壳内存，前端拿不到、存不下。
 * 非 tauri 形态（纯 web）诚实回"未登录"／空操作（**不造假**）。 */
export interface IdentityBridge {
  status(): Promise<{ loggedIn: boolean; userId: string }>
  logout(): Promise<void>
}

// MSG-3203 DEBT-741（移植 MSG-2726）：自动更新检查结果
// （tauri 形态——无新版/web 形态 null）
export interface UpdateCheckResult {
  available: boolean
  version?: string
  /** MSG-3301：服务端更新说明（`latest.json` 的 `notes`——tauri 插件侧为
   *  `Update.body`）。**服务端可控文本**：渲染面按纯文本处理（禁 v-html）。
   *  形态不支持或服务端未给 ⇒ `null`（界面显式兜底，**勿造假**）。 */
  notes?: string | null
  /** 下载并安装（tauri 插件 downloadAndInstall——被动装） */
  install(): Promise<void>
}

export class UnsupportedError extends Error {
  constructor(public readonly capability: CapabilityName) {
    super(`capability not available: ${capability}`)
    this.name = 'UnsupportedError'
  }
}

export interface Bridge {
  readonly runtime: Runtime
  readonly capabilities: ReadonlySet<CapabilityName>
  readonly fs: FsBridge
  readonly clipboard: ClipboardBridge
  readonly notification: NotificationBridge
  readonly dialog: DialogBridge
  readonly windowControl: WindowControlBridge
  readonly openExternal: OpenExternalBridge
  /** MSG-3509：持久登录探询／退出（tauri 形态真调壳 command；其余诚实回空） */
  readonly identity: IdentityBridge
  /** MSG-3203：自动更新检查（tauri 形态真检——无新版返 available:false——
   *  非 tauri 形态返 null（has('updater.check') 前置门控） */
  checkUpdate(): Promise<UpdateCheckResult | null>
  has(name: CapabilityName): boolean
}
