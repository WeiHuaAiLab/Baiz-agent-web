// W2（1.0.47）：模型服务探测四态分类单测（纯前端·不依赖后端 command）。
import { describe, expect, it } from 'vitest'
import { classifyModelServiceProbe } from '../src/utils/modelService'

describe('W2 探测四态分类', () => {
  it('200 且无「没有权限」⇒ ok（已配置）', () => {
    expect(classifyModelServiceProbe(200, '{"object":"list"}')).toBe('ok')
  })

  it('200 且正文含「没有权限」⇒ no-permission', () => {
    expect(classifyModelServiceProbe(200, '您没有权限使用模型 X')).toBe('no-permission')
  })

  it('401 ⇒ invalid-key（key 无效/缺失）', () => {
    expect(classifyModelServiceProbe(401)).toBe('invalid-key')
  })

  it('403 ⇒ quota（额度不足）', () => {
    expect(classifyModelServiceProbe(403)).toBe('quota')
  })

  it('503 ⇒ no-channel（模型无通道）', () => {
    expect(classifyModelServiceProbe(503)).toBe('no-channel')
  })

  it('非明确态（如 429/500/网络不可达）保守归 invalid-key', () => {
    expect(classifyModelServiceProbe(429)).toBe('invalid-key')
    expect(classifyModelServiceProbe(500)).toBe('invalid-key')
  })
})
