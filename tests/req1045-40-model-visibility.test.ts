// REQ-1045-40（200-刀·模型面可见性修复）红证／绿证：检测连接反馈＋保存回执落点＋非 ready 注记
//
// 病灶（依据 `200-勘-模型面检测连接无反馈与落点不明（根因实取）`）：
//   ① 检测连接无反馈——`refreshProbe` 无 in-flight 态、结果行无时间戳 ⇒ 同态重测页面零变化；
//   ② 保存无回执／落点不可见——`persist()` 成功无提示，UI 无落点说明；
//   ③ 非 ready 时下拉仅"当前值"⇒ 单看下拉会误读为已实拉。
// 判据（改前①②③必红；④为「逐字未变」守卫·改前后恒绿）：
//   ① 点检测 ⇒ 出现「检测中…」且按钮禁用；每次点击（含同态重测）时间戳前移；
//   ② 保存成功 ⇒ 出现「已保存」；落点行（base／model → <home>/.closer/config.toml…）恒可见；
//   ③ 非 ready ⇒ 当前值选项带「未实拉」注记；ready ⇒ 注记消失、清单实拉；
//   ④ 用量面逐字未变：`用量：暂不支持（无 Access Token：不得以 API Key 冒充、不得写死余额）`。
//
// ★不动（题包红线）：daemon 八态语义（state 分支）——③ 内附「API Key 无效或缺失」单源回显断言。
//
// 注：直 mock `modelService` 模块（组件静态导入之）——若改 mock `@tauri-apps/api/core`，
// `modelService.inv()` 的 `await import()` 在并发首载（Promise.all 三连发）下于 runner 有竞态：
// 仅首个拿到命名空间·余为 undefined（探针实证 `reading 'invoke'` 报错），故不用。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const { getMock, setMock, probeMock, usageMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setMock: vi.fn(),
  probeMock: vi.fn(),
  usageMock: vi.fn(),
}))
vi.mock('../src/client/modelService', () => ({
  modelService: { get: getMock, set: setMock, probe: probeMock, usage: usageMock },
}))

import ModelCard from '../src/components/settings/ModelCard.vue'
import zhCN from '../src/locales/zh-CN'
import type { ModelServiceProbe } from '../src/client/modelService'

/** daemon 单源用量回显（逐字·对照「不得以 API Key 冒充／不得写死余额」口径） */
const USAGE_MSG = '暂不支持（无 Access Token：不得以 API Key 冒充、不得写死余额）'

const FACE = {
  base: 'https://welink.example/v1',
  model: 'agnes-3.0-flash',
  keySet: true,
  keyMasked: '****abcd',
}

