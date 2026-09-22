// MSG-3417：web 面**行数闸**（与 `scripts/typecheck-gate.mjs` 同一脚本族：真跑＋绝对数照印＋净增判据）。
//
// 判据（四规则·逐条见 `judgeLocGate`）：
//   ① 基线外生产件 ≥600 ⇒ 红  ② 基线内 > 其基线 ⇒ 红  ③ 新文件 ≥600 ⇒ 红
//   ④ 基线只准减不准增（减小给 advisory，不判红）
// 用法：node scripts/loc-gate.mjs   （等价 npm run loc:gate）
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { judgeLocGate, loadBaseline, scanSources, summarize, TIER_LINE } from './loc-scan.mjs'

export function main(root = process.cwd()) {
  const files = scanSources(root)
  const baseline = loadBaseline(root)
  const verdict = judgeLocGate(files, baseline)
  const s = summarize(files)

  const out = []
  out.push(`[loc-gate] 范围=${path.join(root, 'src')}/**（排除 dist/node_modules）；行数口径=${baseline._convention}`)
  out.push(`[loc-gate] 件数：总 ${s.total}（生产 ${s.prodCount}／测试 ${s.testCount}）；生产件 ≥${TIER_LINE} = ${s.overLine.length}`)
  for (const f of s.overLine) out.push(`[loc-gate]   超线：${f.lines} 行  ${f.rel}`)
  for (const v of verdict.violations) out.push(`[loc-gate] 🔴 ${v.reason}  ${v.rel}`)
  for (const a of verdict.advisories) out.push(`[loc-gate] ⚠️ ${a.reason}  ${a.rel}`)
  out.push(
    `[loc-gate] 判据：基线外≥${TIER_LINE} 红／基线内超基线红／新件≥${TIER_LINE} 红 ⇒ ${verdict.ok ? 'PASS' : 'FAIL'}`,
  )
  process.stdout.write(out.join('\n') + '\n')
  return verdict.ok ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
