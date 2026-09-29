// ApprovalConfirmBar（ChatInput 顶部待审批栏）红证：**已产生结果的审批卡必须隐藏**。
//
// 病灶：栏的旧数据源只看 `meta.approved`（等 daemon 推 approval.resolved 回执帧才摘卡）。
// `approvals.respond()` 成功后 IPC 已被服务端受理、结果只是早晚——但回执帧迟到/丢失
// （断流、重连窗口、daemon 只推给别的订阅端）时 `meta.approved` 永不落定 ⇒ 卡滞留
// 在栏里且按钮仍可点（重复提交一张已决卡）。
//
// 修后口径：request 已不在 `approvals.pending`（respond 受理即摘 / 对账收口）⇒ 隐藏。
// 三判据：
// ① 基线不破：待决卡在活 run 上照常显示；
// ② 核心：respond 受理成功、回执帧**未达** ⇒ 卡立即隐藏；
// ③ 旧路径：回执帧到达（meta.approved 落定）⇒ 照旧隐藏。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import ApprovalConfirmBar from '../src/components/chat/ApprovalConfirmBar.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 造一张活卡：活 run + approval.required 帧（消息面与 approvals.pending 同时入列） */
function seedCard(requestId: string, taskId: string): void {
  const messages = useMessageStore()
  const approvals = useApprovalStore()
  messages.ensureRun(taskId, 'c-bar')
  routeFrame(
    {
      event: 'approval.required',
      data: {
        request_id: requestId,
        task_id: taskId,
        tool_name: 'shell_exec',
        args_preview: '{"command":"cargo test"}',
        conversation_id: 'c-bar',
        pending_total: 1,
        reason: '要跑一遍全量测试',
        risk: 'high',
      },
    },
    messages,
    approvals,
  )
}

function mountBar() {
  return mount(ApprovalConfirmBar, { global: { plugins: [i18n] } })
}

describe('ApprovalConfirmBar：已产生结果的审批卡隐藏', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    useSessionStore().activeId = 'c-bar'
  })

  it('① 基线：待决卡在活 run 上照常显示（修不破原有可批面）', () => {
    seedCard('req-1', 't-1')
    const wrapper = mountBar()
    expect(wrapper.find('.approval-confirm').exists()).toBe(true)
    expect(wrapper.findAll('.approval-confirm-row')).toHaveLength(1)
  })

  it('② respond 受理成功、回执帧未达 ⇒ 卡立即隐藏（核心判据）', async () => {
    seedCard('req-2', 't-2')
    vi.spyOn(getClientSetup().client, 'permissionRespond').mockResolvedValue({
      resolved: true,
      status: 'approved',
    })
    const approvals = useApprovalStore()
    const messages = useMessageStore()

    await approvals.respond('req-2', true)
    // 旧口径病灶自证：回执帧未达 ⇒ meta.approved 仍是 undefined
    const card = messages.list('c-bar').find((m) => m.kind === 'approval')
    expect(card?.meta?.approved).toBeUndefined()
    // pending 清单已摘除（IPC 受理）
    expect(approvals.pending.some((p) => p.request_id === 'req-2')).toBe(false)

    const wrapper = mountBar()
    expect(wrapper.find('.approval-confirm').exists()).toBe(false)
  })

  it('③ 回执帧到达（approval.resolved 落 meta.approved）⇒ 照旧隐藏', () => {
    seedCard('req-3', 't-3')
    routeFrame(
      { event: 'approval.resolved', data: { request_id: 'req-3', approved: true } },
      useMessageStore(),
      useApprovalStore(),
    )
    const wrapper = mountBar()
    expect(wrapper.find('.approval-confirm').exists()).toBe(false)
  })
})
