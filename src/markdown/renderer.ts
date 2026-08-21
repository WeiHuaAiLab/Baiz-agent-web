// Markdown 渲染管线：markdown-it + highlight.js + DOMPurify 消毒 + 行号代码块。
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'

const CACHE_LIMIT = 500
const renderCache = new Map<string, string>()

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value
      } catch {
        return markdown.utils.escapeHtml(code)
      }
    }
    return markdown.utils.escapeHtml(code)
  },
})

markdown.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const info = token.info ? markdown.utils.unescapeAll(token.info).trim() : ''
  const lang = info.split(/\s+/g)[0] || ''
  // 去掉结尾换行，避免 split 产生幽灵行号
  const code = token.content.replace(/\n$/, '')
  // 按行独立高亮：跨行标签不会被切断，行号与代码行严格对齐
  const lines = code
    .split('\n')
    .map((line, i) => {
      const highlighted =
        lang && hljs.getLanguage(lang)
          ? hljs.highlight(line, { language: lang }).value
          : markdown.utils.escapeHtml(line)
      return `<span class="ln">${i + 1}</span><span class="lc">${highlighted}</span>`
    })
    .join('\n')
  return (
    `<div class="code-block"><div class="code-head">` +
    `<span class="code-lang">${lang ? markdown.utils.escapeHtml(lang) : 'text'}</span>` +
    `<button type="button" class="code-copy" data-code="${encodeURIComponent(code)}">复制</button>` +
    `</div><div class="code-body">${lines}</div></div>`
  )
}

export function renderMarkdown(text: string): string {
  const cached = renderCache.get(text)
  if (cached !== undefined) return cached
  const html = DOMPurify.sanitize(markdown.render(text))
  if (renderCache.size >= CACHE_LIMIT) {
    const oldest = renderCache.keys().next().value
    if (oldest !== undefined) renderCache.delete(oldest)
  }
  renderCache.set(text, html)
  return html
}
