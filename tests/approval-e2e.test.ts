// 《前端协作标准 v1.0》§E 判据的界面级红证：
// ① 审批连批 ≥20 次：每次卡必现、可点（提交即销）、全程无空等；
// ② `__inbox__` 卡在全局收件箱**可见可点**；待办入口/角标常驻（§C B5）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { INBOX_CONVERSATION_ID } from '../src/client/types'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useUiStore } from '../src/stores/ui'
import ApprovalInbox from '../src/components/ApprovalInbox.vue'
import ChatContent from '../src/components/chat/ChatContent.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

describe('§E1：审批连批 20 次（卡必现·可点·无空等）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('20 连批：20 张卡依次现形、逐张批准、全部销卡，总耗时远小于 120s', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const respond = vi
      .spyOn(getClientSetup().client, 'permissionRespond')
      .mockResolvedValue({ resolved: true, status: 'approved' })

    const startedAt = Date.now()
    const seen: string[] = []

    for (let i = 0; i < 20; i += 1) {
      const requestId = `batch-${i}`
      // 一半有会话归属、一半无来源（`__inbox__`）——两条落点都要通
      const conversationId = i % 2 === 0 ? 'c-batch' : INBOX_CONVERSATION_ID
      routeFrame(
        {
          event: 'approval.required',
          data: {
            request_id: requestId,
            task_id: `t-batch-${i}`,
            tool_name: 'classify_customers',
            args_preview: '{"range":"today"}',
            conversation_id: conversationId,
            pending_total: approvals.pending.length + 1,
            reason: `第 ${i + 1} 张卡：要给今天的客户打标签`,
            risk: i % 2 === 0 ? 'high' : 'medium',
          },
        },
        messages,
        approvals,
      )

      // 卡必现（入队可见）
      expect(approvals.pending.some((item) => item.request_id === requestId)).toBe(true)
      seen.push(requestId)

      // 可点：提交即销（approval.resolved 帧到达后消息转已决态）
      await approvals.respond(requestId, true)
      expect(approvals.pending.some((item) => item.request_id === requestId)).toBe(false)
      routeFrame(
        { event: 'approval.resolved', data: { request_id: requestId, approved: true } },
        messages,
        approvals,
      )
    }

    const elapsed = Date.now() - startedAt
    expect(seen).toHaveLength(20)
    expect(respond).toHaveBeenCalledTimes(20)
    expect(approvals.pending).toHaveLength(0)
    // 无空等：20 连批全程毫秒级（判据红线 120s）
    expect(elapsed).toBeLessThan(5_000)
    // 两条落点都对：会话 10 张、收件箱 10 张
    expect(messages.list('c-batch').filter((item) => item.kind === 'approval')).toHaveLength(10)
    expect(
      messages.list(INBOX_CONVERSATION_ID).filter((item) => item.kind === 'approval'),
    ).toHaveLength(10)
  })
})

describe('§E2／§C B5：__inbox__ 卡在全局收件箱可见可点', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('收件箱面板列出无来源卡，卡上「同意」可点并提交', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const ui = useUiStore()
    const respond = vi
      .spyOn(getClientSetup().client, 'permissionRespond')
      .mockResolvedValue({ resolved: true, status: 'approved' })

    routeFrame(
      {
        event: 'approval.required',
        data: {
          request_id: 'inbox-1',
          task_id: 'sched-9',
          tool_name: 'shell_exec',
          args_preview: '{"command":"cargo test --workspace"}',
          conversation_id: INBOX_CONVERSATION_ID,
          pending_total: 1,
          reason: '定时任务到点要跑一遍全量测试',
          risk: 'high',
        },
      },
      messages,
      approvals,
    )
    ui.openInbox()
    await flushPromises()

    const wrapper = mount(ApprovalInbox, { global: { plugins: [i18n] } })
    await flushPromises()

    // 可见：面板内列出这张卡，且带理由与档位
    const card = wrapper.find('.inbox-card .approval-card')
    expect(card.exists()).toBe(true)
    expect(card.find('.approval-reason').text()).toBe('定时任务到点要跑一遍全量测试')
    expect(card.find('.risk').text()).toBe('高风险')
    // 可点：同意键在、点了就提交
    const approve = card.find('button.approve')
    expect(approve.exists()).toBe(true)
    await approve.trigger('click')
    await flushPromises()
    expect(respond).toHaveBeenCalledWith({ request_id: 'inbox-1', approved: true })
  })

  it('待办入口常驻：有挂起卡即出角标，点开即开收件箱', async () => {
    const approvals = useApprovalStore()
    const ui = useUiStore()
    approvals.upsert({
      request_id: 'inbox-2',
      action: 'shell_exec',
      risk: 'high',
      reason: '定时任务待确认',
      conversationId: INBOX_CONVERSATION_ID,
    })
    approvals.notePendingTotal(3)

    const wrapper = mount(ChatContent, { global: { plugins: [i18n] } })
    await flushPromises()

    const banner = wrapper.find('.approval-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('3')
    expect(ui.inboxOpen).toBe(false)
    await banner.trigger('click')
    expect(ui.inboxOpen).toBe(true)
  })
})
