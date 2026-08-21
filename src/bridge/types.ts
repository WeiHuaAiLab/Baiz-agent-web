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

export interface FsBridge {
  readTextFile(path: string): Promise<string>
  listDir(path: string): Promise<FileEntry[]>
  pickAndReadText(): Promise<{ name: string; content: string } | null>
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
