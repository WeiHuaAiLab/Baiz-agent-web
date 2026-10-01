// 消息发送前：结构化附件转 wire（sha256）＋拼接行内信封——纯函数外置（收回 message.ts 行数，功能零变）。
import { attachmentDigestSource, buildAttachmentEnvelope, newAttachmentNonce, sha256Hex } from './attachment'
import type { AttachmentWire } from './attachment'
import type { AttachmentItem } from '../stores/files'

export interface WireText {
  effective: string
  wireAttachments: AttachmentWire[] | undefined
}

export async function buildWireText(
  text: string,
  attachments?: AttachmentItem[],
): Promise<WireText> {
  let effective = text
  let wireAttachments: AttachmentWire[] | undefined
  if (attachments && attachments.length > 0) {
    wireAttachments = await Promise.all(
      attachments.map(async (att) => ({
        name: att.name,
        kind: att.kind,
        mimeType: att.mimeType,
        size: att.size,
        sha256: await sha256Hex(attachmentDigestSource(att)),
        ...(att.content !== undefined ? { content: att.content } : {}),
        ...(att.dataUrl !== undefined ? { dataUrl: att.dataUrl } : {}),
      })),
    )
    effective = text + buildAttachmentEnvelope(wireAttachments ?? [], newAttachmentNonce())
  }
  return { effective, wireAttachments }
}
