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
