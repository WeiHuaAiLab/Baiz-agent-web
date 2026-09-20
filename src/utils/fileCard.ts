// 文件卡片分类：按后缀归一为「图标配色 / 可运行 / 高亮语言」三件套。
// ToolRow 在 path 命中预览型扩展时改用 FileCard 渲染；其他扩展保留原 file-ref 链接。
//
// 故意不全量枚举——未命中即非预览型，行为零侵入。
//
// label  用作卡片图标里的类型短名（HTML / JS / Vue…），不是 MIME。
// color  用于 SVG 折页图标与右上 type 标签的背景色（贴近各语言生态标准色）。
// runnable 仅 HTML/HTM/SVG 标 true——这些类型有「拉到浏览器跑」的语义。
// language 是 highlight.js 可消费的语言标识；当前面板未启用高亮，仅作未来拓展锚点。

export interface FileCardKind {
  /** 卡片类型短名（HTML / JS / Vue / Rust…） */
  label: string
  /** 后缀（小写，含点） */
  ext: string
  /** 图标主色——SVG 与 type 标签背景共用 */
  color: string
  /** 是否可「运行」（HTML/SVG：拉新窗口预览；其他保持纯查看） */
  runnable: boolean
  /** highlight.js 语言标识（占位，当前未启用高亮） */
  language: string
}

// 按扩展名（小写、含点）归一。色值取自各语言/框架的官方/通用标识。
const KIND_MAP: Record<string, FileCardKind> = {
  // 浏览器可跑
  '.html':  { label: 'HTML', ext: 'html',  color: '#e34c26', runnable: true,  language: 'xml' },
  '.htm':   { label: 'HTML', ext: 'htm',   color: '#e34c26', runnable: true,  language: 'xml' },
  '.svg':   { label: 'SVG',  ext: 'svg',   color: '#ffb13b', runnable: true,  language: 'xml' },
  // JS 族
  '.js':    { label: 'JS',   ext: 'js',    color: '#d6c63b', runnable: false, language: 'javascript' },
  '.mjs':   { label: 'JS',   ext: 'mjs',   color: '#d6c63b', runnable: false, language: 'javascript' },
  '.cjs':   { label: 'JS',   ext: 'cjs',   color: '#d6c63b', runnable: false, language: 'javascript' },
  '.jsx':   { label: 'JSX',  ext: 'jsx',   color: '#61dafb', runnable: false, language: 'javascript' },
  '.ts':    { label: 'TS',   ext: 'ts',    color: '#3178c6', runnable: false, language: 'typescript' },
  '.tsx':   { label: 'TSX',  ext: 'tsx',   color: '#3178c6', runnable: false, language: 'typescript' },
  // 样式
  '.css':   { label: 'CSS',  ext: 'css',   color: '#1572b6', runnable: false, language: 'css' },
  '.scss':  { label: 'SCSS', ext: 'scss',  color: '#c6538c', runnable: false, language: 'css' },
  '.less':  { label: 'LESS', ext: 'less',  color: '#1d365d', runnable: false, language: 'css' },
  // 框架单文件组件
  '.vue':   { label: 'Vue',  ext: 'vue',   color: '#42b883', runnable: false, language: 'xml' },
  '.svelte':{ label: 'Svelte', ext: 'svelte', color: '#ff3e00', runnable: false, language: 'xml' },
  // 数据 / 文档
  '.json':  { label: 'JSON', ext: 'json',  color: '#8d99b6', runnable: false, language: 'json' },
  '.md':    { label: 'MD',   ext: 'md',    color: '#083fa1', runnable: false, language: 'markdown' },
  '.xml':   { label: 'XML',  ext: 'xml',   color: '#8d99b6', runnable: false, language: 'xml' },
  '.txt':   { label: 'TXT',  ext: 'txt',   color: '#8d99b6', runnable: false, language: 'plaintext' },
  '.yaml':  { label: 'YAML', ext: 'yaml',  color: '#cb171e', runnable: false, language: 'yaml' },
  '.yml':   { label: 'YAML', ext: 'yml',   color: '#cb171e', runnable: false, language: 'yaml' },
  // 其他常见源码
  '.rs':    { label: 'Rust', ext: 'rs',    color: '#ce422b', runnable: false, language: 'rust' },
  '.py':    { label: 'Py',   ext: 'py',    color: '#3572a5', runnable: false, language: 'python' },
  '.go':    { label: 'Go',   ext: 'go',    color: '#00add8', runnable: false, language: 'go' },
  '.java':  { label: 'Java', ext: 'java',  color: '#b07219', runnable: false, language: 'java' },
}

/** 取 path 的扩展（小写、含点）；无扩展或隐藏文件（".gitignore"）返回 '' */
function extensionOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const basename = slash === -1 ? path : path.slice(slash + 1)
  const dot = basename.lastIndexOf('.')
  // dot > 0 是为了排除 ".gitignore" 这种「隐藏文件」被误判为扩展 ".gitignore"
  return dot > 0 ? basename.slice(dot).toLowerCase() : ''
}

/** 命中预览型则返回 FileCardKind；否则 null（ToolRow 走原 file-ref） */
export function classifyFile(path: string): FileCardKind | null {
  const ext = extensionOf(path)
  return ext ? KIND_MAP[ext] ?? null : null
}

/** 取 basename（同时兼容 / 与 \），给 FileCard 标题行展示用 */
export function basenameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash === -1 ? path : path.slice(slash + 1)
}
