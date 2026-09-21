// MSG-3266 P0（施工11号组）：**DSML 工具调用语法裸泄漏进正文** —— 收帧层兜底过滤器。
//
// 真机证据（`ZCode-BaizAgent代码能力测试报告-20260921.md` §17-27，会话 68fafbb9）：
// 三回合全部 `round 8/8` 吃满；A（`t-muak2w7e`）尾部泄漏 DSML 调用块（412 字残文）；
// B（`t-muakdbjt`）**整条回复＝纯 DSML 协议文本，零人话**；C（`t-muakhnpo`）8/8 截断。
// 形态＝**全角竖线包裹的协议标记**（`＜｜｜DSML｜｜invoke…＞` / `＜/｜｜DSML｜｜invoke＞`）。
//
// 定位（只读复核·本窗）：
//   ① daemon **无 DSML 解析器**（`rg -i dsml crates` 零命中）⇒ 该文本只能当 content 推流；
//   ② daemon 唯一信封剥离器 `strip_tool_markers`（crates/daemon/src/sse/toolloop_entry.rs:361-389）
//      判据表＝`[tool:`／`[工具:`／`<tool_call>…`／`<tool_calls>…`——**纯 ASCII 形态**，
//      对全角 DSML **零命中**（且 :363-370「零标记⇒逐字节原样返回」正是它溜过去的门）；
//   ③ 前端唯一分流器 `decisionStream.ts` 判据表＝决策 JSON 键（tool_call/exec_plan/…），
//      **不含 DSML**；④ 直聊/Executor 径无 native tool_calls ⇒ DSML 直进 `run.text` → 正文。
//
// 本模块＝**前端收帧层 fail-closed 兜底**（与 MSG-3216 决策 JSON 分流同层、**另一类载荷**）：
//   未解析的协议块**不得进正文**；被过滤的原文**零丢证**——转入受控折叠区（`run.decision`）。

/** 全角竖线包裹的 DSML 标记前缀（真机形态）。裸标记与 invoke 块共用此前缀。 */
export const DSML_MARKER = '｜｜DSML｜｜'

/** 块起始（真机为 `＜` 全角尖括号；一并容错 ASCII `<`） */
const OPEN_RE = /[＜<]\s*｜｜DSML｜｜/g

/** 常见 DSML 信封标签（invoke / parameter / tool_calls 族；容错可选斜杠与空白） */
const CLOSE_TAGS = [
  'invoke',
  'parameter',
  'tool_call',
  'tool_calls',
  'function_calls',
] as const

export interface ProtocolLeakSplit {
  /** 可进正文的部分（协议块已剥离） */
  body: string
  /** 被剥离的协议原文（零丢证——调用方转受控折叠区） */
  suppressed: string
}

export interface ProtocolLeakFilter {
  push(delta: string): ProtocolLeakSplit
  /** 收流落定：未闭合的协议残块**一律不进正文**（返回在 suppressed 里） */
  flush(): ProtocolLeakSplit
}

/** 文本是否含 DSML 协议标记（快判；供红证与日志用） */
export function containsDsml(text: string): boolean {
  return text.includes(DSML_MARKER)
}

/**
 * 从 `text` 中剥离**完整**的 DSML 信封块（按标签配对；容错属性里的任意引号/中文/换行）。
 * 未闭合块不在此处处理——由状态机持留（防半截泄漏）。
 */
export function stripDsmlBlocks(text: string): { text: string; stripped: string } {
  let out = text
  let stripped = ''
  for (const tag of CLOSE_TAGS) {
    const open = new RegExp(`[＜<]\\s*｜｜DSML｜｜\\s*${tag}\\b`, 'g')
    const close = new RegExp(`[＜<]\\s*/\\s*｜｜DSML｜｜\\s*${tag}\\s*[＞>]`, 'g')
    // 逐段配对剥离：先找 open 起点，再找其后最近的 close 终点
    let guard = 0
    while (guard < 64) {
      guard += 1
      open.lastIndex = 0
      const m = open.exec(out)
      if (!m) break
      close.lastIndex = m.index
      const c = close.exec(out)
      if (!c) break
      const end = c.index + c[0].length
      stripped += out.slice(m.index, end)
      out = out.slice(0, m.index) + out.slice(end)
    }
  }
  // 残留闭标记（配对被吃掉的另一半）**一并剥离**——协议面零残留
  out = out.replace(/[＜<]\s*\/\s*｜｜DSML｜｜\s*[A-Za-z_]*\s*[＞>]/g, (matched) => {
    stripped += matched
    return ''
  })
  return { text: out, stripped }
}

