// MSG-3203 DEBT-741（移植 MSG-2726 DEBT-552）自动更新红证：能力门
// （web/mock 形态 has=false——checkUpdate 返 null）；tauri 形态 has=true
// 且 check 经插件面。
import { describe, expect, it, vi } from 'vitest'
import { createWebBridge } from '../src/bridge/web'
import { createMockBridge } from '../src/bridge/mock'
import { createTauriBridge } from '../src/bridge/tauri'

// 顶层静态 mock（照 vitest hoist 纪律）：本文件仅测 updater 面——插件层
// 恒 mock——无 unmock 需求
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(async () => ({
    version: '9.9.9',
    downloadAndInstall: vi.fn(async () => {}),
  })),
}))

describe('MSG-3203 updater 能力门', () => {
  it('① web 形态：has(updater.check)=false——checkUpdate 返 null（能力门前置）', async () => {
    const bridge = createWebBridge()
    expect(bridge.has('updater.check')).toBe(false)
    await expect(bridge.checkUpdate()).resolves.toBeNull()
  })

  it('② mock 形态：同 web——零能力零调用', async () => {
    const bridge = createMockBridge()
    expect(bridge.has('updater.check')).toBe(false)
    await expect(bridge.checkUpdate()).resolves.toBeNull()
  })

  it('③ tauri 形态：has=true——check 经插件面（mock 层——返可用形）', async () => {
    const bridge = createTauriBridge()
    expect(bridge.has('updater.check')).toBe(true)
    const r = await bridge.checkUpdate()
    expect(r?.available).toBe(true)
    expect(r?.version).toBe('9.9.9')
  })
})
