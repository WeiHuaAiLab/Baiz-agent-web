// 文件 store：目录树、文本读取、上传预览（经桥接层）。
import { defineStore } from 'pinia'
import { getBridge } from '../bridge'
import type { AttachmentPayload, FileEntry } from '../bridge'
import type { PreviewLoader } from '../utils/filePreview'
import { dirReadFailedText } from '../utils/errors'
import { isAttachmentOverLimit, overLimitNotice } from '../utils/attachment'
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
  /**
   * **T11／DEBT-872**：超单件上限（8 MiB）——**不读内容**、**不可发送**，界面须明示。
   * 改前该件**照读不误**（8M 图 = 约 10.7M base64 常驻内存）且界面无任何异常标记
   * ⇒ 用户只看到"卡住了"（DEBT-872 原文"无提示、无动态"）。
   */
  overLimit?: boolean
}

/** 给附件 chip 分配一个稳定唯一 id（picker 与 drag 都用同一规则，便于重复上传去重时可拓展） */
function newAttachmentId(): string {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 桥接 payload → store item 的统一转换：单文件 picker 与拖拽批量都走这条管道。
 *  **T11**：超限标记**在此单点判定**——两条入径（picker／拖拽）与两种形态
 *  （web／tauri）自动同口径，免得日后新增入径又漏一处闸。 */
function payloadToAttachment(payload: AttachmentPayload): AttachmentItem {
  const overLimit = isAttachmentOverLimit(payload.size)
  return {
    id: newAttachmentId(),
    kind: payload.kind,
    name: payload.name,
    mimeType: payload.mimeType,
    size: payload.size,
    // 超限件**不留内容**（picker 径的壳已读：此处必须卸掉，否则 8M 件的 base64 照旧常驻内存）
    content: overLimit ? undefined : payload.content,
    dataUrl: overLimit ? undefined : payload.dataUrl,
    ...(overLimit ? { overLimit: true } : {}),
  }
}

export const useFilesStore = defineStore('files', {
  state: () => ({
    entries: [] as FileEntry[],
    selectedPath: '',
    previewName: '',
    content: '',
    loading: false,
    attachments: [] as AttachmentItem[],
    /** **T11 目②**：附件读取**进行态**——已读毕件数／本批总件数（`attachReading>0` 即"处理中"）。
     *  改前本循环**零反馈**：拖入 8M 件后界面静止不动，用户分不清"在传"还是"死了"。 */
    attachReading: 0,
    attachReadingTotal: 0,
    pickedDirs: {} as Record<string, { name: string; path: string }>,
    /** MSG-3218 ②：授权目录树——逐层取数缓存／展开态／加载态／失败文案
     *  （改前是面板里的单层 `authorizedEntries`：一层平铺、子目录不可展开） */
    dirEntries: {} as Record<string, FileEntry[]>,
    dirOpen: {} as Record<string, boolean>,
    dirLoading: {} as Record<string, boolean>,
    /** MSG-3218 ①：列目录失败文案（按路径）——失败须能被界面呈现，禁静默空表 */
    dirErrors: {} as Record<string, string>,
    /** MSG-2998 修③（DEBT-619）：预览字节读取面（注入）——预览内容接口
     *  属 daemon 侧只读 RPC（另令俟颁），本令只做前端组件与交互、勿擅定
     *  wire；未注入时预览面板诚实降级。 */
    previewLoader: null as PreviewLoader | null,
  }),
  getters: {
    createDirSupported(state): boolean {
      return getBridge().has('fs.createDir')
    },
    /** **T11 目①**：当前体积（**照实显示**，供人自行判断；总量上限无契约依据 ⇒ 不自拟） */
    attachmentsTotalBytes(state): number {
      return state.attachments.reduce((sum, item) => sum + (Number.isFinite(item.size) ? item.size : 0), 0)
    },
    /** **T11 目①**：是否可发送——有超限件即**不可发送**（界面据此显"超限，请先移除"） */
    attachmentsSendable(state): boolean {
      return !state.attachments.some((item) => item.overLimit === true)
    },
    /** **T11 目②**：读取在途（拖入大件后界面须立刻有动态，不得静止） */
    attachProcessing(state): boolean {
      return state.attachReading > 0 || state.attachReadingTotal > 0
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
      // **T11**：picker 径同样过闸——web 形态壳内已拒（`bridge/web.ts:95`），但 **tauri 形态
      // 壳侧 `proxy_pick_attachment` 本场无实现**（`src-tauri/src/lib.rs` 无此命令）⇒ 不能假定
      // 壳已拦；store 是两条入径的共同收口，闸设在此才不漏。
      this.attachments.push(payloadToAttachment(picked))
      if (isAttachmentOverLimit(picked.size)) {
        useUiStore().toast(overLimitNotice(picked.name, picked.size), 'error')
      }
    },
    /**
     * 拖拽批量上传：接受原生 File[]（来自 drop.dataTransfer.files）。
     * 不调用桥接——drop 事件本身已给到 File 句柄，再走桥接反而绕路。
     * 单个文件读失败不阻断其他文件；读图用 FileReader.asDataURL 与 web.ts:95-120 一致。
     * 是否允许拖拽（capability 探测、文件类型过滤等）由调用方在 UI 层决定——store 不重复门禁。
     */
    async attachFromFiles(files: File[]) {
      if (!files.length) return
      // **T11 目②**：进循环前先把"处理中"立起来——大件读取耗时全在下面这个 for 里，
      // 计数必须在 await 之前可见，否则又是"静默卡住"。
      this.attachReadingTotal = files.length
      this.attachReading = 0
      const isText = (f: File) =>
        f.type.startsWith('text/') ||
        /\.(txt|md|markdown|json|toml|ya?ml|rs|ts|tsx|js|css|html|csv|log|sql|sh|py|java|go|c|cpp|h|hpp|vue)$/i.test(
          f.name,
        )
      const readAsDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(reader.error ?? new Error('read error'))
          reader.readAsDataURL(file)
        })
      const items: AttachmentItem[] = []
      // 外层 finally 兜底复位：任何早退/异常都不得把"处理中"永久挂在界面上
      try {
        for (const file of files) {
          try {
            // **T11 目③**：超限件**直接不读**——8M 件照读正是 DEBT-872 的病灶本体
            // （无提示、无进行态、静默卡住）。只落元信息入列（`overLimit` 由
            // `payloadToAttachment` 单点判定），并当场给"限值＋该怎么做"的人话。
            if (isAttachmentOverLimit(file.size)) {
              items.push(
                payloadToAttachment({
                  name: file.name,
                  kind: file.type.startsWith('image/') ? 'image' : 'file',
                  mimeType: file.type || 'application/octet-stream',
                  size: file.size,
                }),
              )
              useUiStore().toast(overLimitNotice(file.name, file.size), 'error')
              continue
            }
            if (file.type.startsWith('image/')) {
              const dataUrl = await readAsDataUrl(file)
              items.push(
                payloadToAttachment({
                  name: file.name,
                  kind: 'image',
                  mimeType: file.type || 'image/*',
                  size: file.size,
                  dataUrl,
                }),
              )
            } else {
              items.push(
                payloadToAttachment({
                  name: file.name,
                  kind: 'file',
                  mimeType: file.type || 'application/octet-stream',
                  size: file.size,
                  content: isText(file) ? await file.text().catch(() => '') : undefined,
                }),
              )
            }
          } catch {
            // 单个文件读失败（如 FileReader 报错）跳过；不影响其他文件
            useUiStore().toast(`附件 ${file.name} 读取失败`, 'error')
          } finally {
            // **T11 目②**：每毕一件即推进——界面「处理中 N/M」是真进度，非装饰
            this.attachReading += 1
          }
        }
      } finally {
        this.attachReading = 0
        this.attachReadingTotal = 0
      }
      if (items.length) this.attachments.push(...items)
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
    /** 目录优先、其次按名——与壳侧 `proxy_fs_list_dir` 排序口径一致（host.rs:79） */
    sortEntries(entries: FileEntry[]): FileEntry[] {
      return [...entries].sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    },
    /**
     * MSG-3218 ①：读授权目录一层。
     * 成功 ⇒ 入缓存并清该路径旧错误；失败 ⇒ **文案入 dirErrors（界面可现）并上抛**
     * —— 改前 `catch { return [] }` 静默兜空，是"授权目录列表不对＋文件打不开"的成因之一。
     */
    async loadAuthorizedDir(key: string): Promise<FileEntry[]> {
      const bridge = getBridge()
      const fail = (message: string): never => {
        const text = dirReadFailedText(key, message)
        this.dirErrors = { ...this.dirErrors, [key]: text }
        throw new Error(text)
      }
      if (!bridge.has('fs.pickDir')) {
        fail('当前形态不支持读取本机授权目录（请用桌面端打开）')
      }
      this.dirLoading = { ...this.dirLoading, [key]: true }
      try {
        const entries = this.sortEntries(await bridge.fs.listPickedDirectory(key))
        this.dirEntries = { ...this.dirEntries, [key]: entries }
        if (this.dirErrors[key]) {
          const next = { ...this.dirErrors }
          delete next[key]
          this.dirErrors = next
        }
        return entries
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error))
      } finally {
        this.dirLoading = { ...this.dirLoading, [key]: false }
      }
    },
    /**
     * MSG-3218 ②：授权目录树逐层展开/收起（点击目录 → 首次展开时取该层内容）。
     * 失败不抛未处理拒绝——文案已入 dirErrors，由面板呈现（禁静默空表）。
     */
    async toggleDir(key: string): Promise<void> {
      const willOpen = !this.dirOpen[key]
      this.dirOpen = { ...this.dirOpen, [key]: willOpen }
      if (!willOpen || this.dirEntries[key]) return
      try {
        await this.loadAuthorizedDir(key)
      } catch {
        /* 失败文案已入 dirErrors */
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
    /** 注入预览读取面（接线候另令——本令只立形与交互） */
    setPreviewLoader(loader: PreviewLoader | null) {
      this.previewLoader = loader
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
