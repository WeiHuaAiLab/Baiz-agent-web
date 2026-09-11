// MSG-2998 修③（DEBT-619 文件预览 web 面）：预览解码/判定工具——
// 二进制判定、BOM 嗅探、UTF-8/UTF-16/GBK 编码兜底、大件截断明示、凭据件判定。
// 全部纯函数（红证直测）；数据来源经注入面（勿擅定 wire——另令俟颁）。
import hljs from 'highlight.js/lib/common'

/** 预览单次读取上限（超出即截断并明示——防大件卡顿/内存） */
export const PREVIEW_MAX_BYTES = 256 * 1024
/** 语法高亮上限（超出走纯文本——highlight.js 大输入开销高） */
export const HIGHLIGHT_MAX_BYTES = 64 * 1024

export type PreviewKind = 'empty' | 'binary' | 'text'

/** 预览字节读取面（注入）：返回原始字节（编码判定在前端做——勿交已解码串）。
 *  接口形以呈堂对卯为准——本件不定义 wire（另令俟颁）。 */
export type PreviewLoader = (path: string) => Promise<Uint8Array | null>

export interface PreviewDecode {
  kind: PreviewKind
  /** 解码后文本（kind !== 'text' 时为空串） */
  text: string
  /** 编码标签（人话展示；空串=未知/不适用） */
  encoding: string
  /** 是否因超限截断（true 时界面须明示——勿静默） */
  truncated: boolean
  totalBytes: number
  shownBytes: number
}

/** 二进制嗅探：样本内出现 NUL 字节（文本三编码在无 BOM 形态下均不含 NUL） */
export function looksBinary(bytes: Uint8Array): boolean {
  const window = Math.min(bytes.length, 8192)
  for (let i = 0; i < window; i += 1) {
    if (bytes[i] === 0) return true
  }
  return false
}

function strictDecode(bytes: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** 宽松解码：替换字符兜底（截断点切断多字节字符时的最后手段） */
function looseDecode(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function make(
  kind: PreviewKind,
  text: string,
  encoding: string,
  truncated: boolean,
  totalBytes: number,
  shownBytes: number,
): PreviewDecode {
  return { kind, text, encoding, truncated, totalBytes, shownBytes }
}

/**
 * 字节 → 预览解码。顺序：空件 → BOM（UTF-8/UTF-16LE/BE）→ 二进制嗅探 →
 * UTF-8 严格 → GBK 兜底 → UTF-8 宽松（诚实标注）。
 * 截断（> maxBytes）时只解前段并置 truncated（界面明示）。
 */
export function decodePreview(
  bytes: Uint8Array,
  maxBytes: number = PREVIEW_MAX_BYTES,
): PreviewDecode {
  const totalBytes = bytes.length
  if (totalBytes === 0) {
    return make('empty', '', '', false, 0, 0)
  }
  const truncated = totalBytes > maxBytes
  const slice = truncated ? bytes.subarray(0, maxBytes) : bytes
  const shownBytes = slice.length

  // 1) BOM 优先（显式编码声明——最可靠）
  if (slice.length >= 3 && slice[0] === 0xef && slice[1] === 0xbb && slice[2] === 0xbf) {
    const text = looseDecode(slice.subarray(3), 'utf-8')
    return make('text', text, 'UTF-8 (BOM)', truncated, totalBytes, shownBytes)
  }
  if (slice.length >= 2 && slice[0] === 0xff && slice[1] === 0xfe) {
    const text = looseDecode(slice.subarray(2), 'utf-16le')
    return make('text', text, 'UTF-16LE (BOM)', truncated, totalBytes, shownBytes)
  }
  if (slice.length >= 2 && slice[0] === 0xfe && slice[1] === 0xff) {
    const text = looseDecode(slice.subarray(2), 'utf-16be')
    return make('text', text, 'UTF-16BE (BOM)', truncated, totalBytes, shownBytes)
  }

  // 2) 二进制嗅探（无 BOM 文本不含 NUL）
  if (looksBinary(slice)) {
    return make('binary', '', '', truncated, totalBytes, shownBytes)
  }

  // 3) UTF-8 严格
  const utf8 = strictDecode(slice, 'utf-8')
  if (utf8 !== null) {
    return make('text', utf8, 'UTF-8', truncated, totalBytes, shownBytes)
  }

  // 4) GBK 兜底（中文旧档常用；Node/浏览器 TextDecoder 均支持）
  const gbk = strictDecode(slice, 'gbk')
  if (gbk !== null) {
    return make('text', gbk, 'GBK', truncated, totalBytes, shownBytes)
  }

  // 5) 宽松 UTF-8（截断切多字节字符等——诚实降级，界面按 UTF-8 展示）
  const loose = looseDecode(slice, 'utf-8')
  return make('text', loose, 'UTF-8（宽松兜底）', truncated, totalBytes, shownBytes)
}

/** 扩展名 → highlight.js 语言（未命中走自动探测/纯文本） */
const EXT_LANGUAGE: Record<string, string> = {
  rs: 'rust',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  vue: 'xml',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  jsonc: 'json',
  toml: 'ini',
  ini: 'ini',
  conf: 'ini',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  bat: 'dos',
  cmd: 'dos',
  sql: 'sql',
  dockerfile: 'dockerfile',
  lock: 'ini',
}

export function languageForPath(path: string): string | null {
  const name = path.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile'
  return EXT_LANGUAGE[ext] ?? null
}

/**
 * 语法高亮：命中语言即高亮；超出高亮上限或未命中走转义纯文本。
 * 输出为 HTML 串（highlight.js 自身转义）——渲染侧仍须经 DOMPurify 清一遍
 * （安全钉：预览内容按不可信输入处理）。
 */
export function highlightPreview(text: string, path: string, byteLength: number): string {
  const escaped = escapeHtml(text)
  if (byteLength > HIGHLIGHT_MAX_BYTES) return escaped
  const lang = languageForPath(path)
  if (!lang || !hljs.getLanguage(lang)) return escaped
  try {
    return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
  } catch {
    return escaped
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 字节数 → 人话尺寸 */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 凭据敏感件判定（安全钉：遮罩/二次确认方示——只判名，不读内容） */
const CREDENTIAL_PATTERNS: RegExp[] = [
  /(^|[\\/])\.env(\.[^\\/]*)?$/i,
  /\.(pem|key|pfx|p12|jks|keystore|ppk)$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)(\.[^\\/]*)?$/i,
  /(^|[\\/])\.?(credentials|secrets?)(\.[^\\/]*)?$/i,
  /(^|[\\/])\.(npmrc|netrc|pgpass|htpasswd)$/i,
  /(^|[\\/])\.aws([\\/]|$)/i,
  /(^|[\\/])daemon\.token$/i,
  /(^|[\\/])\.ssh([\\/]|$)/i,
]

export function isCredentialFile(path: string): boolean {
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(path))
}
