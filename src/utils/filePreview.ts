// MSG-2998 修③（DEBT-619 文件预览 web 面）：预览解码/判定工具——
// 二进制判定、BOM 嗅探、UTF-8/UTF-16/GBK 编码兜底、大件截断明示、凭据件判定。
// 全部纯函数（红证直测）；数据来源经注入面（勿擅定 wire——另令俟颁）。
import hljs from 'highlight.js/lib/common'

/** 预览单次读取上限（超出即截断并明示——防大件卡顿/内存） */
export const PREVIEW_MAX_BYTES = 256 * 1024
/** 语法高亮上限（超出走纯文本——highlight.js 大输入开销高） */
export const HIGHLIGHT_MAX_BYTES = 64 * 1024

export type PreviewKind = 'empty' | 'binary' | 'text'

/** MSG-3014 包131：daemon 预览 RPC 载荷（wire 形对卯——MSG-2998 呈堂③建议形
 *  ＋本令④标记）：原始字节（base64 承载）＋size 全值＋truncated＋binary。 */
export interface PreviewPayload {
  bytes: Uint8Array
  /** 全件字节数（daemon 服务端真值——截断面「已示 X/共 Y」须真值） */
  totalBytes: number
  /** 服务端已截断（max_bytes 强制——界面须明示） */
  truncated: boolean
  /** daemon 二进制标记（权威——全件判；web sniff 采样 8KB 兜底） */
  binary: boolean
}

/** MSG-3014：daemon 预览 RPC 响应形（wire 对卯件——勿擅改字段名）。 */
export interface PreviewRpcResponse {
  bytes_b64: string
  size: number
  truncated: boolean
  binary: boolean
}

/** MSG-3014：RPC 调用面（注入——mock 可测；真装走 client.previewRead）。 */
export type PreviewRpcCaller = (
  path: string,
  maxBytes: number,
) => Promise<PreviewRpcResponse | null>

/** 预览字节读取面（注入）：返回原始字节（编码判定在前端做——勿交已解码串）
 *  或 daemon 载荷（带 size/truncated/binary 标记——MSG-3014 接线）。
 *  接口形以呈堂对卯为准（裸字节面保留——旧测/旧注入零破）。 */
export type PreviewLoader = (
  path: string,
) => Promise<Uint8Array | PreviewPayload | null>

/** base64 → 原始字节（daemon 出参解码；解码失败返回 null——honest 降级）。 */
export function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** MSG-3014 接线工厂：daemon RPC → PreviewLoader（接真——装机可执行）。
 *  败面/null 俱诚实返回 null（界面降级文案）；daemon 标记随载荷透传
 *  （size/truncated/binary——显示面真值来源）。
 *
 *  MSG-3225 ①（DEBT-753「预览读取失败」零信息）：**RPC 败面不再吞成 null**——
 *  包装成 `PreviewLoadError`（带 `kind` 与人话键位）抛给界面，界面按
 *  `previewFailureKey()` 显「人话＋可行动指引＋服务端原文」。旧口径把
 *  daemon 的越界原文（如「路径越界（不在授权目录内）」）整条吞掉 ⇒ 界面只剩
 *  「预览读取失败」六字，用户无从下手。 */
export class PreviewLoadError extends Error {
  readonly kind: PreviewFailureKind
  /** 服务端原文（逐字——零改写，供界面附在指引后） */
  readonly raw: string

  constructor(raw: string) {
    super(raw)
    this.name = 'PreviewLoadError'
    this.kind = classifyPreviewFailure(raw)
    this.raw = raw
  }
}

export type PreviewFailureKind = 'outside' | 'missing' | 'unreadable' | 'toobig' | 'unknown'

/** 服务端败因归类（纯函数·可机判）：越界／不存在／不可读／过大／未知。 */
export function classifyPreviewFailure(raw: string): PreviewFailureKind {
  const s = raw ?? ''
  if (/越界|不在授权|授权目录|authorized|白名单/.test(s)) return 'outside'
  if (/过大|too\s*large|MAX_READ/.test(s)) return 'toobig'
  if (/不存在|不可解析|No such file|os error 2|not found/i.test(s)) return 'missing'
  if (/不可读|打开失败|读取失败|权限|拒绝访问|Access is denied|Permission denied/i.test(s)) {
    return 'unreadable'
  }
  return 'unknown'
}

