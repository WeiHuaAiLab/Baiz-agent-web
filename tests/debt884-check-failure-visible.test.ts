// **DEBT-884 红证**：检查失败不得被伪装成「已是最新」。
//
// 病灶（备用3 已实读·本席复读）：`src/bridge/tauri.ts:141`
// `const update = await check().catch(() => null)` ⇒ 插件 `check()` 在
// 网络／DNS／端点 4xx／签名-公钥不匹配／超时 任一失败时 **reject**，异常被吃成 `null`
// ⇒ `:142 if (!update) return { available: false }` ⇒ `UpdateCard.vue:52-55` 走 `else`
// ⇒ `ui.toast(t('settings.updateNone'), 'success')`（**假「已最新」**）。
//
// 判据（三条·③ 为硬约束防回归）：
//   ① 插件 `check()` reject ⇒ 界面显「检查更新失败」（改前＝显「已是最新」⇒ 红）
//   ② 插件 `check()` resolve 但**确无更新**（null）⇒ 仍显「已是最新」（两义不许混）
//   ③ **安装面硬约束**：`install()` 内**重取**返 null 仍**静默收口**（不抛错、不误报失败）
//      —— `tauri.ts:161` 及其上游注释 `:143-148` 所载语义**一字不许破**
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhCN from '../src/locales/zh-CN'
import UpdateCard from '../src/components/settings/UpdateCard.vue'
import { useUiStore } from '../src/stores/ui'

/** 插件面可控掷变：reject（检查失败）／none（确无更新）／available（有新版） */
const plugin = vi.hoisted(() => ({
  mode: 'available' as 'reject' | 'none' | 'available',
  error: new Error('updater endpoint 404'),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(async () => {
    if (plugin.mode === 'reject') throw plugin.error
    if (plugin.mode === 'none') return null
    return {
      version: '9.9.9',
      body: '来自服务端的说明',
      downloadAndInstall: vi.fn(async () => {}),
    }
  }),
}))

// 只换运行时判定与取桥（**不动 bridge 本体**——被测的正是 tauri 桥的**检查面**）
vi.mock('../src/bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/bridge')>()
  const { createTauriBridge } = await import('../src/bridge/tauri')
  return {
    ...actual,
    detectRuntime: () => 'tauri' as const,
    detectVersion: async () => '1.0.26',
    getBridge: () => createTauriBridge(),
  }
})

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 上屏 toast 全文（形态:文案 串联）——界面"说了什么"的机判面 */
function toastsText(): string {
  return useUiStore()
    .toasts.map((item) => `${item.type}:${item.message}`)
    .join('｜')
}

async function clickCheck() {
  const wrapper = mount(UpdateCard, { global: { plugins: [i18n] } })
  await flushPromises()
  await wrapper.find('.check-update-btn').trigger('click')
  await flushPromises()
  return wrapper
}

describe('DEBT-884：检查失败与「已是最新」必须可辨', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    plugin.mode = 'available'
  })

  it('① 插件 check() reject ⇒ 显「检查更新失败」（改前＝假「已是最新」）', async () => {
    plugin.mode = 'reject'
    await clickCheck()
    const text = toastsText()
    expect(text, '检查失败须上屏失败文案（不得吞错）').toContain('检查更新失败')
    expect(text, '检查失败不得伪装成「已是最新」').not.toContain('已是最新')
  })

  it('② 插件 check() resolve 但确无更新 ⇒ 仍显「已是最新」（两义不混）', async () => {
    plugin.mode = 'none'
    await clickCheck()
    const text = toastsText()
    expect(text, '确无更新仍须显「已是最新」').toContain('已是最新')
    expect(text, '确无更新不得误报失败').not.toContain('检查更新失败')
  })

  it('③ 硬约束：install() 内重取返 null 仍静默收口（不抛错·不误报失败）', async () => {
    const { createTauriBridge } = await import('../src/bridge/tauri')
    const bridge = createTauriBridge()
    plugin.mode = 'available'
    const result = await bridge.checkUpdate()
    expect(result?.available, '有新版须返 available').toBe(true)
    // 用户确认动作可能已过数小时 ⇒ 安装前重取；期间发布被撤 ⇒ 重取返 null ⇒ **静默收口**
    plugin.mode = 'none'
    await expect(result!.install(), '重取无更新须静默收口（不得抛错）').resolves.toBeUndefined()
  })
})
