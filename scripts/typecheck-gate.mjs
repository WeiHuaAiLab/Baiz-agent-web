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

/**
 * 纯函数·可机判：净增判定 ＋ **"零错但基线非零"反空跑闸**。
 *
 * 为什么要有第二道闸：本门禁的头号病灶就是"命令空跑 ⇒ 0 条错"。若只按"净增 ≤ 0"
 * 判，则任何让 tsc 什么都不查的改动（清空 `include`／换回裸 `--noEmit`／`|| true`）
 * 都会**看似大功告成**（DELTA 竟为负）⇒ 必须把"0 条错"钉成**可疑**：
 * 存量真有 11 条时，**0 条只能是没跑**；等存量真被修完，须把 `TS_BASELINE` 一起降到 0
 * （基线**只可下调**），那时 0 才合法。
 */
export function judge(errors, baseline = TS_BASELINE) {
  if (errors === 0 && baseline > 0) {
    return { ok: false, exitCode: 1, reason: 'ZERO_WITH_BASELINE_SUSPECT（疑空跑：存量未清而 0 条错）' }
  }
  if (errors > baseline) {
    return { ok: false, exitCode: 1, reason: 'INCREASED（净增 >0）' }
  }
  return { ok: true, exitCode: 0, reason: 'OK（净增 ≤0 且非可疑 0）' }
}

/**
 * 纯函数·可机判：**空跑面**识别（第三道闸）。
 *
 * 掷变 ⑥ 实测：把 `tsconfig.app.json` 的 `include` 清成 `[]` 后，tsc 只报 **1 条**
 * `TS18003 No inputs were found`，DELTA=−10 ⇒ 若只看"净增"就会**误判 PASS**。
 * ⇒ 凡出现该码（或"无输入面"措辞）一律判 **可疑空跑**，必须 FAIL。
 */
export const SUSPECT_OUTPUT = [/error TS18003\b/, /No inputs were found/i]

export function looksLikeNoInput(output) {
  return SUSPECT_OUTPUT.some((re) => re.test(output))
}

function main() {
  const res = spawnSync('npx', ['vue-tsc', ...TYPECHECK_ARGS], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`
  const errors = countTypeErrors(output)
  const verdict = looksLikeNoInput(output)
    ? { ok: false, exitCode: 1, reason: 'NO_INPUTS_SUSPECT（检查面为空：TS18003／No inputs）' }
    : judge(errors)

  // 绝对数照印（不洗绿）：11 条存量在册，不假装"0 错"
  process.stdout.write(output)
  process.stdout.write(
    `\n[typecheck-gate] 命令: npx vue-tsc ${TYPECHECK_ARGS.join(' ')}\n` +
      `[typecheck-gate] TS_ERRORS=${errors} BASELINE=${TS_BASELINE} DELTA=${errors - TS_BASELINE}\n` +
      `[typecheck-gate] 判据: 净增 0 ⇒ ${verdict.ok ? 'PASS' : 'FAIL'}｜reason=${verdict.reason}（tsc exit=${res.status}）\n`,
  )
  process.exit(verdict.exitCode)
}

// 仅在被**直接执行**时跑（被测试 import 时不跑）
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
