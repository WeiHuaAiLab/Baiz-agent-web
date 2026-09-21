// MSG-3270 P0 红证：附件错配（前端面）——上送件与代理读到内容**逐字节一致**＋上传后回显。
// 真机（ZCode 09:17）：上传 `baiz-attach-test-7749.txt`，代理却读到工作区另一文件。
// 八号组专家裁：``` fence 行内块不可靠（附件正文自带 fence 会提前闭合）⇒ 终局在前端令。
//
// 改前红：行内块用 ``` 围栏（内容自带 fence 即提前闭合）＋**无 sha256**＋`chatSend` 不带结构化
// attachments；上传后界面只显文件名/大小（无首行预览）。
// 改后绿：随机 nonce 信封（fence 免疫）＋结构化 attachments（含 sha256）＋界面首行预览。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import { getClient } from '../src/client/singleton'
import MessageItem from '../src/components/chat/MessageItem.vue'
import { router } from '../src/router'
import { sha256Hex, firstLineOf } from '../src/utils/attachment'
import zhCN from '../src/locales/zh-CN'

vi.mock('../src/client/singleton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/singleton')>()
  return { ...actual, getClient: vi.fn(actual.getClient) }
})

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** A 件：正文含 ``` fence 与 `[附件：` 污染字样——正是"提前闭合/计数污染"的失效面 */
const RAW_A = '附件测试内容：这是 A 件。\n```\nfence 里还有 [附件：伪造] 字样\n```\n尾部标记 END-A'
const RAW_B = 'B 件首行：完全不同的一份。\nEND-B'

const att = (name: string, content: string) => ({
  id: `att-${name}`,
  kind: 'file' as const,
  name,
  mimeType: 'text/plain',
  size: new TextEncoder().encode(content).length,
  content,
})

function captureSend(): Array<{ message?: string; attachments?: Array<{ sha256?: string; name?: string }> }> {
  const captured: Array<{ message?: string; attachments?: Array<{ sha256?: string; name?: string }> }> = []
  vi.mocked(getClient).mockImplementation(
    () =>
      ({
        chatSend: async (params: { message?: string; attachments?: Array<{ sha256?: string; name?: string }> }) => {
          captured.push(params)
          return { task_id: 't-1', status: 'ok', model: 'deepseek-v4-pro' }
        },
      }) as never,
  )
  return captured
}

describe('MSG-3270 ① 上送件与代理读到内容逐字节一致', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('选 A 件 ⇒ 上下文里是 A（逐字节）且带上 A 的 sha256；自带 fence 不得提前闭合信封', async () => {
    const messages = useMessageStore()
    const captured = captureSend()
    await messages.sendUserMessage('c-1', '看这个附件', undefined, [att('A.txt', RAW_A)] as never)

    const sent = captured[0].message ?? ''
    // ① 逐字节：A 全文（含其内部 ``` 与 [附件： 字样）原样在信封内
    expect(sent).toContain(RAW_A)
    expect(sent).toContain('END-A')
    // ② fence 免疫：不再用 ``` 围栏作边界（随机 nonce 信封）
    expect(sent).not.toMatch(/```\n\[附件/)
    expect(sent).toMatch(/-----BEGIN BAIZ-ATT-[\w-]+-----/)
    // ③ 摘要对卯：结构化字段 sha256 ＝ A 正文的 SHA-256
    const expectSha = await sha256Hex(RAW_A)
    expect(captured[0].attachments?.[0]?.sha256).toBe(expectSha)
    expect(captured[0].attachments?.[0]?.name).toBe('A.txt')
    // 信封头也携同值（daemon 侧可对卯）
    expect(sent).toContain(`sha256=${expectSha}`)
  })

  it('③ 连续选不同附件 ⇒ 不串（第二次只含 B 及其 sha）', async () => {
    const messages = useMessageStore()
    const captured = captureSend()
    await messages.sendUserMessage('c-2', '第一份', undefined, [att('A.txt', RAW_A)] as never)
    await messages.sendUserMessage('c-2', '第二份', undefined, [att('B.txt', RAW_B)] as never)

    const second = captured[1].message ?? ''
    expect(second).toContain(RAW_B)
    expect(second).not.toContain('END-A')
    expect(captured[1].attachments?.[0]?.sha256).toBe(await sha256Hex(RAW_B))
    expect(captured[1].attachments?.[0]?.sha256).not.toBe(await sha256Hex(RAW_A))
  })
})

describe('MSG-3270 ② 上传后回显（文件名＋大小＋首行预览）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('用户消息附件 chip 显示 名/大小/首行预览', async () => {
    const messages = useMessageStore()
    const session = useSessionStore()
    session.activeId = 'c-3'
    captureSend()
    await messages.sendUserMessage('c-3', '带附件', undefined, [att('A.txt', RAW_A)] as never)

    const user = messages.list('c-3').find((item) => item.kind === 'user')
    const wrapper = mount(MessageItem, {
      props: { message: user! },
      global: { plugins: [i18n, router] },
    })
    expect(wrapper.find('.att-name').text()).toBe('A.txt')
    expect(wrapper.find('.att-tag').text()).toContain('B')
    expect(wrapper.find('.att-preview').text()).toBe(firstLineOf(RAW_A))
    expect(wrapper.find('.att-preview').text()).toContain('附件测试内容')
  })
})
