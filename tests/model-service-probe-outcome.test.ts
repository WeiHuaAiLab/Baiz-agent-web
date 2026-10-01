// W2（1.0.48）：probe 八态 → 展示态单测（纯前端·不依赖后端 command）。
import { describe, expect, it } from 'vitest'
import { probeOutcome } from '../src/utils/modelService'

describe('W2 probe 八态展示态', () => {
  it('ready ⇒ 已配置且透传 models（实拉·禁写死）', () => {
    const out = probeOutcome({ state: 'ready', httpStatus: 200, models: ['agnes-3.0-flash', 'deepseek-v4-pro'] })
    expect(out.ready).toBe(true)
    expect(out.kind).toBe('ready')
    expect(out.models).toEqual(['agnes-3.0-flash', 'deepseek-v4-pro'])
  })

  it('unauthorized(401) ⇒ 非已配置', () => {
    expect(probeOutcome({ state: 'unauthorized', httpStatus: 401 }).ready).toBe(false)
  })

  it('insufficientQuota(403) ⇒ 非已配置', () => {
    expect(probeOutcome({ state: 'insufficientQuota', httpStatus: 403 }).ready).toBe(false)
  })

  it('modelNotFound(503) ⇒ 非已配置', () => {
    expect(probeOutcome({ state: 'modelNotFound', httpStatus: 503 }).ready).toBe(false)
  })

  it('modelNotAllowed(200) ⇒ 非已配置·附 detail', () => {
    const out = probeOutcome({ state: 'modelNotAllowed', httpStatus: 200, model: 'x', detail: 'denied' })
    expect(out.ready).toBe(false)
    expect(out.detail).toBe('denied')
  })

  it('rateLimited(429) ⇒ 非已配置·附 retryAfterSecs', () => {
    const out = probeOutcome({ state: 'rateLimited', httpStatus: 429, retryAfterSecs: 7 })
    expect(out.ready).toBe(false)
    expect(out.retryAfterSecs).toBe(7)
  })

  it('httpError ⇒ 非已配置·附 httpStatus', () => {
    const out = probeOutcome({ state: 'httpError', httpStatus: 502 })
    expect(out.ready).toBe(false)
    expect(out.httpStatus).toBe(502)
  })

  it('unreachable ⇒ 非已配置（不静默）', () => {
    const out = probeOutcome({ state: 'unreachable', detail: 'timeout' })
    expect(out.ready).toBe(false)
    expect(out.detail).toBe('timeout')
  })

  it('null/undefined ⇒ 保守归 unreachable', () => {
    expect(probeOutcome(null).kind).toBe('unreachable')
    expect(probeOutcome(undefined).ready).toBe(false)
  })
})
