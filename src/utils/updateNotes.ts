// MSG-3301：「更新内容可见化」——服务端 `notes`（`latest.json.notes`）的**显示前
// 规范化**（纯函数·可机判）。
//
// 定位：`notes` 是**服务端可控文本**（发布件里的自由文本）。渲染面据此只做三件事：
// ① 换行/空白正常化；② **长度闸**（默认 4KB，超出截断并**明示已截断**）；
// ③ 原样作为**文本节点**交给模板（调用方禁 v-html／innerHTML——安全红证在
// `tests/msg3301-update-notes.test.ts`）。
//
// 不做：不做 Markdown 渲染、不解析链接、不解释语义（契约优先、且避免把服务端
// 文本当结构使唤）。

/** 显示上限（字节级口径取**字符**上限 4096——与令文「4KB」一致，取保守面） */
export const UPDATE_NOTES_MAX_CHARS = 4096

export interface UpdateNotesView {
  /** 规范化后的正文（空串＝服务端未提供／空白） */
  text: string
  /** 是否因超限被截断（界面须显式标注，**禁静默**） */
  truncated: boolean
}

/**
 * 规范化：CRLF／CR → LF；去行尾空白；三连以上空行压成一空行；去首尾空行；
 * 去掉除 `\n`／`\t` 外的控制字符（防终端控制序列与零宽怪符）；超限截断。
 */
export function normalizeUpdateNotes(
  raw?: string | null,
  limit: number = UPDATE_NOTES_MAX_CHARS,
): UpdateNotesView {
  if (typeof raw !== 'string' || raw.length === 0) return { text: '', truncated: false }
  const normalized = raw
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!normalized) return { text: '', truncated: false }
  // 按**码点**截断（避免劈开代理对产生乱码）
  const chars = Array.from(normalized)
  if (chars.length <= limit) return { text: normalized, truncated: false }
  return { text: chars.slice(0, limit).join(''), truncated: true }
}