const PROBE_UNAUTHORIZED: ModelServiceProbe = { state: 'unauthorized' }
const PROBE_READY: ModelServiceProbe = { state: 'ready', models: ['agnes-3.0-flash', 'agnes-3.0-pro'] }

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function mountCard() {
  return mount(ModelCard, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  getMock.mockReset()
  setMock.mockReset()
  probeMock.mockReset()
  usageMock.mockReset()
  localStorage.clear()
  // welink 档 ⇒ onMounted 走真读取链（get/probe/usage 三连）
  localStorage.setItem('baiz.provider', 'welink')
  getMock.mockResolvedValue({ ...FACE })
  setMock.mockResolvedValue({ ...FACE })
  probeMock.mockResolvedValue({ ...PROBE_UNAUTHORIZED })
  usageMock.mockResolvedValue({ supported: false, message: USAGE_MSG })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('REQ-1045-40 · 模型面可见性（检测反馈／保存回执／非 ready 注记）', () => {
  it('① 点「检测连接」⇒ 出现「检测中…」且按钮禁用；每次点击（含同态重测）时间戳前移', async () => {
    // 仅哄 Date（保真 setTimeout ⇒ flushPromises 正常）
    vi.useFakeTimers({ toFake: ['Date'] })
    const pendingProbes: Array<(v: ModelServiceProbe) => void> = []
    probeMock.mockImplementation(
      () =>
        new Promise((res) => {
          pendingProbes.push(res)
        }),
    )

    vi.setSystemTime(new Date('2026-10-02T10:00:00'))
    const wrapper = mountCard()
    await flushPromises()
    pendingProbes.shift()!(PROBE_UNAUTHORIZED) // 首屏 load 的 probe
    await flushPromises()

    const btn = () => wrapper.find('.w2-actions button')
    expect(btn().text(), '静置态按钮文案＝检测连接').toBe('检测连接')
    expect(wrapper.text(), '未点过检测 ⇒ 无时间戳').not.toContain('上次检测')

    vi.setSystemTime(new Date('2026-10-02T10:00:01'))
    await btn().trigger('click')
    await flushPromises()
    expect(btn().text(), 'in-flight 态必须可见「检测中…」').toContain('检测中')
    expect(btn().attributes('disabled'), 'in-flight 态按钮必须禁用').toBeDefined()

    pendingProbes.shift()!(PROBE_UNAUTHORIZED) // 同态回包（仍是 unauthorized）
    await flushPromises()
    expect(btn().text(), '回包后恢复静置文案').toBe('检测连接')
    expect(wrapper.text(), '首次检测后时间戳出现').toContain('上次检测 10:00:01')

    vi.setSystemTime(new Date('2026-10-02T10:00:06'))
    await btn().trigger('click')
    await flushPromises()
    pendingProbes.shift()!(PROBE_UNAUTHORIZED) // 第二次：与上次同态
    await flushPromises()
    const line = wrapper.find('.w2-status').text()
    expect(line, '同态重测：时间戳前移（可见即算有结果）').toContain('上次检测 10:00:06')
    expect(line, '旧时间戳被替换（非叠加）').not.toContain('10:00:01')
  })

  it('② 保存成功 ⇒ 「已保存」回执；落点行恒可见；set 真调用', async () => {
    const wrapper = mountCard()
    await flushPromises()

    const fields = wrapper.find('.welink-fields')
    expect(fields.text(), '落点行恒可见（base／model → config.toml）').toContain(
      'base／model → <home>/.closer/config.toml',
    )
    expect(fields.text(), 'API Key 保管口径（仅显示尾 4 位）').toContain('仅显示尾 4 位')

    expect(wrapper.find('.save-notice').exists(), '未保存 ⇒ 无回执').toBe(false)

    const baseInput = wrapper.find('.welink-fields input[type="text"]')
    await baseInput.setValue('https://welink.example/v2')
    await baseInput.trigger('change')
    await flushPromises()

    expect(setMock, 'set 真调用（payload 对卯）').toHaveBeenCalledWith({
      base: 'https://welink.example/v2',
    })
    const notice = wrapper.find('.save-notice')
    expect(notice.exists(), '保存成功后必须出「已保存」回执').toBe(true)
    expect(notice.text()).toBe('已保存')
  })

  it('③ 非 ready ⇒ 当前值选项带「未实拉」注记；ready ⇒ 注记消失、服务端清单实拉', async () => {
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.find('.w2-status').text(), 'daemon 八态单源回显未动').toContain(
      'API Key 无效或缺失',
    )
    const optionTexts = () =>
      wrapper
        .find('.welink-fields select')
        .findAll('option')
        .map((o) => o.text())
    expect(optionTexts()[0], '非 ready：当前值带注记').toContain('当前值')
    // 修法③原文：「（当前值·未从 `/v1/models` 实拉）」——"未实拉"为红证简写·字面不相邻
    expect(optionTexts()[0], '非 ready：注记＝未从 /v1/models 实拉').toContain('未从 /v1/models 实拉')

    probeMock.mockResolvedValue({ ...PROBE_READY })
    await wrapper.find('.w2-actions button').trigger('click')
    await flushPromises()
    expect(optionTexts().join('｜'), 'ready：注记消失').not.toContain('未从 /v1/models 实拉')
    expect(optionTexts(), 'ready：服务端清单实拉（禁写死）').toEqual([
      'agnes-3.0-flash',
      'agnes-3.0-pro',
    ])
    expect(wrapper.find('.w2-status').text()).toContain('已配置')
  })

  it('④ 用量面逐字未变（字符串断言·改前后恒绿守卫）', async () => {
    const wrapper = mountCard()
    await flushPromises()

    expect(zhCN.settings.weLinkUsage, 'zh 用量标签').toBe('用量')
    expect(zhCN.settings.weLinkUsageLoading, 'zh 加载占位').toBe('读取中…')
    const usageLine = wrapper.findAll('p.field-hint').find((p) => p.text().startsWith('用量：'))
    expect(usageLine, '用量行必须在').toBeTruthy()
    expect(usageLine!.text(), '逐字口径（daemon 单源回显）').toBe(
      '用量：暂不支持（无 Access Token：不得以 API Key 冒充、不得写死余额）',
    )
  })
})
