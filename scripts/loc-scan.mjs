// MSG-3417：web 面**行数扫描器**（可复用·零依赖）。
//
// 口径（**明写**，与壳面 `docs/code-health/Q-03-巡扫报告.md`「🔴 红档（≥600 行）」
// 同源，web 面沿用）：
//   - **行数定义**＝`\n` 计数 ＋（末行非空则 +1）——即 `wc -l` 家族口径；
//   - **扫描范围**＝`src/**`，扩展名 `.ts/.vue/.js/.mjs/.cjs`；**排除** `dist/`、`node_modules/`；
//   - **测试件**（`*.test.*`／`*.spec.*`／路径含 `__tests__/`）**单列**，默认不入门禁；
//   - **档位**：≥600 黄档（红档线）｜>1000 红档优先（壳面 Q-03 同口径）。
//
// 用法：
//   node scripts/loc-scan.mjs            # 人读文本（含超线清单／分段计数／测试件分列）
//   node scripts/loc-scan.mjs --json     # 机器读（供 loc-gate.mjs 与测试）
//   node scripts/loc-scan.mjs --split    # 由 scripts/loc-split-plan.json 产拆刀清单（**脚本产出·禁手抄**）
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** 黄档线（壳面 Q-03 同口径：≥600 行入档） */
export const TIER_LINE = 600
/** 红档优先线（>1000 行优先排期） */
export const TIER_RED = 1000
/** 扫描根（相对仓库根） */
export const SRC_DIR = 'src'
export const EXT_RE = /\.(ts|vue|js|mjs|cjs)$/
export const EXCLUDED_DIRS = new Set(['dist', 'node_modules', '.git'])

export function countLines(text) {
  if (text.length === 0) return 0
  const nl = (text.match(/\n/g) ?? []).length
  return text.endsWith('\n') ? nl : nl + 1
}

export function isTestPath(rel) {
  return /(^|\/)(__tests__)\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)
}

export function tierOf(lines) {
  if (lines > TIER_RED) return '红档'
  if (lines >= TIER_LINE) return '黄档'
  return '—'
}

export function listSourceFiles(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue
        walk(path.join(dir, entry.name))
      } else if (EXT_RE.test(entry.name)) {
        out.push(path.join(dir, entry.name))
      }
    }
  }
  const base = path.join(root, SRC_DIR)
  if (fs.existsSync(base)) walk(base)
  return out.sort()
}

/** 扫描 → 逐件 {rel, lines, kind}（rel 为仓库根相对·POSIX 分隔） */
export function scanSources(root = process.cwd()) {
  return listSourceFiles(root).map((abs) => {
    const rel = path.relative(root, abs).split(path.sep).join('/')
    return { rel, lines: countLines(fs.readFileSync(abs, 'utf8')), kind: isTestPath(rel) ? 'test' : 'prod' }
  })
}

/** 汇总：总件数／生产件／测试件／超线清单／分段计数 */
export function summarize(files) {
  const prod = files.filter((f) => f.kind === 'prod')
  const test = files.filter((f) => f.kind === 'test')
  const byDesc = (a, b) => b.lines - a.lines || a.rel.localeCompare(b.rel)
  const sections = new Map()
  for (const f of prod) {
    const seg = f.rel.split('/').slice(0, 2).join('/')
    sections.set(seg, (sections.get(seg) ?? 0) + 1)
  }
  return {
    total: files.length,
    prodCount: prod.length,
    testCount: test.length,
    overLine: prod.filter((f) => f.lines >= TIER_LINE).sort(byDesc),
    testOverLine: test.filter((f) => f.lines >= TIER_LINE).sort(byDesc),
    top: [...prod].sort(byDesc).slice(0, 10),
    sections: [...sections.entries()].sort((a, b) => b[1] - a[1]),
  }
}

