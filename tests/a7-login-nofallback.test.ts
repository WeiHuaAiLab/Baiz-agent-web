// DEBT-875（MSG-3502·A7）红证：**传输层「智能回退」⇒ 生产"乱输入也能进"**
//
// 病灶（测试员 T3a 实测原径，与 `MSG-3494` 勘定件 §②A7 一致）：
//   壳回「未实现」⇒ `src/client/transports/tauri.ts` 的 `catch` **无条件** `useMock()`
//   ⇒ 切 mock ⇒ mock 的 `auth.login` 对**任意口令**发 `mock-` token
//   ⇒ `auth.login()` 返回 true ⇒ 进主界面（一切真 RPC 不可用＝"无法连通模型"）。
//
// 判据（改前必红／改后必绿）：
//   ① 生产（`DEV≠true` 且 `VITE_BAIZ_DEMO≠'1'`）＋壳回「未实现」⇒ `connect()` **必须上抛**；
//   ② 同环境下 `auth.login(乱输入, 乱输入)` ⇒ **false ＋ 零 token**（不得出现 `mock-`）；
//   ③ 显式演示开关（`VITE_BAIZ_DEMO='1'`）⇒ 降级演示**仍允许**（演示是显式功能，非静默兜底）；
//   ④ 生产禁降级时 **`demoMode` 不得被置真**（防"看着像演示"混淆）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createTauriTransport } from '../src/client/transports/tauri'
import { resetClientForTests } from '../src/client/singleton'
import { useAuthStore } from '../src/stores/auth'
import { useSettingsStore } from '../src/stores/settings'
import { resetBridgeForTests } from '../src/bridge'
import { createTauriBridge } from '../src/bridge/tauri'

// 壳「未实现」桩：与 1.0.20 装机件壳桩同形（`/not implemented/i` 命中即降级）
vi.mock('@tauri-apps/api/event', () => ({
  listen: async () => {
    throw new Error('proxy_rpc: not implemented')
  },
}))

/** 模拟生产构建：`import.meta.env.DEV` 非 true、演示开关未开 */
function productionEnv() {
  vi.stubEnv('DEV', '' as unknown as string)
  vi.stubEnv('VITE_BAIZ_DEMO', '')
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetClientForTests()
  resetBridgeForTests(createTauriBridge())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('A7-① 生产禁降级：壳回「未实现」不得静默切 mock', () => {
  it('connect() 必须上抛（不得静默转演示）', async () => {
    productionEnv()
    const transport = createTauriTransport()
    await expect(transport.connect()).rejects.toThrow()
  })
})

describe('A7-② 任意口令不得换 token（测试员 T3a 原径）', () => {
  it('生产＋壳回「未实现」⇒ login 必败且零 token（不得出 mock-）', async () => {
    productionEnv()
    const auth = useAuthStore()
    const ok = await auth.login('luan-shu-ru@example.com', 'luan-shu-ru-123')
    expect(ok, `改前泄漏：乱输入竟然登录成功，token=${auth.sessionToken}`).toBe(false)
    expect(auth.sessionToken).toBe('')
    expect(sessionStorage.getItem('baiz_session_token') ?? '').not.toMatch(/^mock-/)
  })
})

describe('A7-③④ 演示是显式功能（非静默兜底）', () => {
  it("VITE_BAIZ_DEMO='1' ⇒ 降级演示仍允许，demoMode 置真", async () => {
    vi.stubEnv('VITE_BAIZ_DEMO', '1')
    const settings = useSettingsStore()
    const transport = createTauriTransport()
    await expect(transport.connect()).resolves.toBeUndefined()
    expect(settings.demoMode).toBe(true)
  })

  it('既非 dev 又未开演示开关 ⇒ 不得置 demoMode（防"像演示"混淆）', async () => {
    productionEnv()
    const settings = useSettingsStore()
    const transport = createTauriTransport()
    await expect(transport.connect()).rejects.toThrow()
    expect(settings.demoMode).toBe(false)
  })
})
