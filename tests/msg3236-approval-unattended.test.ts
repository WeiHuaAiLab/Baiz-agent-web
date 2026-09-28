// MSG-3236 红证：审批通道"无人值守四连"。
// ① 未决卡**可达**＋稳定 id/data-*（**UIA 契约**）；无幽灵卡；
// ② 定位走**组件 API**（scrollToItem）——不直写 scrollTop；
// ③ 计数以 daemon 权威清单＋终态事件**同轮刷新**（不得只增不减）；
// ④ 收件箱遮罩不吃事件（指针透传）＋被拒发送**必有提示**（禁静默）。
//
// ── ① 口径迁移之由（2026-09-28·参谋5 裁①·**非废弃，是换承载者**）────────────────
// 原判据：「未决卡**常驻 ChatContent 的 DOM**（脱离虚拟滚动复用）＋稳定 id/data-*」，
// 断言点在 ChatContent 常驻区的孤儿 ApprovalStack 容器上。
// 冲突：老板④「**隐藏未决审批卡**」（commit 85921e5 已把该容器注释下线）——原判据
// 与老板④**直接相抵**，测试即红（本席实跑复现：line 90 expected true received false）。
// 老板另有第④条落点：「**审核卡移到输入框上方**」（ChatInput.vue:417-418 接线注释、
// commit b48f03d／81ca112 引入 ApprovalConfirmBar.vue）。
// 故①之「UIA 可达」判据**迁移**为**输入区上方那张审批卡**（ApprovalConfirmBar）**可达**：
//   · 稳定 id/data-* 契约**在输入区卡上继续成立**（前缀 `approval-bar-`，与消息流径的
//     `approval-<requestId>` 同屏共存而不撞 id）；
//   · 「已决卡不再是未决可达项／无幽灵卡」半条**保留**（迁到同一承载者上断言——
//     若留在 ChatContent 上，该半条会因孤儿容器已下线而**恒真**，正是本席所禁）。
// **未废弃**：原要求（未决审批卡可被 UIA 稳定定位）仍须成立，只是由输入区卡承接。
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

/** 播种一条未决审批帧。**注意耦合**：帧内 `task_id` 恒为 `'t-1'`——
 *  输入区卡（ApprovalConfirmBar）有「幽灵过滤」（run 不在内存即隐藏），
 *  故调用方 `ensureRun` 的 taskId 必须同为 `'t-1'` 才可达。 */
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

describe('MSG-3236 ① 未决卡可达（承载者＝输入区上方审批卡·口径迁移）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未决卡可达输入区上方审批卡：稳定 id/data-*＋按钮可定位', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const session = useSessionStore()
    session.activeId = 'c-1'
    messages.ensureRun('t-1', 'c-1')
    seedApproval('c-1', 'r-1')
    // 再塞一条普通消息（两类并存时，未决卡仍须可达）
    await messages.push('c-1', {
      id: 'm-1',
      conversationId: 'c-1',
      kind: 'assistant',
      text: '答一句',
      createdAt: 2,
    })

    // 挂**输入区本体**（非单独挂 ApprovalConfirmBar）——顺带证明接线成立：
    // 卡确在 .chat-input 内、composer 之前（"输入区之上"）
    const wrapper = mount(ChatInput, { global: { plugins: [i18n] } })
    await wrapper.vm.$nextTick()

    const slot = wrapper.find('[data-uia="pending-approval-bar"]')
    expect(slot.exists(), '未决卡须在输入区上方审批卡（老板④落点）').toBe(true)
    expect(slot.attributes('id')).toBe('approval-bar-r-1')
    expect(slot.attributes('data-approval-request-id')).toBe('r-1')
    // 卡内按钮可被 UIA 直接定位（稳定 id/data-uia）
    expect(wrapper.find('#approval-bar-r-1-approve').exists()).toBe(true)
    expect(wrapper.find('[data-uia="approval-bar-deny"]').exists()).toBe(true)
    // 位置钉死：审批卡在 composer（输入区本体）**之前**
    const confirmEl = wrapper.find('.approval-confirm').element
    const composerEl = wrapper.find('form.composer').element
    expect(
      confirmEl.compareDocumentPosition(composerEl) & Node.DOCUMENT_POSITION_FOLLOWING,
      '审批卡须居于输入框之上',
    ).toBeTruthy()
    void approvals
  })

  it('已决卡不再是"未决可达项"（无幽灵卡）', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const session = useSessionStore()
    session.activeId = 'c-2'
    // taskId 须与 seedApproval 帧内 task_id 一致（'t-1'）：否则 run 不在内存，
    // 输入区卡按幽灵过滤隐藏 ⇒ 前置断言不可达（原 case 2 用 't-2' 的错配即此）
    messages.ensureRun('t-1', 'c-2')
    seedApproval('c-2', 'r-2')
    const wrapper = mount(ChatInput, { global: { plugins: [i18n] } })
    await wrapper.vm.$nextTick()
    // 前置：未决 ⇒ 可达（否则下面的"消失"会因从未出现过而**恒真**）
    expect(wrapper.find('[data-uia="pending-approval-bar"]').exists()).toBe(true)

    routeFrame({ event: 'approval.resolved', data: { request_id: 'r-2', approved: true } }, messages, approvals)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-uia="pending-approval-bar"]').exists()).toBe(false)
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
