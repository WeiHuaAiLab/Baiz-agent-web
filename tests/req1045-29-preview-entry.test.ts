// REQ-1045-29 预览入口红证（三侧·DOM 取证）：
// ① .html 产物 ⇒ FileCard 现「预览」入口；点击 ⇒ 右侧面板沙箱预览真打开（iframe ready）
// ② 不支持类型（.json）⇒ 点「预览」明示「该类型暂不支持预览」（禁静默无反应）
// ③ 无产物（非文件工具行）⇒ 无 FileCard、无预览入口（不误导）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMockBridge } from '../src/bridge/mock'
import { resetBridgeForTests } from '../src/bridge'
import FileCard from '../src/components/chat/message/FileCard.vue'
import FilesPanel from '../src/components/ExtensionPanels/FilesPanel.vue'
import ToolRow from '../src/components/chat/message/ToolRow.vue'
import { useFilesStore } from '../src/stores/files'
import { useUiStore } from '../src/stores/ui'
import { useWorkingTreeStore } from '../src/stores/workingTree'
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

/** 宿主：产物卡（消息流）＋文件面板（右栏）同树——复现真实布局下的「入口 → 面板」链路 */
const Host = defineComponent({
  props: {
    path: { type: String, required: true },
    content: { type: String, required: true },
  },
  setup(props) {
    return () => h('div', [h(FilesPanel), h(FileCard, { path: props.path, content: props.content })])
  },
})

const toolMessage = (toolName: string, argsPreview: string) =>
  ({
    id: 'm-t1',
    conversationId: 'c-1',
    kind: 'tool_call' as const,
    text: '',
    createdAt: 1,
    meta: { taskId: 't-1', toolName, argsPreview, success: true },
  }) as never

describe('REQ-1045-29 预览入口', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetBridgeForTests(createMockBridge())
  })

  it('① .html 产物：入口出现，点击 ⇒ 右侧面板沙箱预览打开（iframe 真渲染）', async () => {
    const files = useFilesStore()
    const loader = vi.fn(async () => bytesOf(HTML)) as unknown as PreviewLoader
    files.setPreviewLoader(loader)
    const ui = useUiStore()
    ui.setExtensionOpen(false) // 前置关闭——证明预览入口会主动开面板

    const wrapper = mount(Host, {
      props: { path: '/ws/site/index.html', content: HTML },
      global: { plugins: [i18n] },
    })

    const btn = wrapper.find('.file-card-preview')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('预览')

    await btn.trigger('click')
    await flushPromises()

    // 点击 ⇒ 开面板 + 请求落地（入口动作端）
    expect(ui.extensionOpen).toBe(true)
    expect(useWorkingTreeStore().previewRequest?.path).toBe('/ws/site/index.html')
    // 面板真打开：沙箱 iframe（srcdoc 含 CSP＋原文）——「能打开」的 DOM 证
    const panel = wrapper.find('.html-preview')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('data-state')).toBe('ready')
    const frame = wrapper.find('iframe.hp-frame')
    expect(frame.exists()).toBe(true)
    expect(frame.attributes('sandbox')).toBe('allow-scripts')
    expect(frame.attributes('srcdoc')).toContain('<h1>你好</h1>')
    expect(loader).toHaveBeenCalledWith('/ws/site/index.html')
  })

  it('①附 ToolRow 上下文：消息流中的 HTML 产物卡同样带入口', () => {
    const wrapper = mount(ToolRow, {
      props: { message: toolMessage('fs_write', '{"path":"C:/w/index.html","content":"<h1>hi</h1>"}') },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.file-card').exists()).toBe(true)
    expect(wrapper.find('.file-card-preview').exists()).toBe(true)
  })

  it('② 不支持类型（.json）：点「预览」明示「该类型暂不支持预览」（禁静默）', async () => {
    const ui = useUiStore()
    const toastSpy = vi.spyOn(ui, 'toast')
    const working = useWorkingTreeStore()

    const wrapper = mount(FileCard, {
      props: { path: '/ws/data.json', content: '{}' },
      global: { plugins: [i18n] },
    })
    const btn = wrapper.find('.file-card-preview')
    expect(btn.exists()).toBe(true)

    await btn.trigger('click')
    expect(toastSpy).toHaveBeenCalledWith(zhCN.chat.fileCard.previewUnsupported, 'info')
    expect(working.previewRequest).toBeNull() // 不发预览请求（诚实面明确）
  })

  it('③ 无产物（非文件工具行）：无 FileCard、无预览入口（不误导）', () => {
    const wrapper = mount(ToolRow, {
      props: { message: toolMessage('web.search', '{"query":"rss"}') },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.file-card').exists()).toBe(false)
    expect(wrapper.find('.file-card-preview').exists()).toBe(false)
  })
})
