// MSG-3503 A10（DEBT-874／测试员 T9「搜索很慢·几十秒」）红证：**取件在途可见**
// ①web_fetch 在途（tool.call 行·success 未定）⇒ 显「正在抓取网页…」（不再静止）
// ②结果行（tool.result）⇒ 在途人话消失，正文（daemon 侧 `[取件 X.Xs／上界 Ns]`）上屏
// ③非 web_fetch 工具 ⇒ **不**出该在途人话（零扩散）
import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ToolRow from '../src/components/chat/message/ToolRow.vue'
import zhCN from '../src/locales/zh-CN'
import type { ChatMessage } from '../src/models'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function msg(meta: Record<string, unknown>, text = ''): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    kind: 'tool_call',
    text,
    createdAt: Date.now(),
    meta: meta as ChatMessage['meta'],
  }
}

function mountRow(message: ChatMessage) {
  return mount(ToolRow, {
    props: { message },
    global: { plugins: [i18n, createPinia()] },
  })
}

describe('MSG-3503 A10 · web_fetch 取件在途可见', () => {
  it('①在途（success 未定）⇒ 显「正在抓取网页…」＋ URL', () => {
    const w = mountRow(
      msg({
        taskId: 't1',
        callId: 'c1',
        toolName: 'web_fetch',
        argsPreview: '{"url":"https://example.com/"}',
      }),
    )
    expect(w.find('.tool-hint').exists()).toBe(true)
    expect(w.find('.tool-hint').text()).toContain('正在抓取网页')
    expect(w.text()).toContain('https://example.com/')
  })

  it('②结果行 ⇒ 在途人话消失、耗时/上界正文上屏', () => {
    const w = mountRow(
      msg(
        {
          taskId: 't1',
          callId: 'c1',
          toolName: 'web_fetch',
          argsPreview: '{"url":"https://example.com/"}',
          success: true,
        },
        '[取件 0.7s／上界 8s]\nExample Domain …',
      ),
    )
    expect(w.find('.tool-hint').exists()).toBe(false)
    expect(w.find('.tool-preview').text()).toContain('[取件 0.7s／上界 8s]')
  })

  it('③非 web_fetch 工具 ⇒ 不出该人话（零扩散）', () => {
    const w = mountRow(
      msg({ taskId: 't1', callId: 'c1', toolName: 'shell_exec', argsPreview: '{"command":"ls"}' }),
    )
    expect(w.find('.tool-hint').exists()).toBe(false)
  })
})
