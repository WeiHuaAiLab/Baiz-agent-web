// P0 前端同表同步：纯 ASCII 协议信封（半角 XML + 旧方括号）检测/剥离 + 零扰动。
// 与后端 closer-utils::protocol_leak 同一张形态表（两侧判据同源，不得漂移）。
import { describe, expect, it } from 'vitest'
import {
  containsAsciiProtocol,
  containsProtocolLeak,
  stripAsciiProtocolBlocks,
  stripProtocolBlocks,
} from '../src/utils/protocolLeak'

const XML_BLOCK = '<tool_call name="write_file">\n<parameter name="path">x</parameter>\n</tool_call>'

describe('P0 ① 半角 XML 工具调用信封', () => {
  it('containsAsciiProtocol 检出半角 XML 标签', () => {
    expect(containsAsciiProtocol('<tool_call>')).toBe(true)
    expect(containsAsciiProtocol('<function_calls>')).toBe(true)
    expect(containsAsciiProtocol('<invoke name="x">')).toBe(true)
    expect(containsAsciiProtocol('<parameter name="y">')).toBe(true)
  })

  it('stripAsciiProtocolBlocks 剥净半角 XML 整块', () => {
    const { text, stripped } = stripAsciiProtocolBlocks(`前缀${XML_BLOCK}后缀`)
    expect(text).toBe('前缀后缀')
    expect(stripped).toContain('tool_call')
    expect(stripped).toContain('parameter')
  })
})

describe('P0 ② 旧方括号行内标记', () => {
  it('containsAsciiProtocol 检出旧方括号', () => {
    expect(containsAsciiProtocol('[tool:write_file]')).toBe(true)
    expect(containsAsciiProtocol('[工具:写文件]')).toBe(true)
  })

  it('stripAsciiProtocolBlocks 剥净旧方括号段', () => {
    const { text } = stripAsciiProtocolBlocks('正文[tool:write_file]尾')
    expect(text).toBe('正文尾')
  })
})

describe('P0 ③ 窄口径零扰动', () => {
  it('正常文本逐字节不动', () => {
    const normal = '普通文本 <div> 你好 [note: 这不是工具] 价格 < 100 元'
    const { text, stripped } = stripProtocolBlocks(normal)
    expect(text).toBe(normal)
    expect(stripped).toBe('')
    expect(containsProtocolLeak(normal)).toBe(false)
  })
})
