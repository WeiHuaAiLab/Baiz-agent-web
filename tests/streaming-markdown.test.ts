// 流式 Markdown 增量渲染器（src/markdown/streaming.ts）：
// 稳定前缀缓存 + 尾部可变 + 代码围栏 + 表格暂缓提交。
import { describe, expect, it } from 'vitest'
import { StreamingMarkdown } from '../src/markdown/streaming'

describe('StreamingMarkdown：增量渲染', () => {
  it('初始为空，reset 后可复用', () => {
    const sm = new StreamingMarkdown()
    expect(sm.html()).toBe('')
    sm.push('你好\n')
    expect(sm.html()).not.toBe('')
    sm.reset()
    expect(sm.html()).toBe('')
  })

  it('增量分块推进：段落累积，空行到达提交为稳定前缀', () => {
    const sm = new StreamingMarkdown()
    // 第一次增量（半行）：仅进入 lineBuf，尾部可变
    sm.push('你好')
    const partial = sm.html()
    expect(partial).toContain('你好')
    // 第二次增量补齐整行
    sm.push('你好\n')
    expect(sm.html()).toContain('你好')
    // 空行 = 块边界，提交到 stableHtml
    sm.push('\n')
    expect(sm.html()).toContain('<p>你好</p>')
  })

  it('重复 push 相同累计文本幂等，不重复渲染', () => {
    const sm = new StreamingMarkdown()
    sm.push('第一行\n\n')
    const first = sm.html()
    sm.push('第一行\n\n')
    expect(sm.html()).toBe(first)
  })

  it('多个段落：空行分隔，各段独立渲染且稳定前缀保留', () => {
    const sm = new StreamingMarkdown()
    sm.push('第一段\n')
    sm.push('第一段\n\n')
    const stable = sm.html()
    sm.push('第一段\n\n第二段\n')
    sm.push('第一段\n\n第二段\n\n')
    const html = sm.html()
    expect(html).toContain('<p>第一段</p>')
    expect(html).toContain('<p>第二段</p>')
    expect(html.startsWith(stable)).toBe(true)
  })

  it('未闭合代码围栏保持尾部可变，闭合后整体提交', () => {
    const sm = new StreamingMarkdown()
    sm.push('```ts\n')
    sm.push('```ts\nconst a = 1\n')
    const mid = sm.html()
    // 围栏内尚未提交，但内容已可见（尾部可变渲染）
    expect(mid).toContain('code-block')
    expect(mid).toContain('ts')
    sm.push('```ts\nconst a = 1\n```\n')
    const html = sm.html()
    // hljs 语法高亮把 const 包进 hljs-keyword span，代码块整体提交为稳定前缀
    expect(html).toContain('code-block')
    expect(html).toContain('const')
    // 围栏闭合后进入稳定前缀：后续追加不改变已提交部分
    const stable = html
    sm.push('```ts\nconst a = 1\n```\n正文\n')
    sm.push('```ts\nconst a = 1\n```\n正文\n\n')
    expect(sm.html().startsWith(stable)).toBe(true)
  })

  it('表格 holdback：表头 + 分隔行确认后暂缓提交，空行到达提交', () => {
    const sm = new StreamingMarkdown()
    sm.push('| A | B |\n')
    // 仅表头：尚未确认表格，属于普通 pending
    expect(sm.html()).toContain('| A | B |')
    sm.push('| A | B |\n|---|---|\n')
    // 分隔行出现，确认表格，数据行继续累积
    sm.push('| A | B |\n|---|---|\n| 1 | 2 |\n')
    const holdback = sm.html()
    expect(holdback).toContain('<table>')
    expect(holdback).toContain('<td>1</td>')
    // 空行结束表格 → 提交为稳定前缀
    sm.push('| A | B |\n|---|---|\n| 1 | 2 |\n\n')
    expect(sm.html()).toContain('<table>')
    expect(sm.html()).toContain('<td>1</td>')
  })

  it('flushHtml：强制提交未完成的尾部（无换行残余行）', () => {
    const sm = new StreamingMarkdown()
    sm.push('最后一段没有换行')
    const html = sm.flushHtml()
    expect(html).toContain('最后一段没有换行')
    expect(html).toContain('<p>最后一段没有换行</p>')
  })

  it('CRLF 换行归一化为 LF', () => {
    const sm = new StreamingMarkdown()
    sm.push('第一行\r\n\r\n')
    expect(sm.html()).toContain('<p>第一行</p>')
  })
})
