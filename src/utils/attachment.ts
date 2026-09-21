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
