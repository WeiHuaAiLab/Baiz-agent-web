// MSG-3381：web 面**类型门禁**（真跑法·净增 0 判据）。
//
// 病灶（19号组 MSG-3376 首先逮到·本窗复现）：`npx vue-tsc --noEmit` 是**空跑**——
// 根 `tsconfig.json` 是 **solution 式**（`"files": []` + `references`），不带 `-p/-b`
// 时 tsc 只加载"零文件"的根配置，**什么都不查** ⇒ **注入类型错误仍 EXIT 0**（假绿）。
//
// 真跑法：`npx vue-tsc -p tsconfig.app.json --noEmit`
//   —— 该配置 `include: ["src/**/*.ts","src/**/*.d.ts","src/**/*.vue"]`；
//      注入一条错误 ⇒ 立刻报 `error TS` 且 EXIT=2（见 MSG-3381 红证 ①/②）。
//
// 判据：**净增 0**——存量基线 **11 条**（`TS_BASELINE`）；`error TS` 计数 > 基线 ⇒
// EXIT 1（新增即挡）；≤ 基线 ⇒ EXIT 0（存量在册·不假装全绿，绝对数照印）。
//
// 用法：node scripts/typecheck-gate.mjs          （等价 npm run typecheck:gate）
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import process from 'node:process'

/** 存量基线（MSG-3381 实测；随存量修复**只可下调**） */
export const TS_BASELINE = 11

/** 真命令（**勿改成不带 -p 的 bare 形式**——那就是空跑） */
export const TYPECHECK_ARGS = ['-p', 'tsconfig.app.json', '--noEmit']

/** 纯函数·可机判：从 tsc 输出里数 `error TS` 行 */
export function countTypeErrors(output) {
  return (output.match(/error TS\d+/g) ?? []).length
}

/** 纯函数·可机判：净增判定 */
export function judge(delta, baseline = TS_BASELINE) {
  return delta > baseline ? { ok: false, exitCode: 1 } : { ok: true, exitCode: 0 }
}

function main() {
  const res = spawnSync('npx', ['vue-tsc', ...TYPECHECK_ARGS], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`
  const errors = countTypeErrors(output)
  const verdict = judge(errors)

  // 绝对数照印（不洗绿）：11 条存量在册，不假装"0 错"
  process.stdout.write(output)
  process.stdout.write(
    `\n[typecheck-gate] 命令: npx vue-tsc ${TYPECHECK_ARGS.join(' ')}\n` +
      `[typecheck-gate] TS_ERRORS=${errors} BASELINE=${TS_BASELINE} DELTA=${errors - TS_BASELINE}\n` +
      `[typecheck-gate] 判据: 净增 0 ⇒ ${verdict.ok ? 'PASS' : 'FAIL'}（tsc exit=${res.status}）\n`,
  )
  process.exit(verdict.exitCode)
}

// 仅在被**直接执行**时跑（被测试 import 时不跑）
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
