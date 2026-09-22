// MSG-3381 红证：类型门禁**必为真跑法**，且判据＝净增 0（对照 11 条基线）。
//
// 本文件钉三件（任一件被"改松"即红）：
// ① 真命令形状含 `-p tsconfig.app.json`（**裸 `--noEmit` 是空跑**——掷变 ⑤ 实证）；
// ② 基线＝11（存量在册数，随修复只可下调）；
// ③ 判据函数：>基线 ⇒ FAIL／≤基线 ⇒ PASS（且脚本照印绝对数，不洗绿）。
import { describe, expect, it } from 'vitest'
import {
  TS_BASELINE,
  TYPECHECK_ARGS,
  countTypeErrors,
  judge,
  looksLikeNoInput,
} from '../scripts/typecheck-gate.mjs'

describe('MSG-3381 类型门禁口径', () => {
  it('① 真命令必须带 -p tsconfig.app.json（裸 --noEmit 是空跑）', () => {
    expect(TYPECHECK_ARGS).toContain('-p')
    expect(TYPECHECK_ARGS).toContain('tsconfig.app.json')
    expect(TYPECHECK_ARGS).toContain('--noEmit')
    expect(TYPECHECK_ARGS).not.toEqual(['--noEmit'])
  })

  it('② 存量基线＝11（19号组 MSG-3376 与本仓 MSG-3381 双测同值）', () => {
    expect(TS_BASELINE).toBe(11)
  })

  it('③ 计数纯函数：只数 `error TS<digits>`；注入 1 条 ⇒ 12', () => {
    const sample =
      'src/a.ts(1,1): error TS2322: x\nsrc/b.vue(2,2): error TS7006: y\n' +
      '（非错误行 error 不该计）\n  Type ... \n'
    expect(countTypeErrors(sample)).toBe(2)
    expect(countTypeErrors('')).toBe(0)
    // 真跑法实测形态：11 条存量 + 1 条注入 = 12
    expect(countTypeErrors('error TS2322\nerror TS2739\n')).toBe(2)
  })

  it('③ 判据纯函数：净增 0 ⇒ PASS；净增 1 ⇒ FAIL', () => {
    expect(judge(TS_BASELINE).ok).toBe(true)
    expect(judge(TS_BASELINE).exitCode).toBe(0)
    expect(judge(TS_BASELINE + 1).ok).toBe(false)
    expect(judge(TS_BASELINE + 1).exitCode).toBe(1)
    // 存量变少（修复）也 PASS（只可下调，不因变好而红）
    expect(judge(TS_BASELINE - 3).ok).toBe(true)
  })

  it('③b 反空跑闸：**0 条错而基线非零 ⇒ FAIL**（拒"清空 include／换回裸 --noEmit／|| true"）', () => {
    const v = judge(0)
    expect(v.ok).toBe(false)
    expect(v.exitCode).toBe(1)
    expect(v.reason).toContain('空跑')
    // 基线降到 0（存量真修完）后，0 才合法
    expect(judge(0, 0).ok).toBe(true)
  })

  it('③c 反空跑闸·第二式：`TS18003 No inputs` ⇒ 判可疑（拒"清空 include"）', () => {
    const out =
      "error TS18003: No inputs were found in config file 'tsconfig.app.json'. Specified 'include' paths were '[]'"
    expect(looksLikeNoInput(out)).toBe(true)
    // 正常输出不得命中
    expect(looksLikeNoInput('src/a.ts(1,1): error TS2322: x')).toBe(false)
    expect(looksLikeNoInput('')).toBe(false)
  })
})
