import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/markdown/renderer'

describe('XSS 防线（Markdown 渲染）', () => {
  it('script 标签被转义', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script')
  })

  it('事件属性被剥离', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
  })

  it('javascript: 链接不产出 href', () => {
    const html = renderMarkdown('[x](javascript:alert(1))')
    expect(html.toLowerCase()).not.toContain('href="javascript:')
  })

  it('javascript: 图片不产出 src', () => {
    const html = renderMarkdown('![x](javascript:alert(1))')
    expect(html.toLowerCase()).not.toContain('src="javascript:')
  })

  it('代码块内注入被转义', () => {
    const html = renderMarkdown('```html\n<img src=x onerror=alert(1)>\n```')
    expect(html).toContain('code-block')
    expect(html.toLowerCase()).not.toContain('onerror=alert')
  })

  it('代码围栏语言注入被转义', () => {
    const html = renderMarkdown('```<img src=x onerror=alert(1)>\ncode\n```')
    expect(html.toLowerCase()).not.toContain('onerror')
  })

  it('嵌套标签与属性双写被消毒', () => {
    const html = renderMarkdown('<a href="x" onclick="x">a</a> <b onmouseover="x">b</b>')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('<b ')
  })
})