/**
 * 逐帧状态机（按 task 一份）：
 * - idle：正文直通；遇 DSML 起点 ⇒ 转 holding（**自起点整体持留**，绝不半截现形）
 * - holding：持续持留；见闭合标签 ⇒ 整块归 suppressed，余文回 idle；
 *   收流时仍未闭合 ⇒ `flush()` 整段归 suppressed（**宁丢正文不泄协议**）
 */
export function createProtocolLeakFilter(): ProtocolLeakFilter {
  let mode: 'idle' | 'holding' = 'idle'
  let held = ''

  /** 完整标记前缀长度上限（`＜`＋可选 `/`＋`｜｜DSML｜｜`）——尾部短于此长度且含起点的，持留 */
  const MARKER_PREFIX_MAX = 12

  /** 尾部是否有"可能是标记开头"的短残片（`＜`／`＜/`／`＜｜`／`＜｜｜DS…`）⇒ 返回其起点，否则 -1 */
  function potentialMarkerPrefixStart(text: string): number {
    const from = Math.max(0, text.length - MARKER_PREFIX_MAX)
    for (let i = text.length - 1; i >= from; i -= 1) {
      const ch = text[i]
      if (ch !== '＜' && ch !== '<') continue
      const tail = text.slice(i)
      return /^[＜<]\s*\/?\s*｜｜DSML｜｜/.test(tail) ? -1 : i
    }
    return -1
  }

  function takeIdle(text: string, out: ProtocolLeakSplit): void {
    // 起点容错：**开标记与闭标记都算协议面**（`＜｜｜DSML｜｜invoke＞` / `＜/｜｜DSML｜｜invoke＞`）
    // ——只认开标记会让闭标记（或被剥块之后的残留闭标记）漏进正文（首轮红证即此）
    const m = /[＜<]\s*\/?\s*｜｜DSML｜｜/.exec(text)
    if (m) {
      out.body += text.slice(0, m.index)
      held = text.slice(m.index)
      mode = 'holding'
      resolveHolding(out)
      return
    }
    // 帧边界兜底：**半截标记**（如 `＜｜`／`＜｜｜DS`）也不得现形 ⇒ 尾部可疑前缀持留
    const cut = potentialMarkerPrefixStart(text)
    if (cut < 0) {
      out.body += text
      return
    }
    out.body += text.slice(0, cut)
    held = text.slice(cut)
    mode = 'holding'
  }

  function resolveHolding(out: ProtocolLeakSplit): void {
    // 非协议前缀（假阳性）⇒ 回吐正文，勿永久持留
    const isPartialMarker = /^[＜<]\s*(\/)?\s*(｜\s*){0,2}(D\s*)?(S\s*)?(M\s*)?(L\s*)?(｜\s*){0,2}$/.test(held)
    const isFullMarkerStart = /^[＜<]\s*\/?\s*｜｜DSML｜｜/.test(held)
    if (!isFullMarkerStart && !isPartialMarker) {
      out.body += held
      held = ''
      mode = 'idle'
      return
    }
    if (!isFullMarkerStart) return // 仍是半截标记 ⇒ 继续持留
    // 闭合判据：任一 `＜/｜｜DSML｜｜tag＞`
    const close = /[＜<]\s*\/\s*｜｜DSML｜｜\s*[A-Za-z_]*\s*[＞>]/.exec(held)
    if (!close) return // 仍持留（不得半截现形）
    const end = close.index + close[0].length
    out.suppressed += held.slice(0, end)
    const rest = held.slice(end)
    held = ''
    mode = 'idle'
    if (rest) takeIdle(rest, out)
  }

  function push(delta: string): ProtocolLeakSplit {
    const out: ProtocolLeakSplit = { body: '', suppressed: '' }
    if (!delta) return out
    if (mode === 'holding') {
      held += delta
      resolveHolding(out)
      return out
    }
    takeIdle(delta, out)
    return out
  }

  function flush(): ProtocolLeakSplit {
    const out: ProtocolLeakSplit = { body: '', suppressed: '' }
    if (!held) return out
    // 未闭合残块：**不进正文**（宁丢正文不泄协议），原文零丢证归 suppressed
    out.suppressed = held
    held = ''
    mode = 'idle'
    return out
  }

  return { push, flush }
}
