// **`令-TEST2` · 防复发闸两条**（入既有 web 门禁口径：随 `vitest` 全量跑）
//
// 病灶背景（今日两处**线上可见回归**，均属"结构性可断言"类）：
//   · **SSE1 类**：`reconnectClient()` 换传输 ⇒ `SseReconnect`（boot 时只挂旧传输）**帧路断** ⇒
//     回复落库但界面「一直生成中…」；
//   · **MSG-3592 类**：**装机（tauri）径** `request()` **整包直交** ⇒ 读 `result.<字段>` 恒 undefined
//     ⇒ 登录 `user_id` 丢（并连带 P2 抛错＝登录即崩）。
//
// 闸之性质：**能对真回归报警**（禁"永远通过"的空断言）——故取**结构断言（读源码）＋行为断言**
// 双层；**红证**已以"临时变异取证·取证后复原"实做（见回执 §二）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

import { createTauriTransport } from '../src/client/transports/tauri'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import type { RpcRequest } from '../src/client/rpc'

/** 读源码（相对本件：`tests/` ⇒ `../src/...`）；**去注释**后再断言（免注释里的字样干扰） */
function sourceWithoutComments(rel: string): string {
  // vitest 之 cwd＝仓根（与 loc/typecheck 门禁同口径）；按 cwd 拼路径最稳
  const raw = readFileSync(join(process.cwd(), rel), 'utf8')
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

function req(method: string, id = 1): RpcRequest {
  return { jsonrpc: '2.0', id, method, params: {} }
}

describe('闸一 · SSE1 类：不得「换传输」（换 ⇒ 壳侧 unlisten ⇒ 帧路断）', () => {
  it('结构：singleton.reconnectClient 不得 close 传输，须仍用同一 transport 建 client 门面', () => {
    const code = sourceWithoutComments('src/client/singleton.ts')
    expect(
      code,
      'reconnectClient 不得 close 传输（close ⇒ teardownListeners ⇒ daemon://frame 不再达）',
    ).not.toMatch(/transport\s*\.\s*close/);
    expect(
      code,
      '必须以【同一 transport】建新 client 门面（createClient(current.transport)）',
    ).toMatch(/createClient\(\s*current\.transport\s*\)/)
  })

  it('结构：main.ts 之 SseReconnect 与单例 setup 同源（收到同一 transport）', () => {
    const main = sourceWithoutComments('src/main.ts')
    expect(main, 'boot 须从同一 setup 解出 client／transport').toMatch(
      /const\s*\{\s*client\s*,\s*transport\s*\}\s*=\s*setup/,
    )
    expect(main, 'SseReconnect 须收到该 transport（勿另建）').toMatch(
      /new SseReconnect\(\{[\s\S]{0,400}?transport,/,
    )
    expect(
      main,
      'boot 之后不得再出现第二处 createDefaultTransport/getClientSetup 供 SseReconnect 另用',
    ).not.toMatch(/new SseReconnect\(\{[\s\S]{0,400}?createDefaultTransport\(/)
  })

  it('行为：单例传输与 SseReconnect 所持传输同源（供后续换面时恒等）', () => {
    resetClientForTests()
    const setup = getClientSetup()
    expect(setup.transport, 'setup 暴露同一 transport 供重连器使用').toBe(getClientSetup().transport)
  })
})

describe('闸二 · MSG-3592 类：tauri 径必解包 result（整包直交＝线上登录崩）', () => {
  it('结构：tauri transport request() 须含 isRpcFailure 抛错 ＋ result 解包', () => {
    const code = sourceWithoutComments('src/client/transports/tauri.ts')
    expect(code, '失败面：信封含 error ⇒ 必抛').toMatch(/isRpcFailure\(\s*payload\s*\)/)
    expect(code, '成功面：须解 result（与 http.ts 同口径）').toMatch(/'result'\s+in\s+payload/)
  })

  it('行为：信封 ⇒ 只回 result；错误信封 ⇒ 抛 RpcError（码照录）', async () => {
    const tauri = createTauriTransport()
    await tauri.connect()

    invokeMock.mockReset()
    invokeMock.mockResolvedValue({
      jsonrpc: '2.0',
      id: 1,
      result: { session_token: 'tok-gate', user_id: 'uid-gate' },
    })
    await expect(tauri.request(req('auth.login'))).resolves.toEqual({
      session_token: 'tok-gate',
      user_id: 'uid-gate',
    })

    invokeMock.mockResolvedValue({
      jsonrpc: '2.0',
      id: 2,
      error: { code: -32002, message: 'unauthorized' },
    })
    await expect(tauri.request(req('schedule.list', 2))).rejects.toMatchObject({ code: -32002 })
  })
})
