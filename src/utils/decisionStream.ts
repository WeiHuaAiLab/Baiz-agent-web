// MSG-3216 P0（施工11号组）：内部决策载荷分流器——决策 JSON 永不进消息正文。
//
// 真机证据（谋谋窗《截图取证-1.0.18真机-20260920-2015》§二.1）：消息正文被灌入
// 原始决策 JSON 原文：
//   {"tool_call": {"tool": "read_file", "arguments": {...}}, "exec_plan": null,
//    "plan_updates": [], "claims_done": false, "result_text": ...}
//
// 链路（daemon 侧已定位，本件只读取证）：
//   crates/agent-loop/src/programming/tool_loop/mod.rs:326-331
//     StreamEvent::Token(d) -> content.push_str + decision_tx.try_send(DecisionEvent::Text)
//   crates/daemon/src/sse/toolloop_entry.rs:732-744
//     DecisionEvent::Text{delta} -> SseEvent::Token{token: delta}
//   前端 src/stores/message.ts onToken -> run.text -> utils/displayItems 投影为正文
//   ⇒ 决策 JSON 与正文**同一条 token 路**，daemon 侧零分流（comments 断言
//   "决策 JSON 径 tools:None 不产生"已被真机证伪）。
//
// 本模块在**前端收帧层**兜底（fail-closed）：命中判据的决策 JSON 一律不进正文，
// 改道受控折叠区（RunState.decision，默认收起）。
//
// 判据（机械，可复现）：自 `{` 起扫到**配平**的 JSON 对象（收流未闭则整段持留），
// 其内出现决策族键任一 ⇒ 判为内部载荷。键表取自 daemon 决策 schema
// （crates/agent-loop/src/programming/tool_loop/types.rs 与 tests_d/f 真例）。
//
// 不做的事（败面照录·留债 DEBT-3216-B）：模型在决策 JSON **之前**写的内省散文
// （真机 1000+ 行）与正常回答**同形**，前端无机械判据——本层不猜（猜即伪修复，
// 且会误吞真答案）。须 daemon 侧补帧型判别（决策轮 Text → trace 型帧），另立令。

/** 决策 JSON 顶层键（命中任一 ⇒ 内部载荷，非人话） */
const DECISION_KEYS: ReadonlySet<string> = new Set([
  'tool_call',
  'exec_plan',
  'plan_updates',
  'claims_done',
  'result_text',
  'direct_answer',
  'ask_user',
])

/** 候选区上限：自 `{` 起一直未配平且未见决策键 ⇒ 判为普通正文（防正文卡流） */
export const DECISION_CANDIDATE_LIMIT = 4096

const KEY_PATTERN = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g

/** 分流结果：body 可进正文；internal 只进受控折叠区 */
export interface DecisionSplit {
  body: string
  internal: string
}

export interface DecisionStreamFilter {
  /** 喂入一个 token 增量，返回本次的正文段与内部段 */
  push(delta: string): DecisionSplit
  /** 收流（done/stop/终态）时落定未决候选区 */
  flush(): DecisionSplit
}

/**
 * 自 `{` 起扫配平闭合下标（字符串与转义感知；对象/数组混算）。
 * 未配平 ⇒ -1（调用方持留待下一片）。
 */
export function balancedObjectEnd(text: string): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') {
      depth += 1
      continue
    }
    if (ch === '}' || ch === ']') {
      if (depth === 0) return -1
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 文本内是否出现决策族键（`"key"` 冒号形态） */
export function hasDecisionKey(text: string): boolean {
  KEY_PATTERN.lastIndex = 0
  let matched = KEY_PATTERN.exec(text)
  while (matched) {
    if (DECISION_KEYS.has(matched[1])) return true
    matched = KEY_PATTERN.exec(text)
  }
  return false
}

/**
 * 逐帧分流器（按 task 一份，勿跨 task 复用）。
 *
 * 状态机：
 * - idle：正文直通；遇 `{` 转 candidate（自 `{` 起持留）
 * - candidate：候选中——见决策键 ⇒ inside（判为内部载荷）；
 *   对象已配平而无决策键 或 超过上限 ⇒ 回落正文；二者皆非 ⇒ 继续持留
 * - inside：决策载荷区——直到配平闭合，整段进 internal；闭合后余文回 idle
 */
export function createDecisionStreamFilter(): DecisionStreamFilter {
  type Mode = 'idle' | 'candidate' | 'inside'
  let mode: Mode = 'idle'
  let held = ''

  function takeIdle(text: string, out: DecisionSplit): void {
    const idx = text.indexOf('{')
    if (idx < 0) {
      out.body += text
      return
    }
    out.body += text.slice(0, idx)
    held = text.slice(idx)
    mode = 'candidate'
    resolveCandidate(out)
  }

  function resolveCandidate(out: DecisionSplit): void {
    const end = balancedObjectEnd(held)
    const scope = end >= 0 ? held.slice(0, end + 1) : held
    if (hasDecisionKey(scope)) {
      mode = 'inside'
      consumeInside(out)
      return
    }
    if (end >= 0 || held.length > DECISION_CANDIDATE_LIMIT) {
      out.body += held
      held = ''
      mode = 'idle'
    }
  }

  function consumeInside(out: DecisionSplit): void {
    const end = balancedObjectEnd(held)
    if (end < 0) return
    out.internal += held.slice(0, end + 1)
    const rest = held.slice(end + 1)
    held = ''
    mode = 'idle'
    if (rest) takeIdle(rest, out)
  }

  function push(delta: string): DecisionSplit {
    const out: DecisionSplit = { body: '', internal: '' }
    if (!delta) return out
    if (mode === 'candidate') {
      held += delta
      resolveCandidate(out)
      return out
    }
    if (mode === 'inside') {
      held += delta
      consumeInside(out)
      return out
    }
    takeIdle(delta, out)
    return out
  }

  function flush(): DecisionSplit {
    const out: DecisionSplit = { body: '', internal: '' }
    if (!held) return out
    if (mode === 'inside') out.internal = held
    else out.body = held
    held = ''
    mode = 'idle'
    return out
  }

  return { push, flush }
}
