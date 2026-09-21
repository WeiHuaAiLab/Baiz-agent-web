// MSG-3301「更新内容可见化」红证（6 条）：
// ① 桥接带出 notes ⇒ 卡内渲染关键片段（且换行/空白已正常化）
// ② 无 notes ⇒ **显式兜底**「本次更新未提供说明」（禁空白、禁假装）
// ③ **安全**：notes 含 HTML ⇒ DOM 里**零标签**，只有转义文本（禁 v-html）
// ④ **长度闸**：8KB notes ⇒ 渲染受限（4096）且显式「已截断」
// ⑤ 不支持形态（has('updater.check')=false）⇒ 按钮不显＋诚实说明
// ⑥ `installing` 闸下二次点击无效（install 只调一次）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhCN from '../src/locales/zh-CN'
import {
  UPDATE_NOTES_MAX_CHARS,
  normalizeUpdateNotes,
} from '../src/utils/updateNotes'
import UpdateCard from '../src/components/settings/UpdateCard.vue'

// vi.hoisted：工厂提升（vitest 钉）——测试侧可改 has/checkUpdate 返回值
const mocks = vi.hoisted(() => ({
  has: vi.fn(() => true),
  checkUpdate: vi.fn(),
}))
vi.mock('../src/bridge', () => ({
  detectRuntime: () => 'tauri',
  detectVersion: () => Promise.resolve('1.0.18'),
  getBridge: () => ({ has: mocks.has, checkUpdate: mocks.checkUpdate }),
}))

// 桥接层红证：`Update.body`（＝latest.json.notes）必须带出
const plugin = vi.hoisted(() => ({ body: '来自服务端的说明' as string | undefined }))
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(async () => ({
    version: '9.9.9',
    get body() {
      return plugin.body
    },
    downloadAndInstall: vi.fn(async () => {}),
  })),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function mountCard() {
  return mount(UpdateCard, { global: { plugins: [i18n] } })
}

/** 点「检查更新」并等一轮微任务（checkUpdate 已 await） */
async function clickCheck(wrapper: ReturnType<typeof mountCard>) {
  await wrapper.find('.check-update-btn').trigger('click')
  await flushPromises()
}

describe('MSG-3301 ① 更新说明规范化（纯函数）', () => {
  it('CRLF→LF、行尾空白、三连空行压成一空行、控制符剔除', () => {
    const raw = '行一  \r\n\n\n\n行二\u0007\t尾部\t'
    const view = normalizeUpdateNotes(raw)
    expect(view.truncated).toBe(false)
    expect(view.text).toBe('行一\n\n行二\t尾部')
    expect(view.text).not.toContain('\r')
    expect(view.text).not.toContain('\u0007')
  })

  it('null／空串／纯空白 ⇒ 空文本（界面据此走显式兜底）', () => {
    expect(normalizeUpdateNotes(null)).toEqual({ text: '', truncated: false })
    expect(normalizeUpdateNotes('')).toEqual({ text: '', truncated: false })
    expect(normalizeUpdateNotes('   \n\n  ')).toEqual({ text: '', truncated: false })
  })

  it('超限截断：8KB ⇒ 文本长度受限且 truncated=true', () => {
    const view = normalizeUpdateNotes('字'.repeat(8192))
    expect(view.truncated).toBe(true)
    expect(Array.from(view.text)).toHaveLength(UPDATE_NOTES_MAX_CHARS)
  })
})

