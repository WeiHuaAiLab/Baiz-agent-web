# Baiz-agent-web
Baiz Agent Web

## 门禁（MSG-3381 更正·**勿再用旧的空跑命令**）

| 门禁 | 真命令 | 判据 |
|---|---|---|
| 类型 | `npm run typecheck:gate`（＝`node scripts/typecheck-gate.mjs`；内部真命令 `npx vue-tsc -p tsconfig.app.json --noEmit`） | **净增 0**（`error TS` 计数对照**存量基线 11 条**；>11 ⇒ EXIT 1） |
| 测试 | `npx vitest run` | 全绿（在册对照 62 files／407 tests 为 1.0.20 起点值） |
| 构建 | `npx vite build` | EXIT 0 |

⚠ **已知假门禁（不得再用）**：`npx vue-tsc --noEmit`（**不带 `-p`／`-b`**）——根
`tsconfig.json` 是 solution 式（`"files": []` ＋ `references`），该命令**什么都不查**，
**注入类型错误仍 EXIT 0**（19号组 `MSG-3376` 首逮·本仓 `MSG-3381` 复现）。
⇒ **此前凡以该命令得出"类型门禁通过"的结论，一律不作数**（口径更正，不涉其码）。

⚠ `npm run build` 已改为 `npm run typecheck:gate && vite build`（旧值为
`vue-tsc --noEmit && vite build`，其中类型段是空跑）。
