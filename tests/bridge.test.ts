import { describe, expect, it } from 'vitest'
import { detectRuntime } from '../src/bridge'
import { createMockBridge } from '../src/bridge/mock'

describe('bridge', () => {
  it('jsdom 环境下探测为 web 形态', () => {
    expect(detectRuntime()).toBe('web')
  })

  it('mock bridge 能力齐全且可用', async () => {
    const bridge = createMockBridge()
    expect(bridge.has('fs.read')).toBe(true)
    expect(bridge.has('window.control')).toBe(true)
    const text = await bridge.fs.readTextFile('/a')
    expect(text).toContain('mock')
    const entries = await bridge.fs.listDir('/')
    expect(entries[0]?.name).toBe('demo.md')
  })
})

describe('DEBT-540 附件能力面', () => {
  it('tauri 形态声明 fs.pickAttachment（A 补链——has 过钮层门禁开）', async () => {
    const { createTauriBridge } = await import('../src/bridge/tauri')
    const bridge = createTauriBridge()
    expect(bridge.has('fs.pickAttachment')).toBe(true)
    expect(bridge.has('fs.pickDir')).toBe(true)
  })

  it('mock/web 既有附件链零回退（mock pickAttachment 可调）', async () => {
    const { createMockBridge } = await import('../src/bridge/mock')
    const bridge = createMockBridge()
    expect(bridge.has('fs.pickAttachment')).toBe(true)
    const picked = await bridge.fs.pickAttachment()
    expect(picked).toBeTruthy()
    expect(typeof picked?.name).toBe('string')
  })
})
