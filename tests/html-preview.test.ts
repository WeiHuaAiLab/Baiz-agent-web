// MSG-3187 档一「HTML 静态预览」红证（验收五条 + 安全三条）：
// ① `.html` 能渲染（看到界面不是源码）② 越界文件 ⇒ 拒 ③ 关脚本 ⇒ 不执行
// ④ 不改动任何用户数据（只读）⑤ 预览失败给人话（不白屏）＋外开同闸
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import HtmlPreview from '../src/components/ExtensionPanels/files/HtmlPreview.vue'
import {
  buildExternalPreviewDocument,
  buildPreviewDocument,
  isHtmlPath,
  previewCsp,
  previewSandbox,
} from '../src/utils/htmlPreview'
import type { PreviewLoader } from '../src/utils/filePreview'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const HTML = '<!doctype html><html><head><title>t</title></head><body><h1>你好</h1></body></html>'
const bytesOf = (text: string) => new TextEncoder().encode(text)

function mountPreview(loader: PreviewLoader | undefined, path = '/ws/site/index.html') {
  return mount(HtmlPreview, {
    props: { path, name: 'index.html', loader },
    global: { plugins: [i18n] },
  })
}

describe('MSG-3187 · 安全三条（纯函数面）', () => {
  it('只认 .html／.htm（大小写不敏感），其余不当作 HTML', () => {
    expect(isHtmlPath('a/index.html')).toBe(true)
    expect(isHtmlPath('a\\b\\PAGE.HTM')).toBe(true)
    expect(isHtmlPath('a/index.html.bak')).toBe(false)
    expect(isHtmlPath('a/app.css')).toBe(false)
  })

  it('沙箱：**只有** allow-scripts（可关）——无 allow-same-origin 等任何特权', () => {
    expect(previewSandbox({ scripts: true })).toBe('allow-scripts')
    expect(previewSandbox({ scripts: false })).toBe('')
  })

  it('CSP：默认全禁；高风险面（跨域 fetch／外部资源／子框／表单）一律拦', () => {
    for (const scripts of [true, false]) {
      const csp = previewCsp(scripts)
      expect(csp).toContain("default-src 'none'")
      expect(csp).toContain("connect-src 'none'") // 跨域 fetch/XHR/WS
      expect(csp).toContain("frame-src 'none'")
      expect(csp).toContain("form-action 'none'")
      expect(csp).toContain("base-uri 'none'")
    }
    expect(previewCsp(true)).toContain("script-src 'unsafe-inline'")
    expect(previewCsp(false)).toContain("script-src 'none'")
  })

  it('预览文档把 CSP meta 插进 <head> 之后（无 head 则前置）', () => {
    const doc = buildPreviewDocument(HTML, { scripts: true })
    expect(doc.indexOf('Content-Security-Policy')).toBeGreaterThan(doc.indexOf('<head>'))
    expect(doc).toContain('<h1>你好</h1>')
    const bare = buildPreviewDocument('<h1>x</h1>', { scripts: false })
    expect(bare.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
  })

  it('外开新窗＝同策略沙箱包装（内层仍是 sandbox＋CSP 的 iframe）', () => {
    const page = buildExternalPreviewDocument(HTML, { scripts: true })
    expect(page).toContain('<iframe sandbox="allow-scripts"')
    expect(page).toContain('&lt;meta http-equiv=&quot;Content-Security-Policy&quot;')
    expect(buildExternalPreviewDocument(HTML, { scripts: false })).toContain('<iframe sandbox=""')
  })
})

describe('MSG-3187 · 验收五条（组件面）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('①`.html` 能渲染：有沙箱 iframe（srcdoc 含 CSP＋原文），**不是源码视图**', async () => {
    const loader = vi.fn(async () => bytesOf(HTML)) as unknown as PreviewLoader
    const wrapper = mountPreview(loader)
    await flushPromises()

    const frame = wrapper.find('iframe.hp-frame')
    expect(frame.exists()).toBe(true)
    expect(frame.attributes('sandbox')).toBe('allow-scripts')
    expect(frame.attributes('srcdoc')).toContain('Content-Security-Policy')
    expect(frame.attributes('srcdoc')).toContain('<h1>你好</h1>')
    expect(wrapper.find('.hp-source').exists()).toBe(false)
    expect(wrapper.find('.html-preview').attributes('data-state')).toBe('ready')
  })

  it('②越界文件 ⇒ 拒：取不到字节 ⇒ 无 iframe、人话错误、外开钮禁用', async () => {
    const loader = vi.fn(async () => null) as unknown as PreviewLoader
    const wrapper = mountPreview(loader, '/outside/secret.html')
    await flushPromises()

    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('.hp-error').text()).toContain('预览失败')
    const openBtn = wrapper.findAll('.hp-btn')[1]
    expect(openBtn.attributes('disabled')).toBeDefined()
    // 越界也不得因"交给系统浏览器"而绕过：外开钮不可点 ⇒ 不触发任何外开
    const opened = vi.fn()
    vi.stubGlobal('open', opened)
    await openBtn.trigger('click')
    expect(opened).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('③关脚本 ⇒ 不执行：sandbox 无 allow-scripts 且 CSP script-src none', async () => {
    const loader = vi.fn(async () => bytesOf(HTML)) as unknown as PreviewLoader
    const wrapper = mountPreview(loader)
    await flushPromises()
    await wrapper.find('.hp-toggle input').setValue(false)
    await flushPromises()

    const frame = wrapper.find('iframe.hp-frame')
    expect(frame.attributes('sandbox')).toBe('')
    expect(frame.attributes('data-scripts')).toBe('false')
    expect(frame.attributes('srcdoc')).toContain("script-src 'none'")
  })

  it('④只读：loader 只收 path（无写面）；组件源不含任何写入/外发调用', async () => {
    const loader = vi.fn(async () => bytesOf(HTML)) as unknown as PreviewLoader
    const wrapper = mountPreview(loader)
    await flushPromises()
    expect(loader).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledWith('/ws/site/index.html')

    const src = readFileSync('src/components/ExtensionPanels/files/HtmlPreview.vue', 'utf8')
    for (const writeCall of ['provideKey', 'weknoraSetConfig', 'chatSend', 'permissionRespond']) {
      expect(src).not.toContain(writeCall)
    }
    // 唯一外发面＝外开桥（且只在闸后内容非空时才可能触发）
    expect(src).toContain('openExternal.open')
    expect(wrapper.find('.html-preview').attributes('data-mode')).toBe('render')
  })

  it('⑤失败给人话（不白屏）：错误文案在位，且可切「只读来源」看原文', async () => {
    const loader = vi.fn(async () => null) as unknown as PreviewLoader
    const wrapper = mountPreview(loader)
    await flushPromises()
    expect(wrapper.find('.hp-error').exists()).toBe(true)
    expect(wrapper.find('.hp-error').text().length).toBeGreaterThan(0)
    // 失败态下渲染面为空（不白屏：有错误行 + 工具栏仍在）
    expect(wrapper.find('.hp-bar').exists()).toBe(true)
  })

  it('刷新：同路径重读（loader 再调一次）；只读来源 ⇄ 看渲染 可切', async () => {
    const loader = vi.fn(async () => bytesOf(HTML)) as unknown as PreviewLoader
    const wrapper = mountPreview(loader)
    await flushPromises()

    await wrapper.findAll('.hp-btn')[0].trigger('click')
    await flushPromises()
    expect(loader).toHaveBeenCalledTimes(2)

    const sourceBtn = wrapper.findAll('.hp-btn')[2]
    await sourceBtn.trigger('click')
    expect(wrapper.find('.html-preview').attributes('data-mode')).toBe('source')
    expect(wrapper.find('.hp-source').exists()).toBe(true)
    expect(wrapper.find('iframe').exists()).toBe(false)
    await sourceBtn.trigger('click')
    expect(wrapper.find('.html-preview').attributes('data-mode')).toBe('render')
  })

  it('闸后内容非空才可外开；壳无外开命令 ⇒ 回落新窗，仍开不出 ⇒ 明说（不假装成功）', async () => {
    const loader = vi.fn(async () => bytesOf(HTML)) as unknown as PreviewLoader
    const wrapper = mountPreview(loader)
    await flushPromises()

    const openBtn = wrapper.findAll('.hp-btn')[1]
    expect(openBtn.attributes('disabled')).toBeUndefined()

    const opened = vi.fn(() => null as unknown as Window)
    vi.stubGlobal('open', opened)
    await openBtn.trigger('click')
    await flushPromises()
    expect(opened).toHaveBeenCalled() // 桥失败后回落新窗
    expect(wrapper.find('.hp-hint').text()).toContain('外部打开')
    vi.unstubAllGlobals()
  })

  it('接口未注入（loader undefined）⇒ 诚实降级文案（不白屏）', async () => {
    const wrapper = mountPreview(undefined)
    await flushPromises()
    expect(wrapper.find('.hp-error').text()).toBe(zhCN.files.previewUnavailable)
  })
})
