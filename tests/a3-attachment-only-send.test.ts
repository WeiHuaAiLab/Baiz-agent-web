// A3（1.0.29 体验债丙）：**仅附件可直发**——两态判据（空正文＋有附件 ⇒ 可发／空正文＋无附件 ⇒ 仍禁发）。
//
// 覆盖面＝`ChatInput.vue` 之**两道闸同语义**（`:223` `send()` 与 `:240` `sendWith()`；按钮禁用面 `:538`）。
// 本件为**新增测试件**（不改既有断言）；跑法：`npx vitest run tests/a3-attachment-only-send.test.ts`。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ChatInput from '../src/components/chat/ChatInput.vue'
import { useFilesStore } from '../src/stores/files'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const ATT = {
  id: 'att-a3',
  kind: 'file' as const,
  name: 'a3.txt',
  mimeType: 'text/plain',
  size: 3,
  content: 'abc',
}

function spySend(): Array<{ text?: string; attachments?: unknown[] }> {
  const sent: Array<{ text?: string; attachments?: unknown[] }> = []
  const messages = useMessageStore()
  vi.spyOn(messages, 'sendUserMessage').mockImplementation(
    (async (_c: string, text: string, _m?: unknown, attachments?: unknown[]) => {
      sent.push({ text, attachments })
    }) as never,
  )
  return sent
}

describe('A3 仅附件可直发（1.0.29）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSessionStore().activeId = 'c-a3'
  })

  it('态一：空正文＋有附件 ⇒ 放行（两道闸俱不拦）', async () => {
    const files = useFilesStore()
    files.attachments = [ATT] as never
    const sent = spySend()

    const wrapper = mount(ChatInput, { global: { plugins: [i18n] } })
    const box = wrapper.find('textarea, input')
    await box.setValue('')
    await box.trigger('keydown.enter')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(sent.length, '空正文＋有附件须真发出（未静默吞）').toBe(1)
    expect(sent[0].text).toBe('')
    expect(sent[0].attachments, '附件须随发').toBeTruthy()
  })

  it('态二：空正文＋无附件 ⇒ 仍静默返回（不发）', async () => {
    const files = useFilesStore()
    files.attachments = []
    const sent = spySend()

    const wrapper = mount(ChatInput, { global: { plugins: [i18n] } })
    const box = wrapper.find('textarea, input')
    await box.setValue('')
    await box.trigger('keydown.enter')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(sent.length, '空正文＋无附件须仍禁发').toBe(0)
  })
})
