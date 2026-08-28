// 桥接能力抽象：前端业务只依赖此接口，不直接触碰平台 API。
export type Runtime = 'tauri' | 'web'

export type CapabilityName =
  | 'fs.read'
  | 'fs.pick'
  | 'fs.pickDir'
  | 'fs.drives'
  | 'fs.createDir'
  | 'clipboard'
  | 'notification'
  | 'dialog'
  | 'window.control'
  | 'open.external'

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
  has(name: CapabilityName): boolean
}