/** 败因 → i18n 键（界面按 `t(key, { detail: 原文 })` 渲染）。 */
export function previewFailureKey(raw: string): string {
  switch (classifyPreviewFailure(raw)) {
    case 'outside':
      return 'files.previewFailOutside'
    case 'missing':
      return 'files.previewFailMissing'
    case 'unreadable':
      return 'files.previewFailUnreadable'
    case 'toobig':
      return 'files.previewFailTooBig'
    default:
      return 'files.previewFailGeneric'
  }
}

export function createRpcPreviewLoader(call: PreviewRpcCaller): PreviewLoader {
  return async (path: string): Promise<Uint8Array | PreviewPayload | null> => {
    try {
      const resp = await call(path, PREVIEW_MAX_BYTES)
      if (!resp || typeof resp.bytes_b64 !== 'string') return null
      const bytes = base64ToBytes(resp.bytes_b64)
      if (bytes === null) return null
      return {
        bytes,
        totalBytes: typeof resp.size === 'number' ? resp.size : bytes.length,
        truncated: resp.truncated === true,
        binary: resp.binary === true,
      }
    } catch (error) {
      // MSG-3225 ①：败面**上抛原文**（不再静默 null）。null 只留给
      // 「服务端回了载荷但载荷不可用」这一档（诚实降级）。
      const raw = error instanceof Error ? error.message : String(error)
      throw new PreviewLoadError(raw)
    }
  }
}

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
 * MSG-3001 R1 修口·案二（截断点回退字符边界）：为指定编码试减尾部至多
 * maxBack 字节，取最长严格可解前缀——截断劈开多字节字符时回退到合法
 * 字符边界，勿以「劈开的残字节」误判整体编码。
 */
function decodeAtBoundary(
  slice: Uint8Array,
  label: string,
  maxBack: number,
): string | null {
  for (let back = 0; back <= maxBack; back += 1) {
    const end = slice.length - back
    if (end <= 0) return null
    const decoded = strictDecode(slice.subarray(0, end), label)
    if (decoded !== null) return decoded
  }
  return null
}

/**
 * 字节 → 预览解码。顺序：空件 → BOM（UTF-8/UTF-16LE/BE）→ 二进制嗅探 →
 * UTF-8 严格 → GBK 兜底 → UTF-8 宽松（诚实标注）。
 * 截断（> maxBytes）时只解前段并置 truncated（界面明示）。
 */
