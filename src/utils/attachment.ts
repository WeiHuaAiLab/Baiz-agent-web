// MSG-3270 P0（施工11号组）：附件错配·**前端面**——上送契约与"逐字节一致"底座。
//
// 正本（MSG-3264 八号组 §1.3「①的前端令清单」）：
//   1. 前端 `chatSend` **增发结构化 `attachments`**（name/mimeType/size/kind ＋ **sha256**，
//      图片带 dataUrl，文本带 content）；
//   2. 验收＝唯一随机件上传 ⇒ 前端/daemon 段 **SHA 一致**（逐字节）。
// 另：八号组专家裁 M1——**以 ```` ``` ```` 围栏做行内附件块不可靠**（附件正文自带 fence 会提前闭合、
// 正文含 `[附件：` 字样会污染计数）⇒ 本件把行内块换成**随机 nonce 信封**（内容无法自然提前闭合）。

import { formatFileSize } from './format'

/** 上送 daemon 的结构化附件（正本 §1.3.1 字段面） */
export interface AttachmentWire {
  name: string
  kind: 'image' | 'file'
  mimeType: string
  size: number
  /** 载荷摘要：文本＝`content` 的 UTF-8 字节；图片＝`dataUrl` 字面量（即上送原文） */
  sha256: string
  content?: string
  dataUrl?: string
}

/** 摘要源：文本取 `content`，图片取 `dataUrl`（与上送载荷逐字节同源） */
export function attachmentDigestSource(att: { kind?: string; content?: string; dataUrl?: string }): string {
  if (att.kind === 'image') return att.dataUrl ?? ''
  return att.content ?? ''
}

/** SHA-256（WebCrypto；宿主无 subtle ⇒ 返回空串，由调用方按"摘要缺省"照录，不伪造） */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return ''
  const bytes = new TextEncoder().encode(text)
  const digest = await subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

// ── T11／DEBT-872：**大附件**的单件限值契约（**8 MiB**） ──
//
// 限值**有据·非自拟**：`src/bridge/web.ts:95-99` 的 web 形态护栏原文即
// 「MSG-2893 DEBT-597 目④：8MB 护栏 web 形态对齐（壳 `MAX_ATTACH_BYTES` 8MiB——
// web 无——超限拒（错误告知——勿静默截）」。
// 本件把该上限**上提到共享面**：picker 与拖拽两条入径、web 与 tauri 两种形态**同一判据**。
// 改前只有 web-picker 一处设闸，**拖拽径完全无闸**（8M 拖入 ⇒ 无提示、无进行态、静默卡住）。
//
// **不发明总量上限**：本场无任何「多条并列总量」上限的契约依据 ⇒ 只**照实显示**当前体积
// 供人判断，不自行发明第二道闸（越权的限值 = 另一种静默）。
/** 单件附件上限（8 MiB）——与壳 `MAX_ATTACH_BYTES`／web 护栏同源 */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

/** 超限判据（纯函数·可机判）：**严格大于**才算超（等于上限放行——与 web.ts 的 `>` 同口径） */
export function isAttachmentOverLimit(size: number): boolean {
  return Number.isFinite(size) && size > MAX_ATTACHMENT_BYTES
}

/** 上限的人话形态（界面复用；避免各处硬编 "8MB" 字样漂移） */
export function attachmentLimitText(): string {
  return formatFileSize(MAX_ATTACHMENT_BYTES)
}

/**
 * 超限人话（T11 目③：**说明限值与该怎么做**）——点名文件、给实测体积、给限值、给下一步。
 * 措辞口径照 `utils/errors.ts:dirReadFailedText` 例（人话在 utils 里成形、store 直接上屏）。
 */
export function overLimitNotice(name: string, size: number): string {
  return `附件「${name}」${formatFileSize(size)} 超过单件上限 ${attachmentLimitText()}，未读入内容；请换更小的文件，或先压缩后重传`
}

/** 首行预览（去空白、截断）——上传后回显用（让用户当场确认，杜绝"错配无感知"） */
export function firstLineOf(text?: string, max = 80): string {
  if (!text) return ''
  const line = text.split(/\r?\n/, 1)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  return line.length > max ? `${line.slice(0, max)}…` : line
}

/** 本次发送的随机 nonce（信封边界；同一次发送内所有块共用，跨次不同） */
export function newAttachmentNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 行内附件信封（**fence 免疫**）：随机 nonce 作边界 ⇒ 附件正文里任何 ``` / `[附件：` 都不会
 * 造成"提前闭合/计数污染"（八号组 M1 的失效面）。头部仍保留人话元信息（含 sha256 供对卯）。
 */
export function buildAttachmentEnvelope(
  attachments: Array<{ name: string; kind: string; mimeType?: string; size?: number; sha256?: string; content?: string; dataUrl?: string }>,
  nonce: string,
): string {
  const BEGIN = `-----BEGIN BAIZ-ATT-${nonce}-----`
  const END = `-----END BAIZ-ATT-${nonce}-----`
  const parts: string[] = []
  attachments.forEach((att, index) => {
    // 元信息人话（mime · 尺寸）——沿用既有 formatFileSize 口径（与卡面 chip 同源）
    const meta = [att.mimeType, typeof att.size === 'number' ? formatFileSize(att.size) : '']
      .filter(Boolean)
      .join(' · ')
    const head = `[附件${index + 1}：${att.name}${meta ? `（${meta}）` : ''}${att.sha256 ? ` sha256=${att.sha256}` : ''}]`
    const body =
      att.kind === 'image'
        ? '图片元信息已随会话上送；当前模型为文本模型，不读图内容（像素）。如要看图，请直接查看会话中的图片'
        : att.content ?? ''
    parts.push(`\n\n${head}\n${BEGIN}\n${body}\n${END}`)
  })
  return parts.join('')
}
