// MSG-2413 红证：思考过程折叠块＋工具执行行现形——mock 帧/组件态→现形断言
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { shallowMount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { router } from '../src/router'
import MessageItem from '../src/components/chat/MessageItem.vue'
import ToolRow from '../src/components/chat/ToolRow.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

describe('MSG-2413 思考/执行渲染面', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reasoning 帧真链累积 run.reasoning（累积渲之源）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 't-r1'
    messages.ensureRun(taskId, 'c-1')
    routeFrame(
      { id: 1, event: 'reasoning', data: { task_id: taskId, reasoning: '先看契约' } },
      messages,
      approvals,
    )
    routeFrame(
      { id: 2, event: 'reasoning', data: { task_id: taskId, reasoning: '再查实现' } },
      messages,
      approvals,
    )
    expect(messages.runs[taskId]?.reasoning).toBe('先看契约再查实现')
  })

  it('MessageItem 思考折叠块：深度思考现形→默认收起→点击展开 reasoning 文本', async () => {
    const messages = useMessageStore()
    const taskId = 't-r2'
    const conversationId = 'c-2'
    messages.byConversation[conversationId] = [
      {
        id: 'm1',
        conversationId,
        kind: 'assistant',
        text: '已完成',
        createdAt: 1,
        meta: { taskId },
      },
    ]
    messages.runs[taskId] = {
      taskId,
      conversationId,
      status: 'completed',
      startedAt: 1,
      reasoning: '内部推演：先 A 后 B',
      text: '已完成',
      trace: [],
    }
    const wrapper = shallowMount(MessageItem, {
      props: { message: messages.byConversation[conversationId][0] },
      global: { plugins: [i18n, router] },
    })
    const head = wrapper.find('.reasoning-head')
    expect(head.exists()).toBe(true)
    expect(head.text()).toContain('深度思考')
    // 默认收起：body 不现形
    expect(wrapper.find('.reasoning-body').exists()).toBe(false)
    await head.trigger('click')
    expect(wrapper.find('.reasoning-body').text()).toContain('先 A 后 B')
  })

  it('ToolRow 执行行：shell 命令 $ 现形（跑了什么逐项现形）', () => {
    const wrapper = shallowMount(ToolRow, {
      props: {
        message: {
          id: 't1',
          conversationId: 'c',
          kind: 'tool_call',
          text: 'ok',
          createdAt: 1,
          meta: {
            taskId: 't-x',
            toolName: 'shell_exec',
            argsPreview: '{"command":"cargo test --lib"}',
          },
        } as never,
      },
      global: { plugins: [i18n] },
    })
    const cmd = wrapper.find('.tool-cmd')
    expect(cmd.exists()).toBe(true)
    expect(cmd.text()).toContain('$ cargo test --lib')
  })

  it('ToolRow 执行行：文件工具 path 现形＋URL 工具 ↗ 现形', () => {
    const file = shallowMount(ToolRow, {
      props: {
        message: {
          id: 'f1',
          conversationId: 'c',
          kind: 'tool_call',
          text: '',
          createdAt: 1,
          meta: { taskId: 't-f', toolName: 'fs_read', argsPreview: '{"path":"C:/a/b.rs"}' },
        } as never,
      },
      global: { plugins: [i18n] },
    })
    expect(file.find('.file-ref-path').text()).toContain('C:/a/b.rs')

    const url = shallowMount(ToolRow, {
      props: {
        message: {
          id: 'u1',
          conversationId: 'c',
          kind: 'tool_call',
          text: '',
          createdAt: 1,
          meta: { taskId: 't-u', toolName: 'web_fetch', argsPreview: '{"url":"https://kb.ruiac.net/"}' },
        } as never,
      },
      global: { plugins: [i18n] },
    })
    expect(url.find('.tool-cmd').text()).toContain('https://kb.ruiac.net/')
  })
})
