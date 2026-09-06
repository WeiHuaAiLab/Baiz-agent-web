// MSG-2661（DEBT-541/529/544 合案）Reasoning 帧 UI 回显渲染层红证：
// 流式增量（目④）／终态豁免「（无输出）」（目③）／真无输出不误伤／
// mock 帧源同路（目⑤——routeFrame 统一分发＝三形态结构性一致）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import ChatView from '../src/components/ChatView.vue'
import { router } from '../src/router'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

// 帧构造（照 store/eventRouter 契约）
const reasoningFrame = (taskId: string, reasoning: string) => ({
  event: 'reasoning',
  data: { task_id: taskId, reasoning },
})
const tokenFrame = (taskId: string, token: string) => ({
  event: 'token',
  data: { task_id: taskId, token },
})
const doneFrame = (taskId: string) => ({ event: 'done', data: { task_id: taskId } })
const completedFrame = (taskId: string) => ({
  event: 'task.updated',
  data: { task_id: taskId, status: 'completed' },
})

function mountChat() {
  const messages = useMessageStore()
  const approvals = useApprovalStore()
  const session = useSessionStore()
  const conversationId = 'c-rsn'
  const taskId = 'rsn-1'
  session.activeId = conversationId
  messages.ensureRun(taskId, conversationId)
  const wrapper = mount(ChatView, {
    global: { plugins: [i18n, router] },
  })
  return { messages, approvals, wrapper, conversationId, taskId }
}

// 挂载稳定窗：ChatView onMounted 异步 load（空库覆盖竞态防）——帧前等落定
const settleMount = () => new Promise((resolve) => setTimeout(resolve, 80))

describe('Reasoning 帧 UI 回显', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('目④ 流式期：reasoning 帧增量现形于流式尾——思考区随帧长（两帧拼接）', async () => {
    const { messages, approvals, wrapper, taskId } = mountChat()
    await settleMount()
    routeFrame(reasoningFrame(taskId, '第一步先分析'), messages, approvals)
    await wrapper.vm.$nextTick()
    const block = wrapper.find('.streaming-tail .reasoning-stream')
    expect(block.exists()).toBe(true)
    expect(wrapper.find('.reasoning-stream-head').text()).toContain('思考过程')
    expect(wrapper.find('.reasoning-stream-body').text()).toContain('第一步先分析')

    routeFrame(reasoningFrame(taskId, '，再设计方案'), messages, approvals)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-stream-body').text()).toBe(
      '第一步先分析，再设计方案',
    )
  })

  it('目③ 终态豁免：content 空而 reasoning 有——不再显「（无输出）」——思考块承载输出面', async () => {
    const { messages, approvals, wrapper, taskId } = mountChat()
    await settleMount()
    routeFrame(reasoningFrame(taskId, '深度思考全量内容'), messages, approvals)
    await wrapper.vm.$nextTick()
    routeFrame(doneFrame(taskId), useMessageStore(), approvals)
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 160)) // 收口落定窗
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.no-output').exists()).toBe(false)
    // 诊断断言链：消息收口/run 保留/reasoning 完整
    const store = useMessageStore()
    const assistants = store
      .list('c-rsn')
      .filter((i) => i.kind === 'assistant')
    expect(assistants.length).toBe(1)
    expect(store.runs[taskId].reasoning).toContain('深度思考全量内容')
    // 思考块在（终态折叠——2413 面）；展开可见全量 reasoning
    const thought = wrapper.find('.reasoning-block')
    expect(thought.exists()).toBe(true)
    expect(wrapper.find('.reasoning-block .reasoning-body').exists()).toBe(false)
    await wrapper.find('.reasoning-head').trigger('click')
    expect(wrapper.find('.reasoning-body').text()).toContain('深度思考全量内容')
  })

  it('真无输出不误伤：无正文无思考——「（无输出）」照显', async () => {
    const { messages, approvals, wrapper, taskId } = mountChat()
    routeFrame(doneFrame(taskId), useMessageStore(), approvals)
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 160))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.no-output').exists()).toBe(true)
  })

  it('目⑤ mock 帧源同路：reasoning 与 token 帧并存——正文照渲＋思考区照长（双径不互扰）', async () => {
    const { messages, approvals, wrapper, taskId } = mountChat()
    routeFrame(reasoningFrame(taskId, '边想边写'), messages, approvals)
    routeFrame(tokenFrame(taskId, '你好'), useMessageStore(), approvals)
    routeFrame(tokenFrame(taskId, '，世界'), useMessageStore(), approvals)
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 160)) // token flush 100ms 窗
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.reasoning-stream-body').text()).toContain('边想边写')
    // token 正文照渲（StreamingMarkdownView 区在——run.text 累积）
    const run = useMessageStore().runs[taskId]
    expect(run.text).toBe('你好，世界')
  })
})
