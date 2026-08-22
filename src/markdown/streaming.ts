// 流式 Markdown 增量渲染器：稳定前缀缓存 + 尾部可变 + 代码围栏 + 表格暂缓提交
// 对照 codex tui streaming/render.rs + table_holdback.rs + code_fence.rs 的 Web 适配版
import { renderMarkdown } from './renderer'

const FENCE_RE = /^```/
const TABLE_HEADER_RE = /^\|?\s*[^|]+\|/          // 至少一个单元格分隔
const TABLE_DELIM_RE = /^\|?\s*:?-{2,}:\s*(\|\s*:?-{2,}:\s*)+\|?\s*$/  // |---|---|

export class StreamingMarkdown {
  private pending: string[] = []      // 尾部可变完整行（含 \n）
  private lineBuf = ''               // 不完整残余行（等待下一个增量补齐）
  private stableHtml = ''            // 稳定前缀的缓存渲染结果
  private fenceOpen = false          // 代码围栏是否未闭合
  private tableConfirmed = false     // 已确认表格（表头+分隔行都出现）
  private lastLen = 0                // 上次已消费的源长度

  /** 传入累计文本（与现有调用方 run.text 一致），内部只消费增量部分 */
  push(text: string): void {
    if (text.length <= this.lastLen) return
    const delta = text.slice(this.lastLen)
    this.lastLen = text.length
    this.lineBuf += delta.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // 文书原码为 let idx + while((idx=...) !== -1)；改 while(true)+break 等价形式，
    // 规避 TS 严格模式「变量使用前未赋值」歧义面（vue-tsc --noEmit 全量跑）
    while (true) {
      const idx = this.lineBuf.indexOf('\n')
      if (idx === -1) break
      const line = this.lineBuf.slice(0, idx + 1)
      this.lineBuf = this.lineBuf.slice(idx + 1)
      this.handleLine(line)
    }
  }

  /** 渲染当前全部内容：稳定缓存 + 尾部可变块 + 未补齐残余行 */
  html(): string {
    const tail = this.pending.join('') + this.lineBuf
    if (!tail) return this.stableHtml
    return this.stableHtml + renderMarkdown(tail)
  }

  /** 流结束：强制提交尾部并返回最终 HTML */
  flushHtml(): string {
    this.commitPending()
    return this.html()
  }

  reset(): void {
    this.pending = []
    this.lineBuf = ''
    this.stableHtml = ''
    this.fenceOpen = false
    this.tableConfirmed = false
    this.lastLen = 0
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    const isFenceToggle = FENCE_RE.test(trimmed)

    // 1) 代码围栏
    if (isFenceToggle) {
      this.pending.push(line)
      this.fenceOpen = !this.fenceOpen
      if (!this.fenceOpen) {
        // 围栏闭合：整个代码块提交
        this.commitPending()
      }
      return
    }
    if (this.fenceOpen) {
      this.pending.push(line)
      return
    }

    // 2) 空行 = 块边界
    if (trimmed === '') {
      if (this.tableConfirmed) {
        // 表格结束（表格行不含空行），提交
        this.tableConfirmed = false
        this.commitPending()
      } else if (this.pending.length > 0) {
        // 段落/列表/标题结束
        this.commitPending()
      }
      return
    }

    // 3) 表格检测：上一行是表头 + 本行是分隔行 → 确认表格
    if (this.pending.length === 1 && TABLE_HEADER_RE.test(this.pending[0].trim()) && TABLE_DELIM_RE.test(trimmed)) {
      this.pending.push(line)
      this.tableConfirmed = true
      return
    }
    if (this.tableConfirmed) {
      this.pending.push(line)
      return
    }

    // 4) 普通行：整块保持尾部可变（段落/列表不产生中间断裂），空行到达时统一提交
    this.pending.push(line)
  }

  private commitPending(): void {
    if (this.pending.length === 0) return
    const block = this.pending.join('')
    this.pending = []
    // 稳定前缀以「完整块 + 空行」结尾，避免 markdown-it 跨块粘连段落
    const separator = this.stableHtml === '' ? '' : '\n\n'
    this.stableHtml += separator + renderMarkdown(block)
  }
}
