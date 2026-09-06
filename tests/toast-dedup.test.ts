// DEBT-540-C 红证：toast 同文案同形态去重——可见期单卡；异文案并立勿清。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from '../src/stores/ui'

describe('DEBT-540 toast 去重', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('同文案同形态连触发三次 → 仅一卡（刷新计时不叠加）', () => {
    const ui = useUiStore()
    ui.toast('当前形态暂不支持选择附件', 'error')
    ui.toast('当前形态暂不支持选择附件', 'error')
    ui.toast('当前形态暂不支持选择附件', 'error')
    expect(ui.toasts.filter((t) => t.message === '当前形态暂不支持选择附件')).toHaveLength(1)
  })

  it('异文案/异形态卡并立勿清', () => {
    const ui = useUiStore()
    ui.toast('甲错误', 'error')
    ui.toast('乙错误', 'error')
    ui.toast('甲提示', 'info')
    expect(ui.toasts).toHaveLength(3)
  })

  it('可见期后移除——同文案再触发新卡', () => {
    const ui = useUiStore()
    ui.toast('过期错误', 'error')
    vi.advanceTimersByTime(3600)
    expect(ui.toasts.filter((t) => t.message === '过期错误')).toHaveLength(0)
    ui.toast('过期错误', 'error')
    expect(ui.toasts.filter((t) => t.message === '过期错误')).toHaveLength(1)
  })
})