describe('MSG-3301 ② 卡内渲染（UpdateCard）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.has.mockReturnValue(true)
    mocks.checkUpdate.mockReset()
  })

  it('① 有 notes ⇒ 渲染含关键片段（不再弹 window.confirm 原生框）', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    mocks.checkUpdate.mockResolvedValue({
      available: true,
      version: '1.0.19',
      notes: '修复：写面会话门\r\n\r\n\r\n新增：在线召回冲突消解',
      install: vi.fn(async () => {}),
    })
    const wrapper = mountCard()
    await clickCheck(wrapper)

    const body = wrapper.find('.update-notes-body').text()
    expect(body).toContain('修复：写面会话门')
    expect(body).toContain('新增：在线召回冲突消解')
    expect(body).not.toContain('\r')
    expect(body).not.toContain('\n\n\n') // 三连空行已压
    expect(wrapper.find('.update-notes').attributes('data-state')).toBe('available')
    expect(confirmSpy).not.toHaveBeenCalled() // 原生框已废
    confirmSpy.mockRestore()
  })

  it('② 无 notes（null）⇒ 显式兜底文案（禁空白、禁假装有内容）', async () => {
    mocks.checkUpdate.mockResolvedValue({
      available: true,
      version: '1.0.19',
      notes: null,
      install: vi.fn(async () => {}),
    })
    const wrapper = mountCard()
    await clickCheck(wrapper)

    expect(wrapper.find('.update-notes-empty').exists()).toBe(true)
    expect(wrapper.find('.update-notes-empty').text()).toBe(zhCN.settings.updateNoNotes)
    expect(wrapper.find('.update-notes-body').exists()).toBe(false)
  })

  it('③ 安全：notes 含 HTML ⇒ DOM 零标签，只显转义文本（禁 v-html）', async () => {
    const payload = '<img src=x onerror="window.__pwned=1">加粗<b>粗</b><script>1</script>'
    mocks.checkUpdate.mockResolvedValue({
      available: true,
      version: '1.0.19',
      notes: payload,
      install: vi.fn(async () => {}),
    })
    const wrapper = mountCard()
    await clickCheck(wrapper)

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('.update-notes-body b').exists()).toBe(false)
    const html = wrapper.html()
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    // 原文可见（被转义为文本节点）
    expect(wrapper.find('.update-notes-body').text()).toContain('<img src=x onerror=')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('④ 长度闸：8KB notes ⇒ 渲染受限＋显式「已截断」', async () => {
    mocks.checkUpdate.mockResolvedValue({
      available: true,
      version: '1.0.19',
      notes: 'A'.repeat(8192),
      install: vi.fn(async () => {}),
    })
    const wrapper = mountCard()
    await clickCheck(wrapper)

    const shown = wrapper.find('.update-notes-body').text()
    expect(Array.from(shown)).toHaveLength(UPDATE_NOTES_MAX_CHARS)
    expect(shown.length).toBeLessThan(8192)
    expect(wrapper.find('.update-notes-trunc').text()).toBe(zhCN.settings.updateNotesTruncated)
  })

  it('⑤ 不支持形态（has=false）⇒ 按钮不显＋诚实说明', async () => {
    mocks.has.mockReturnValue(false)
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.find('.check-update-btn').exists()).toBe(false)
    expect(wrapper.find('.update-unsupported').text()).toBe(zhCN.settings.updateUnsupported)
    expect(mocks.checkUpdate).not.toHaveBeenCalled()
  })

  it('⑥ installing 闸：安装中二次点击无效（install 只调一次）＋「稍后」可收卡', async () => {
    let release: () => void = () => {}
    const install = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    mocks.checkUpdate.mockResolvedValue({
      available: true,
      version: '1.0.19',
      notes: '有说明',
      install,
    })
    const wrapper = mountCard()
    await clickCheck(wrapper)

    await wrapper.find('.update-now-btn').trigger('click')
    await flushPromises()
    expect(install).toHaveBeenCalledTimes(1)
    // 安装中：两钮俱禁（防二次触发；「稍后」亦不得半路撤卡）
    expect(wrapper.find('.update-now-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.update-later-btn').attributes('disabled')).toBeDefined()
    await wrapper.find('.update-now-btn').trigger('click')
    await wrapper.find('.update-later-btn').trigger('click')
    expect(install).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.update-notes').exists()).toBe(true)
    // **直派事件**（绕过 DOM disabled 的用户代理抑制）——测的是**handler 内的闸**：
    // 只靠 `:disabled` 属性挡不住事件直派／回车键径，闸必须在函数里。
    ;(wrapper.find('.update-now-btn').element as HTMLButtonElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await flushPromises()
    expect(install).toHaveBeenCalledTimes(1)

    release()
    await flushPromises()
    expect(wrapper.find('.update-notes').exists()).toBe(false) // 装完收卡
  })

  it('⑥b 未安装时「稍后」即收卡（更新对象不长期持有）', async () => {
    mocks.checkUpdate.mockResolvedValue({
      available: true,
      version: '1.0.19',
      notes: '有说明',
      install: vi.fn(async () => {}),
    })
    const wrapper = mountCard()
    await clickCheck(wrapper)
    expect(wrapper.find('.update-notes').exists()).toBe(true)
    await wrapper.find('.update-later-btn').trigger('click')
    expect(wrapper.find('.update-notes').exists()).toBe(false)
  })
})

describe('MSG-3301 ③ 桥接层：notes 必须带出（否则界面永远看不到）', () => {
  it('① tauri 形态：插件 Update.body ⇒ UpdateCheckResult.notes（逐字）', async () => {
    plugin.body = '修复 A；新增 B'
    const { createTauriBridge } = await import('../src/bridge/tauri')
    const result = await createTauriBridge().checkUpdate()
    expect(result?.available).toBe(true)
    expect(result?.version).toBe('9.9.9')
    expect(result?.notes).toBe('修复 A；新增 B')
  })

  it('② 服务端未给 body ⇒ notes=null（形态诚实，勿造假）', async () => {
    plugin.body = undefined
    const { createTauriBridge } = await import('../src/bridge/tauri')
    const result = await createTauriBridge().checkUpdate()
    expect(result?.notes).toBeNull()
  })
})