export function loadBaseline(root = process.cwd()) {
  const file = path.join(root, 'scripts', 'loc-baseline.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * 门禁判据（四规则·照 MSG-3417 令文）：
 *   ① 基线外生产件 ≥600 ⇒ 红（含新文件）
 *   ② 基线内文件 > 其基线 ⇒ 红
 *   ③ 新文件（不在基线）≥600 ⇒ 红（与①同源，另给 reason 便于点名）
 *   ④ 基线只准减不准增 ⇒ 减小给 advisory（提示下调基线），**不**判红
 * 返回 {ok, violations:[{rel,lines,base,reason}], advisories:[...]}
 */
export function judgeLocGate(files, baseline) {
  const baseMap = baseline?.files ?? {}
  const violations = []
  const advisories = []
  for (const f of files) {
    if (f.kind !== 'prod') continue
    const base = baseMap[f.rel]
    if (base === undefined) {
      if (f.lines >= TIER_LINE) {
        violations.push({
          rel: f.rel,
          lines: f.lines,
          base: null,
          reason: `NEW_FILE_OVER_LINE（基线外新件 ${f.lines} ≥ ${TIER_LINE}）`,
        })
      }
      continue
    }
    if (f.lines > base) {
      violations.push({
        rel: f.rel,
        lines: f.lines,
        base,
        reason: `BASELINE_GREW（${base} → ${f.lines}，超其基线 ${f.lines - base} 行）`,
      })
    } else if (f.lines < base) {
      advisories.push({ rel: f.rel, lines: f.lines, base, reason: `BASELINE_SHRANK（可下调基线 ${base} → ${f.lines}）` })
    }
  }
  // 基线件消失（已删/改名）——提示清理基线，不判红
  for (const rel of Object.keys(baseMap)) {
    if (!files.some((f) => f.rel === rel)) {
      advisories.push({ rel, lines: 0, base: baseMap[rel], reason: 'BASELINE_FILE_GONE（建议从基线移除）' })
    }
  }
  return { ok: violations.length === 0, violations, advisories }
}

/** 由 `scripts/loc-split-plan.json` 产**拆刀清单**（脚本产出·禁手抄） */
export function renderSplitPlan(root, files) {
  const planFile = path.join(root, 'scripts', 'loc-split-plan.json')
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'))
  const lines = new Map(files.map((f) => [f.rel, f.lines]))
  const rows = plan.items.map((item, i) => {
    const n = lines.get(item.file) ?? null
    return `| ${i + 1} | \`${item.file}\` | ${n ?? '（缺）'} | ${item.tier} | ${item.split} | ${item.priority} | ${item.reason} |`
  })
  return [
    '| # | 文件 | 行数 | 档位 | 建议拆法（一句话） | 优先级 | 理由 |',
    '|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n')
}

function main() {
  const root = process.cwd()
  const files = scanSources(root)
  const s = summarize(files)
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ root, files, summary: s }, null, 2) + '\n')
    return
  }
  if (process.argv.includes('--split')) {
    process.stdout.write(renderSplitPlan(root, files) + '\n')
    return
  }
  const out = []
  out.push(`扫描根: ${path.join(root, SRC_DIR)} ｜ 口径: 行数=${'`\\n`'}计数＋末行；≥${TIER_LINE} 黄档；>${TIER_RED} 红档优先`)
  out.push(`总件数=${s.total}（生产 ${s.prodCount}／测试 ${s.testCount}）`)
  out.push('')
  out.push(`超线清单（生产件 ≥${TIER_LINE}）= ${s.overLine.length}`)
  for (const f of s.overLine) out.push(`  ${f.lines}\t${tierOf(f.lines)}\t${f.rel}`)
  out.push('')
  out.push(`测试件 ≥${TIER_LINE} = ${s.testOverLine.length}（单列·不入门禁）`)
  for (const f of s.testOverLine) out.push(`  ${f.lines}\t${f.rel}`)
  out.push('')
  out.push('分段计数（按 src/<段>/）:')
  for (const [seg, n] of s.sections) out.push(`  ${seg}  ${n}`)
  out.push('')
  out.push('Top10（生产件）:')
  for (const f of s.top) out.push(`  ${f.lines}\t${f.rel}`)
  process.stdout.write(out.join('\n') + '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
