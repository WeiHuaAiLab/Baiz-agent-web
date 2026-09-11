// MSG-2998 修②（DEBT-544 目二）三分离渲染红证：
// 思考（reasoning）／执行命令（tool.call）／执行结果（tool.result）三类
// 分开展示——渲染归组（run.trace 已有有序事件），非协议重造。
// 红证面：三类分组各渲染一枚（流式态）＋终态气泡同构图。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import ChatView from '../src/components/ChatView.vue'
import MessageItem from '../src/components/chat/MessageItem.vue'
import RunBlocks from '../src/components/chat/RunBlocks.vue'
import { router } from '../src/router'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

// 六型帧谱（568 在案）：text/token、reasoning、tool.call、tool.result 俱备
const tokenFrame = (taskId: string, token: string) => ({
  event: 'token',
  data: { task_id: taskId, token },
})
const reasoningFrame = (taskId: string, reasoning: string) => ({
  event: 'reasoning',
  data: { task_id: taskId, reasoning },
})
const toolCallFrame = (taskId: string, callId: string, toolName: string, argsPreview: string) => ({
  event: 'tool.call',
  data: { task_id: taskId, call_id: callId, tool_name: toolName, args_preview: argsPreview },
})
const toolResultFrame = (
  taskId: string,
  callId: string,
  success: boolean,
  preview: string,
) => ({
  event: 'tool.result',
  data: { task_id: taskId, call_id: callId, success, preview },
})

function mountChat() {
  const messages = useMessageStore()
  const approvals = useApprovalStore()
  const session = useSessionStore()
  const conversationId = 'c-split'
  const taskId = 'split-1'
  session.activeId = conversationId
  messages.ensureRun(taskId, conversationId)
  const wrapper = mount(ChatView, {
    global: { plugins: [i18n, router] },
  })
  return { messages, approvals, wrapper, conversationId, taskId }
}

describe('MSG-2998 修② 三分离渲染（流式态）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('思考帧 → 思考分组现形（一枚）', async () => {
    const { messages, approvals, wrapper, conversationId, taskId } = mountChat()
    routeFrame(reasoningFrame(taskId, '先看目录结构') as never, messages, approvals)
    await wrapper.vm.$nextTick()
    const block = wrapper.find('.run-block.thinking')
    expect(block.exists()).toBe(true)
    expect(block.text()).toContain('先看目录结构')
    void conversationId
  })

  it('tool.call 帧 → 执行命令分组现形（一枚，与结果分组分离）', async () => {
    const { messages, approvals, wrapper, taskId } = mountChat()
    routeFrame(
      toolCallFrame(taskId, 'call_01', 'shell_exec', '{"command":"git status"}') as never,
      messages,
      approvals,
    )
    await wrapper.vm.$nextTick()
    const cmdBlock = wrapper.find('.run-block.commands')
    expect(cmdBlock.exists()).toBe(true)
    expect(cmdBlock.text()).toContain('shell_exec')
    // 分离钉：命令帧不得混入结果分组
    expect(wrapper.find('.run-block.results').exists()).toBe(false)
  })

  it('tool.result 帧 → 执行结果分组现形（一枚，与命令分组分离）', async () => {
    const { messages, approvals, wrapper, taskId } = mountChat()
    routeFrame(toolCallFrame(taskId, 'call_02', 'read_file', '{"path":"a.rs"}') as never, messages, approvals)
    routeFrame(toolResultFrame(taskId, 'call_02', true, 'fn main() {}') as never, messages, approvals)
    await wrapper.vm.$nextTick()
    const resBlock = wrapper.find('.run-block.results')
    expect(resBlock.exists()).toBe(true)
    expect(resBlock.text()).toContain('fn main() {}')
    // 分离钉：命令仍在命令分组（各自一枚）
    const cmdBlock = wrapper.find('.run-block.commands')
    expect(cmdBlock.exists()).toBe(true)
    expect(cmdBlock.text()).toContain('read_file')
  })

  it('三类同帧 → 三分组齐在（各一枚，互不混入）', async () => {
    const { messages, approvals, wrapper, taskId } = mountChat()
    routeFrame(reasoningFrame(taskId, '思考中：检查依赖') as never, messages, approvals)
    routeFrame(toolCallFrame(taskId, 'call_03', 'list_dir', '{"path":"."}') as never, messages, approvals)
    routeFrame(toolResultFrame(taskId, 'call_03', false, '目录不存在') as never, messages, approvals)
    routeFrame(tokenFrame(taskId, '正文输出') as never, messages, approvals)
    await wrapper.vm.$nextTick()
    const thinking = wrapper.find('.run-block.thinking')
    const commands = wrapper.find('.run-block.commands')
    const results = wrapper.find('.run-block.results')
    expect(thinking.exists()).toBe(true)
    expect(commands.exists()).toBe(true)
    expect(results.exists()).toBe(true)
    // 分域钉：思考文本只在思考区；命令只在命令区；结果只在结果区
    expect(thinking.text()).toContain('思考中：检查依赖')
    expect(thinking.text()).not.toContain('list_dir')
    expect(commands.text()).toContain('list_dir')
    expect(commands.text()).not.toContain('目录不存在')
    expect(results.text()).toContain('目录不存在')
  })
})

