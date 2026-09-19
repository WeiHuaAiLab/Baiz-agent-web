// 审批卡人话渲染（前端协作标准 v1.0 §C B1/B2）：args_preview 翻成人话，
// 卡面禁裸 JSON、禁内部术语（ToolLoop 之类）；工具名一律走中文俗称。
//
// 本文件同时是「工具中文名」的唯一真源——stores/message.ts 的人话字幕
// 从这里取表，避免两处各存一份走偏。

/** 工具名 → 中文俗称（卡面与字幕共用，说人话不说英文） */
export const TOOL_LABELS_ZH: Record<string, string> = {
  shell_exec: '命令',
  run_command: '命令',
  exec: '命令',
  cargo_test: '测试',
  cargo_build: '编译',
  apply_patch: '改代码',
  code_edit: '改代码',
  edit_file: '改代码',
  grep_files: '搜代码',
  search_files: '搜代码',
  read_file: '读文件',
  fs_read: '读文件',
  list_dir: '看目录',
  ls: '看目录',
  write_file: '写文件',
  fs_write: '写文件',
  delete_file: '删文件',
  rm: '删文件',
  web_fetch: '抓网页',
  web_search: '搜索',
  git_commit: '提交代码',
  git_diff: '看改动',
  wechat_read: '读微信',
  classify_customers: '客户分级',
  crm_push: '推给 CRM',
}

/** 工具名 → 卡面动词短语（unknown 工具退中文名本身，不裸露内部标识） */
export function toolLabel(toolName?: string): string {
  if (!toolName) return '未命名操作'
  return TOOL_LABELS_ZH[toolName] ?? toolName
}

/** 档位：high / medium / low / unknown——取不到就是「未知」，禁默认 medium */
export type RiskLevel = 'high' | 'medium' | 'low' | 'unknown'

export function normalizeRisk(risk?: string | null): RiskLevel {
  const value = (risk ?? '').toString().trim().toLowerCase()
  if (value === 'high') return 'high'
  if (value === 'medium') return 'medium'
  if (value === 'low') return 'low'
  return 'unknown'
}

/** 后端档位确实到位（B8 判据：界面上永不出现猜出来的档位） */
export function isRiskKnown(risk?: string | null): boolean {
  return normalizeRisk(risk) !== 'unknown'
}

const KEY_LABELS: Record<string, string> = {
  path: '路径',
  file: '文件',
  file_path: '文件',
  filepath: '文件',
  target: '目标',
  dir: '目录',
  cwd: '目录',
  command: '命令',
  cmd: '命令',
  script: '脚本',
  q: '关键词',
  query: '关键词',
  pattern: '关键词',
  keyword: '关键词',
  url: '网址',
  range: '范围',
  scope: '范围',
  message: '说明',
  op: '动作',
  action: '动作',
  content: '内容',
  text: '文本',
  args: '参数',
  timeout: '超时',
  recursive: '递归',
}

const RANGE_LABELS: Record<string, string> = {
  today: '今天',
  yesterday: '昨天',
  week: '本周',
  this_week: '本周',
  month: '本月',
  this_month: '本月',
  all: '全部',
}

/** 兜底净化：去花括号/方括号/引号，压平空白——保证卡面不出现裸 JSON 形 */
function sanitize(value: string): string {
  return value
    .replace(/[{}\[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return sanitize(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return sanitize(JSON.stringify(value))
  } catch {
    return ''
  }
}

function pick(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const text = valueText(args[key])
    if (text) return text
  }
  return ''
}

function tryParseObject(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith('{') && !raw.startsWith('[')) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    if (Array.isArray(parsed)) return { args: parsed }
  } catch {
    /* 落兜底净化径 */
  }
  return null
}

/** 兜底人话：键值对逐个翻中文名，逗号并排——终不出现 JSON 形 */
function fallbackSummary(label: string, args: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(args)) {
    const text = valueText(value)
    if (!text) continue
    parts.push(`${KEY_LABELS[key] ?? sanitize(key)}：${text}`)
    if (parts.length >= 4) break
  }
  if (parts.length === 0) return `执行「${label}」`
  return `${label}（${parts.join('，')}）`
}

/**
 * 卡面人话摘要（B2 判据：不出现 `{`/`[` 开头的原始 JSON、不出现内部术语）。
 * 入参为 daemon 帧的 `tool_name` ＋ `args_preview`（≤200 字）。
 */
export function humanizeArgs(toolName?: string, argsPreview?: string): string {
  const label = toolLabel(toolName)
  const raw = (argsPreview ?? '').trim()
  if (!raw) return `执行「${label}」`

  const args = tryParseObject(raw)
  if (!args) {
    // 非 JSON（已是人话或裸串）：净化后直出，保证不落 JSON 形
    const text = sanitize(raw)
    return text ? `${label}：${text}` : `执行「${label}」`
  }

  const path = pick(args, ['path', 'file', 'file_path', 'filepath', 'target'])
  const command = pick(args, ['command', 'cmd', 'script', 'shell'])
  const pattern = pick(args, ['pattern', 'q', 'query', 'keyword'])
  const url = pick(args, ['url', 'endpoint'])
  const range = pick(args, ['range', 'scope'])
  const action = pick(args, ['op', 'action'])

  switch (toolName) {
    case 'shell_exec':
    case 'run_command':
    case 'exec':
      return command ? `运行命令：${command}` : fallbackSummary(label, args)
    case 'read_file':
    case 'fs_read':
      return path ? `读取文件：${path}` : fallbackSummary(label, args)
    case 'write_file':
    case 'fs_write':
      return path ? `写入文件：${path}` : fallbackSummary(label, args)
    case 'delete_file':
    case 'rm':
      return path ? `删除文件：${path}` : fallbackSummary(label, args)
    case 'apply_patch':
    case 'code_edit':
    case 'edit_file':
      if (path) return action ? `修改文件：${path}（${action}）` : `修改文件：${path}`
      return fallbackSummary(label, args)
    case 'grep_files':
    case 'search_files':
      if (pattern) return path ? `在 ${path} 里搜索：${pattern}` : `搜索代码：${pattern}`
      return fallbackSummary(label, args)
    case 'list_dir':
    case 'ls':
      return path ? `查看目录：${path}` : fallbackSummary(label, args)
    case 'web_fetch':
      return url ? `抓取网页：${url}` : fallbackSummary(label, args)
    case 'web_search':
      return pattern ? `联网搜索：${pattern}` : fallbackSummary(label, args)
    case 'classify_customers': {
      const when = range ? (RANGE_LABELS[range.toLowerCase()] ?? sanitize(range)) : ''
      return when ? `整理${when}的客户并分级` : '整理客户数据并分级'
    }
    case 'crm_push':
      return path ? `推送到 CRM：${path}` : '把整理结果推送到 CRM'
    case 'git_commit': {
      const message = pick(args, ['message', 'msg'])
      return message ? `提交改动：${message}` : '提交当前改动'
    }
    case 'git_diff':
      return path ? `查看改动：${path}` : '查看当前改动'
    default:
      return fallbackSummary(label, args)
  }
}
