// MSG-3187 · 档一「HTML 静态预览」——**安全三条的唯一实现点**（纯函数·可直测）。
//
// 三条钉（决定件《HTML预览-两档落点与安全三条》§三）：
//   1) **沙箱化**：预览文档一律走沙箱 iframe（`sandbox` **无任何 `allow-*` 特权**、
//      不给 Tauri API／IPC／daemon 通道）——本模块只产 HTML 串，**从不接触桥/daemon**；
//   2) **脚本开关**：CSP 内 `script-src` 开／关；无论开关，**高风险面一律拦**——
//      `connect-src 'none'`（跨域 fetch/XHR/WS）、`frame-src 'none'`、`form-action 'none'`、
//      `default-src 'none'`（外部脚本/样式/图片一律不载）；
//   3) **范围限定**：本模块**不读盘**——字节来自既有 `file.preview`（只读·路径闸，
//      越界 9 变体全拒），故"只许授权目录内"由既有闸保证，此处不新开径。

/** 是否 HTML 件（`.html`／`.htm`，大小写不敏感） */
export function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test((path ?? '').trim())
}

export interface PreviewDocOptions {
  /** 沙箱内脚本开关（默认开——否则现代页面全废） */
  scripts: boolean
}

/**
 * 预览文档 CSP：默认全禁，只放行**内联**样式与（可选）**内联**脚本＋`data:`/`blob:`
 * 图片／媒体。跨域 fetch 与外部资源、子框、表单提交**一律拦**。
 */
export function previewCsp(scripts: boolean): string {
  return [
    "default-src 'none'",
    'img-src data: blob:',
    'media-src data: blob:',
    'font-src data:',
    "style-src 'unsafe-inline'",
    scripts ? "script-src 'unsafe-inline'" : "script-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

/** `<meta CSP>` 须尽量靠前（在任何脚本/内容之前才生效）——有 `<head>` 插其后，否则前置 */
function injectCsp(html: string, meta: string): string {
  const head = /<head[^>]*>/i.exec(html)
  if (head) {
    const at = head.index + head[0].length
    return `${html.slice(0, at)}\n${meta}${html.slice(at)}`
  }
  return `${meta}\n${html}`
}

/** 卡内 iframe 的 `srcdoc`：CSP ＋ 原文（原文按不可信输入对待——沙箱承载） */
export function buildPreviewDocument(html: string, options: PreviewDocOptions): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${previewCsp(options.scripts)}">`
  return injectCsp(html, meta)
}

/** 预览 iframe 的 sandbox 值：**只有** `allow-scripts`（可关）——无 allow-same-origin
 *  ⇒ 文档落**不透明源**：摸不到父窗、读不到存储、拿不到 IPC／Tauri 全局。 */
export function previewSandbox(options: PreviewDocOptions): string {
  return options.scripts ? 'allow-scripts' : ''
}

function escapeSrcdocAttr(value: string): string {
  // 作 HTML 属性值内嵌：& " < > 全转义（最保守形态）
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 「在浏览器打开」的新窗文档：**同策略沙箱包装**——外层是新窗里的整页，
 * 内层仍是同一 `sandbox`＋同一 CSP 的 iframe（不给 Tauri API／IPC／daemon 通道）。
 * （全能力真运行属档二＝2.0 第 41 项，本档不做。）
 */
export function buildExternalPreviewDocument(html: string, options: PreviewDocOptions): string {
  const inner = escapeSrcdocAttr(buildPreviewDocument(html, options))
  const sandbox = previewSandbox(options)
  return [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}</style>',
    `<iframe sandbox="${sandbox}" srcdoc="${inner}"></iframe>`,
  ].join('\n')
}