describe('MSG-3001 补修（②⑤⑪ 组件三面）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('② 失败 run：思考/trace 同显（status 错误条径——窄化门回归修）', async () => {
    const messages = useMessageStore()
    const conversationId = 'c-fail'
    const taskId = 'fail-1'
    messages.byConversation[conversationId] = [
      {
        id: 'm-fail',
        conversationId,
        kind: 'status',
        text: '发送失败：请求失败',
        createdAt: 1,
        meta: { statusKey: 'sendFailed', status: 'error', taskId },
      },
    ]
    messages.runs[taskId] = {
      taskId,
      conversationId,
      status: 'failed',
      startedAt: 1,
      reasoning: '失败前的思考',
      text: '',
      trace: [
        { kind: 'tool.call', callId: 'cf1', toolName: 'fs_read', argsPreview: '{}', at: 2 },
      ],
    }
    const wrapper = mount(MessageItem, {
      props: { message: messages.byConversation[conversationId][0] },
      global: { plugins: [i18n, router] },
    })
    // 修前：kind 门窄化（assistant-only）→ 失败径三区俱不渲（旧件 kind-agnostic 可渲）
    expect(wrapper.find('.run-block.thinking').exists()).toBe(true)
    expect(wrapper.find('.run-block.commands').exists()).toBe(true)
  })

  it('⑤ 命令/结果区默认收起（解 ToolRow×RunBlocks 双渲）＋点击展开', async () => {
    const run = {
      taskId: 't-fold',
      conversationId: 'c-fold',
      status: 'completed',
      startedAt: 1,
      reasoning: '',
      text: '',
      trace: [
        { kind: 'tool.call' as const, callId: 'k1', toolName: 'shell_exec', argsPreview: '{"a":1}', at: 1 },
        { kind: 'tool.result' as const, callId: 'k1', success: true, preview: 'ok', at: 2 },
      ],
    }
    const wrapper = mount(RunBlocks, { props: { run }, global: { plugins: [i18n] } })
    const cmdList = wrapper.find('.run-block.commands .block-list').element as HTMLElement
    const resList = wrapper.find('.run-block.results .block-list').element as HTMLElement
    // 默认收起：不与他面（ToolRow 条目）重复呈现
    expect(cmdList.style.display).toBe('none')
    expect(resList.style.display).toBe('none')
    // 点击展开：总览按需现形
    await wrapper.find('.run-block.commands .block-head').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 10))
    const opened = wrapper.find('.run-block.commands .block-list').element as HTMLElement
    expect(opened.style.display).toBe('')
  })

  it('⑪ 结果行补 toolName/callId——乱序回包不误归属', async () => {
    const run = {
      taskId: 't-order',
      conversationId: 'c-order',
      status: 'completed',
      startedAt: 1,
      reasoning: '',
      text: '',
      // 乱序：先 call A、call B，再 result B、result A（并行回包）
      trace: [
        { kind: 'tool.call' as const, callId: 'a1', toolName: 'fs_read', argsPreview: '{}', at: 1 },
        { kind: 'tool.call' as const, callId: 'b1', toolName: 'fs_write', argsPreview: '{}', at: 2 },
        { kind: 'tool.result' as const, callId: 'b1', success: true, preview: '写入完成', at: 3 },
        { kind: 'tool.result' as const, callId: 'a1', success: false, preview: '读失败', at: 4 },
      ],
    }
    const wrapper = mount(RunBlocks, { props: { run }, global: { plugins: [i18n] } })
    await wrapper.find('.run-block.results .block-head').trigger('click')
    const items = wrapper.findAll('.run-block.results .result-item')
    expect(items.length).toBe(2)
    // 归属钉：result(b1) 行须标 fs_write（勿按序错配 fs_read）
    expect(items[0].text()).toContain('fs_write')
    expect(items[0].text()).toContain('写入完成')
    expect(items[1].text()).toContain('fs_read')
    expect(items[1].text()).toContain('读失败')
  })
})

describe('MSG-2998 修② 三分离渲染（终态气泡同构图）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('终态 assistant 消息内三分组俱在（与流式同构）', async () => {
    const { messages, approvals, taskId, conversationId } = mountChat()
    routeFrame(reasoningFrame(taskId, '终态思考') as never, messages, approvals)
    routeFrame(toolCallFrame(taskId, 'call_04', 'fs_read', '{"path":"b.rs"}') as never, messages, approvals)
    routeFrame(toolResultFrame(taskId, 'call_04', true, '内容预览') as never, messages, approvals)
    routeFrame({ event: 'done', data: { task_id: taskId } } as never, messages, approvals)
    await Promise.resolve()

    const run = messages.runs[taskId]
    const assistant = messages
      .list(conversationId)
      .find((m) => m.kind === 'assistant')
    expect(assistant).toBeTruthy()
    const wrapper = mount(MessageItem, {
      props: { message: assistant! },
      global: { plugins: [i18n, router] },
    })
    await wrapper.vm.$nextTick()
    const root = wrapper.find('.msg.assistant')
    expect(root.exists()).toBe(true)
    expect(root.find('.run-block.thinking').exists()).toBe(true)
    expect(root.find('.run-block.commands').exists()).toBe(true)
    expect(root.find('.run-block.results').exists()).toBe(true)
    expect(run.trace.length).toBeGreaterThanOrEqual(3)
  })
})
