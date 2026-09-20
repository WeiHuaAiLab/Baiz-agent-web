// MSG-3233 红证：上游挑件移植（只挑评估判定的 5 项）。
// ① classifyFile 后缀归一；② ToolRow 预览型走 FileCard／非预览型走原 .file-ref；
// ③ 骨架屏仅在"加载中且空"时出现；④ 不挑件断言（见讫报 §"不挑件断言输出"，机械 grep）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { classifyFile, basenameOf } from '../src/utils/fileCard'
import ToolRow from '../src/components/chat/ToolRow.vue'
import ChatContent from '../src/components/chat/ChatContent.vue'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const toolMessage = (argsPreview: string) =>
  ({
    id: 'm-t1',
    conversationId: 'c-1',
    kind: 'tool_call' as const,
    text: '',
    createdAt: 1,
    meta: { taskId: 't-1', toolName: 'fs_write', argsPreview, success: true },
  }) as never

describe('MSG-3233 ① classifyFile（纯函数·逐字取上游）', () => {
  it('预览型后缀返回预期 label/color/runnable', () => {
    expect(classifyFile('C:/w/index.html')?.label).toBe('HTML')
    expect(classifyFile('C:/w/index.html')?.runnable).toBe(true)
    expect(classifyFile('C:/w/README.md')?.label).toBe('MD')
    expect(classifyFile('C:/w/README.md')?.language).toBe('markdown')
    expect(classifyFile('C:/w/main.py')?.label).toBe('Py')
    expect(classifyFile('C:/w/lib.rs')).toMatchObject({ label: 'Rust', ext: 'rs', color: '#ce422b' })
    expect(classifyFile('C:/w/a.SVG')?.runnable).toBe(true)
  })

  it('非预览型／无扩展／隐藏文件 ⇒ null（未命中即零侵入）', () => {
    expect(classifyFile('C:/w/data.bin')).toBeNull()
    expect(classifyFile('C:/w/Makefile')).toBeNull()
    expect(classifyFile('C:/w/.gitignore')).toBeNull()
    expect(basenameOf('C:\\w\\a.html')).toBe('a.html')
    expect(basenameOf('C:/w/a.html')).toBe('a.html')
  })
})

describe('MSG-3233 ② ToolRow 三处挂点', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('预览型扩展 ⇒ 渲染 FileCard（不再落 .file-ref）', () => {
    const wrapper = mount(ToolRow, {
      props: { message: toolMessage('{"path":"C:/w/index.html","content":"<h1>hi</h1>"}') },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.file-cards .file-card').exists()).toBe(true)
    expect(wrapper.find('.file-ref').exists()).toBe(false)
    expect(wrapper.find('.file-card-name').text()).toBe('index.html')
    expect(wrapper.find('.file-card-lines').text()).toContain('1 行')
  })

  it('非预览型扩展 ⇒ 保留原 .file-ref 径（最小侵入）', () => {
    const wrapper = mount(ToolRow, {
      props: { message: toolMessage('{"path":"C:/w/data.bin"}') },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.file-cards').exists()).toBe(false)
    expect(wrapper.find('.file-ref').exists()).toBe(true)
    expect(wrapper.find('.file-ref-path').text()).toBe('C:/w/data.bin')
  })
})

describe('MSG-3233 ③ 骨架屏挂点：仅"加载中且空"', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('加载中且无消息 ⇒ 盖骨架；加载完且空 ⇒ 回空态（骨架撤）', async () => {
    const messages = useMessageStore()
    const session = useSessionStore()
    let release: (() => void) | null = null
    vi.spyOn(messages, 'load').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    session.activeId = 'c-skel'
    const wrapper = mount(ChatContent, { global: { plugins: [i18n] } })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.skeleton-chat').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)

    release?.()
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.skeleton-chat').exists()).toBe(false)
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })
})
