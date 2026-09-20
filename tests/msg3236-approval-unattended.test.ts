// MSG-3236 红证：审批通道"无人值守四连"。
// ① 未决卡**在 DOM 中**（脱离虚拟滚动复用）＋稳定 id/data-*；无幽灵卡；
// ② 定位走**组件 API**（scrollToItem）——不直写 scrollTop；
// ③ 计数以 daemon 权威清单＋终态事件**同轮刷新**（不得只增不减）；
// ④ 收件箱遮罩不吃事件（指针透传）＋被拒发送**必有提示**（禁静默）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import { useUiStore } from '../src/stores/ui'
import ChatContent from '../src/components/chat/ChatContent.vue'
import ChatInput from '../src/components/chat/ChatInput.vue'
import ApprovalInbox from '../src/components/ApprovalInbox.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function seedApproval(conversationId: string, requestId: string) {
  const messages = useMessageStore()
  const approvals = useApprovalStore()
  routeFrame(
    {
      event: 'approval.required',
      data: {
        request_id: requestId,
        task_id: 't-1',
        tool_name: 'shell_exec',
        args_preview: '{"command":"npm ci"}',
      },
    },
    messages,
    approvals,
  )
  void conversationId
}

describe('MSG-3236 ① 未决卡常驻 DOM（UIA 可达）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未决卡不入虚拟滚动：常驻区现形＋稳定 id/data-*＋按钮可定位', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const session = useSessionStore()
    session.activeId = 'c-1'
    messages.ensureRun('t-1', 'c-1')
    seedApproval('c-1', 'r-1')
    // 再塞一条普通消息（两类并存时，未决卡仍须在 DOM）
    await messages.push('c-1', {
      id: 'm-1',
      conversationId: 'c-1',
      kind: 'assistant',
      text: '答一句',
      createdAt: 2,
    })

    const wrapper = mount(ChatContent, { global: { plugins: [i18n] } })
    await wrapper.vm.$nextTick()

    const slot = wrapper.find('[data-uia="pending-approval"]')
    expect(slot.exists(), '未决卡须在常驻区（脱离虚拟滚动）').toBe(true)
    expect(slot.attributes('id')).toBe('approval-r-1')
    expect(slot.attributes('data-approval-request-id')).toBe('r-1')
    // 卡内按钮可被 UIA 直接定位（稳定 id/data-uia）
    expect(wrapper.find('#approval-r-1-approve').exists()).toBe(true)
    expect(wrapper.find('[data-uia="approval-deny"]').exists()).toBe(true)
    void approvals
  })

  it('已决卡不再是"未决常驻项"（无幽灵卡）', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const session = useSessionStore()
    session.activeId = 'c-2'
    messages.ensureRun('t-2', 'c-2')
    seedApproval('c-2', 'r-2')
    const wrapper = mount(ChatContent, { global: { plugins: [i18n] } })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-uia="pending-approval"]').exists()).toBe(true)

    routeFrame({ event: 'approval.resolved', data: { request_id: 'r-2', approved: true } }, messages, approvals)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-uia="pending-approval"]').exists()).toBe(false)
  })
})

describe('MSG-3236 ② 定位走组件 API（禁直写 scrollTop）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('ChatContent 源码零 `scrollTop =` 直写，一律 scrollToItem', () => {
    const src = readFileSync('src/components/chat/ChatContent.vue', 'utf8')
    expect(src).not.toMatch(/scrollEl\.scrollTop\s*=/)
    expect(src).toContain('scrollToItem(')
  })

  it('新消息到达 ⇒ 调组件 API 贴底（DynamicScroller 替身记录 scrollToItem 调用）', async () => {
    const messages = useMessageStore()
    const session = useSessionStore()
    session.activeId = 'c-3'
    messages.byConversation['c-3'] = [
      { id: 'm-1', conversationId: 'c-3', kind: 'assistant', text: '一', createdAt: 1 },
    ]
    const calls: number[] = []
    const DynamicScrollerStub = {
      name: 'DynamicScroller',
      props: ['items', 'minItemSize'],
      template: '<div class="message-list"><slot v-for="(item, i) in items" :item="item" :index="i" :active="true" /></div>',
      methods: {
        scrollToItem(index: number) {
          calls.push(index)
        },
      },
    }
    const wrapper = mount(ChatContent, {
      global: {
        plugins: [i18n],
        stubs: { DynamicScroller: DynamicScrollerStub, DynamicScrollerItem: { template: '<div><slot /></div>' } },
      },
    })
    await wrapper.vm.$nextTick()
    await messages.push('c-3', {
      id: 'm-2',
      conversationId: 'c-3',
      kind: 'assistant',
      text: '二',
      createdAt: 2,
    })
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls.length, '贴底须走组件 API scrollToItem').toBeGreaterThan(0)
    expect(calls[calls.length - 1]).toBeGreaterThanOrEqual(0)
  })
})

