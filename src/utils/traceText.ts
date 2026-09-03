// MSG-2413 工具执行行现形：argsPreview（JSON 串）→ 命令/文件/URL 语义提取。
// ToolRow 文件引用与 shell 命令执行行共用——纯函数便于红证单测。

export interface TraceArgs {
  command?: string
  path?: string
  file_path?: string
  url?: string
  [key: string]: unknown
}

export function parseTraceArgs(argsPreview?: string): TraceArgs | null {
  if (!argsPreview) return null
  try {
    const parsed = JSON.parse(argsPreview) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as TraceArgs) : null
  } catch {
    return null
  }
}

/** 文件类工具（fs./code. 族）args 里的路径键（path/file_path 双形兼容） */
export function extractFilePath(argsPreview?: string): string {
  const args = parseTraceArgs(argsPreview)
  if (!args) return ''
  const p = args.path ?? args.file_path
  return typeof p === 'string' ? p : ''
}

/** shell_exec 的命令行（含换行截断单行显示） */
export function extractShellCommand(argsPreview?: string): string {
  const args = parseTraceArgs(argsPreview)
  if (!args) return ''
  const cmd = args.command
  if (typeof cmd !== 'string' || !cmd.trim()) return ''
  const single = cmd.replace(/\s*\n+\s*/g, ' ').trim()
  return single.slice(0, 200)
}

/** web_fetch/web_search 的 url 键 */
export function extractUrl(argsPreview?: string): string {
  const args = parseTraceArgs(argsPreview)
  if (!args) return ''
  const url = args.url
  return typeof url === 'string' ? url : ''
}
