import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/markdown/renderer'

describe('markdown renderer', () => {
  it('代码块渲染：单框 + 语言徽章 + 行号', () => {
    const html = renderMarkdown('```rust\nfn main() {}\n```')
    expect(html).toContain('code-block')
    expect(html).toContain('code-lang')
    expect(html).toContain('rust')
    expect(html.match(/class="ln"/g) ?? []).toHaveLength(1)
  })

  it('代码块无幽灵行号：3 行源码 = 3 个行号', () => {
    const html = renderMarkdown('```js\nconst a = 1\nconst b = 2\nconst c = 3\n```')
    expect(html.match(/class="ln"/g) ?? []).toHaveLength(3)
  })

  it('XSS 防线：script 被转义、javascript: 链接不产出 href', () => {
    const html = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1))')
    expect(html).not.toContain('<script')
    expect(html.toLowerCase()).not.toContain('href="javascript:')
  })

  it('表格渲染为 table', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<table')
  })

  it('渲染缓存：同文本命中缓存（避免重复解析）', () => {
    const first = renderMarkdown('# 缓存标题\n\n正文内容')
    const second = renderMarkdown('# 缓存标题\n\n正文内容')
    expect(second).toBe(first)
  })
})