describe('MSG-3236 ③ 计数同轮刷新（权威清单＋终态）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('终态（已决）⇒ 角标随之下调（旧口径 max 只增不减 ⇒ 陈旧「待办 2」）', () => {
    const approvals = useApprovalStore()
    approvals.pending = [
      { request_id: 'r-1', action: 'shell_exec' },
      { request_id: 'r-2', action: 'fs_write' },
    ]
    approvals.pendingTotal = 2
    expect(approvals.badgeCount).toBe(2)
    approvals.resolve('r-1')
    expect(approvals.pending.length).toBe(1)
    expect(approvals.badgeCount).toBe(1)
  })

  it('权威清单口径：pendingTotal 取 daemon 清单真值（不再 Math.max 只增不减）', () => {
    const src = readFileSync('src/stores/approval.ts', 'utf8')
    expect(src).not.toMatch(/pendingTotal\s*=\s*Math\.max/)
    expect(src).toMatch(/this\.pendingTotal = list\.length/)
  })
})

describe('MSG-3236 ④ 遮罩不吃事件＋发送不静默', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('遮罩指针透传（.inbox-mask pointer-events:none；面板 auto）', () => {
    const css = readFileSync('src/styles/core.css', 'utf8')
    const mask = /\.inbox-mask\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    const panel = /\.inbox-panel\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(mask).toContain('pointer-events: none')
    expect(panel).toContain('pointer-events: auto')
  })

  it('遮罩在途时的发送：不吞（真发出）＋有提示（禁静默）', async () => {
    const ui = useUiStore()
    const messages = useMessageStore()
    const session = useSessionStore()
    session.activeId = 'c-4'
    ui.inboxOpen = true
    const sent: string[] = []
    vi.spyOn(messages, 'sendUserMessage').mockImplementation(async (_c, text) => {
      sent.push(text)
    })
    const wrapper = mount(ChatInput, { global: { plugins: [i18n] } })
    await wrapper.find('textarea, input').setValue('无人值守测试')
    await wrapper.find('textarea, input').trigger('keydown.enter')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(sent).toEqual(['无人值守测试']) // 真发出（不被吞）
    expect(ui.inboxOpen).toBe(false) // 让路：遮罩关闭
    expect(ui.toasts.some((item) => item.message.includes('已关闭待办收件箱'))).toBe(true) // 有提示
  })

  it('收件箱卡：稳定 id/data-*＋新卡到达时聚焦当前卡（元素 API）', async () => {
    const approvals = useApprovalStore()
    const messages = useMessageStore()
    const ui = useUiStore()
    vi.spyOn(messages, 'load').mockResolvedValue(undefined)
    vi.spyOn(approvals, 'loadRules').mockResolvedValue(undefined)
    messages.byConversation['__inbox__'] = [
      {
        id: 'm-a1',
        conversationId: '__inbox__',
        kind: 'approval',
        text: '',
        createdAt: 1,
        meta: { requestId: 'r-9', toolName: 'shell_exec', argsPreview: '{"command":"npm ci"}' },
      },
    ]
    const scrollSpy = vi.fn()
    ;(Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollSpy
    ui.inboxOpen = true
    const inbox = mount(ApprovalInbox, { global: { plugins: [i18n] } })
    await inbox.vm.$nextTick()
    const slot = inbox.find('[data-uia="inbox-approval"]')
    expect(slot.exists()).toBe(true)
    expect(slot.attributes('id')).toBe('inbox-approval-r-9')
    expect(slot.attributes('data-approval-request-id')).toBe('r-9')

    // 新卡到达 ⇒ 走元素 API（scrollIntoView）稳定聚焦当前卡
    messages.byConversation['__inbox__'].push({
      id: 'm-a2',
      conversationId: '__inbox__',
      kind: 'approval',
      text: '',
      createdAt: 2,
      meta: { requestId: 'r-10', toolName: 'fs_write', argsPreview: '{}' },
    })
    await inbox.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(scrollSpy).toHaveBeenCalled()
  })
})