export function decodePreview(
  bytes: Uint8Array,
  maxBytes: number = PREVIEW_MAX_BYTES,
  hints?: { totalBytes?: number; truncated?: boolean; binary?: boolean },
): PreviewDecode {
  // MSG-3014：daemon 标记优先（服务端已按 max_bytes 截断——bytes 即示段；
  // size 系全件真值——「已示 X/共 Y」按真值示；binary 标记权威直采）
  const totalBytes = hints?.totalBytes ?? bytes.length
  if (bytes.length === 0) {
    return make('empty', '', '', false, totalBytes, 0)
  }
  const truncated = hints?.truncated ?? totalBytes > maxBytes
  const slice = bytes.length > maxBytes ? bytes.subarray(0, maxBytes) : bytes
  const shownBytes = slice.length

  // 1) BOM 优先（显式编码声明——最可靠；截断时同做边界回退）
  if (slice.length >= 3 && slice[0] === 0xef && slice[1] === 0xbb && slice[2] === 0xbf) {
    const body = slice.subarray(3)
    const text = truncated
      ? (decodeAtBoundary(body, 'utf-8', 3) ?? looseDecode(body, 'utf-8'))
      : looseDecode(body, 'utf-8')
    return make('text', text, 'UTF-8 (BOM)', truncated, totalBytes, shownBytes)
  }
  if (slice.length >= 2 && slice[0] === 0xff && slice[1] === 0xfe) {
    const body = slice.subarray(2)
    const text = truncated
      ? (decodeAtBoundary(body, 'utf-16le', 1) ?? looseDecode(body, 'utf-16le'))
      : looseDecode(body, 'utf-16le')
    return make('text', text, 'UTF-16LE (BOM)', truncated, totalBytes, shownBytes)
  }
  if (slice.length >= 2 && slice[0] === 0xfe && slice[1] === 0xff) {
    const body = slice.subarray(2)
    const text = truncated
      ? (decodeAtBoundary(body, 'utf-16be', 1) ?? looseDecode(body, 'utf-16be'))
      : looseDecode(body, 'utf-16be')
    return make('text', text, 'UTF-16BE (BOM)', truncated, totalBytes, shownBytes)
  }

  // 2) 二进制：daemon 标记权威（④——全件判）直采；无标记走本地嗅探
  //    （采样 8KB 兜底——无 BOM 文本不含 NUL）
  if (hints?.binary === true || looksBinary(slice)) {
    return make('binary', '', '', truncated, totalBytes, shownBytes)
  }

  // 3) UTF-8——MSG-3001 R1 修口（案一质量评估＋案二边界回退合一）：
  //    截断时按边界回退（≤3 字节）找最长严格可解前缀——仅尾部残字节者
  //    （回退后严格全解）= UTF-8 被截断，即判 UTF-8；勿因劈开的残字节
  //    落下方 GBK 阶梯（GBK 宽容编码恰可解 → 整屏 mojibake 误标 GBK——
  //    R1 根因）。真非 UTF-8 流在流中段即非法，回退救不回 → 正确下落。
  const utf8 = truncated ? decodeAtBoundary(slice, 'utf-8', 3) : strictDecode(slice, 'utf-8')
  if (utf8 !== null) {
    return make('text', utf8, 'UTF-8', truncated, totalBytes, shownBytes)
  }

  // 4) GBK 兜底（中文旧档常用；Node/浏览器 TextDecoder 均支持）——截断时
  //    同样边界回退 ≤1 字节（GBK 双字节字符劈开面；勿落宽松全替换符）
  const gbk = truncated ? decodeAtBoundary(slice, 'gbk', 1) : strictDecode(slice, 'gbk')
  if (gbk !== null) {
    return make('text', gbk, 'GBK', truncated, totalBytes, shownBytes)
  }

  // 5) 宽松 UTF-8（诚实降级，界面按 UTF-8 展示）
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
  // MSG-3006 R3 守卫：ext 与 Object.prototype 自有键同名时（'constructor'
  // 全小写恰命中原型链），裸查表 `EXT_LANGUAGE[ext]` 取到的是**原生函数**
  // ——下游 `hljs.getLanguage(函数)` 在其内部 `.toLowerCase()` 处 THROW
  // （调用点在 try 外）→ 预览渲染崩。hasOwnProperty 只认自有键：未注册
  // 扩展名一律诚实降级（null → 纯转义文本）。
  return Object.prototype.hasOwnProperty.call(EXT_LANGUAGE, ext)
    ? EXT_LANGUAGE[ext]
    : null
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
  if (!lang) return escaped
  try {
    // MSG-3006 R3 双保险：getLanguage 一并纳入 try——守卫之外的意外 lang 值
    // （未来表结构变更等）亦只降级不崩（渲染韧性钉）
    if (!hljs.getLanguage(lang)) return escaped
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

/** 凭据敏感件判定（安全钉：遮罩/二次确认方示——只判名，不读内容）。
 *  MSG-3001 ③ 补族（试刀窗补遗 P1 谱）：.git-credentials/.pypirc/.envrc/
 *  .docker/config.json/.kube/config/terraform.tfstate；并修误遮——
 *  id_rsa.pub 族**公钥**移出遮罩（私钥仍遮）。 */
const CREDENTIAL_PATTERNS: RegExp[] = [
  /(^|[\\/])\.env(\.[^\\/]*)?$/i,
  /\.(pem|key|pfx|p12|jks|keystore|ppk)$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)(\.[^\\/]*)?$/i,
  /(^|[\\/])\.?(credentials|secrets?)(\.[^\\/]*)?$/i,
  /(^|[\\/])\.(npmrc|netrc|pgpass|htpasswd)$/i,
  /(^|[\\/])\.aws([\\/]|$)/i,
  /(^|[\\/])daemon\.token$/i,
  /(^|[\\/])\.ssh([\\/]|$)/i,
  // MSG-3001 ③ 补族
  /(^|[\\/])\.git-credentials$/i,
  /(^|[\\/])\.pypirc$/i,
  /(^|[\\/])\.envrc$/i,
  /(^|[\\/])\.docker[\\/]config\.json$/i,
  /(^|[\\/])\.kube[\\/]config$/i,
  /(^|[\\/])terraform\.tfstate(\.backup)?$/i,
]

export function isCredentialFile(path: string): boolean {
  // MSG-3001 ③：公钥（*.pub）即公开物——先排除（勿因 .ssh/ 目录级模式等误遮，
  // 深审反例：/home/u/.ssh/id_rsa.pub 被吞）
  if (/\.pub$/i.test(path)) return false
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(path))
}
