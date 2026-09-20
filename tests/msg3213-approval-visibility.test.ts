// MSG-3213 P0 红证：**无 conversation_id 的 approval.required 必须产生"看得见的卡"**
// ——现网根因：daemon 的 `approval.required` 只有四字段（`request_id/task_id/tool_name/
// args_preview`，见 crates/daemon/src/protocol.rs:432），**不带 `conversation_id`**；
// 而工具循环的 `task_id`（`t-…`）未必等于前端 run 的键 ⇒ 前端取不到会话归属。
// 旧行为：落 `__inbox__`（聊天里**看不到卡**：老板三次各等 120s ⇒ 零写入）。
// 新行为（本令处方）：**归属为空 ⇒ 回落"当前活动会话"**，卡在聊天里直接可见；
// 显式 `__inbox__` 仍按契约落全局收件箱（不破标准 v1.0 §A1）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { routeFrame } from '../src/client/eventRouter'
import { resetClientForTests } from '../src/client/singleton'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import { INBOX_CONVERSATION_ID } from '../src/client/types'

const writeFrame = (requestId: string, taskId: string, extra: Record<string, unknown> = {}) => ({
  event: 'approval.required',
  data: {
    request_id: requestId,
    task_id: taskId,
    tool_name: 'write_file',
    args_preview: '{"path":"Cargo.toml","content":"…"}',
    ...extra,
  },
})

describe('MSG-3213 P0 · 审批卡可见性（无归属时落当前会话）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('★核心：无 conversation_id 的卡 ⇒ **落当前活动会话**（聊天里看得见）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const session = useSessionStore()
    session.activeId = 'c-active'
    messages.byConversation['c-active'] = []

    // 真机形态：daemon 四字段帧（无 conversation_id；task_id 为工具循环 task）
    routeFrame(writeFrame('toolwrite-t-x-0', 't-x'), messages, approvals)

    const cards = messages.list('c-active').filter((item) => item.kind === 'approval')
    expect(cards).toHaveLength(1)
    expect(cards[0]?.meta?.requestId).toBe('toolwrite-t-x-0')
    // 角标/横幅同源：收件箱入口显示待办数（会话内 banner 据此出现）
    expect(approvals.badgeCount).toBe(1)
    // **两条径同一口径**（eventRouter 侧）：待办项也必须落"有会话归属"一侧，
    // 否则出现"卡在会话里、待办项却在收件箱"的分裂——只修一侧的补丁在此被拒。
    expect(approvals.sessionItems.map((i) => i.request_id)).toEqual(['toolwrite-t-x-0'])
    expect(approvals.inboxItems).toHaveLength(0)
    expect(approvals.sessionItems[0]?.conversationId).toBe('c-active')
  })

  it('有 run（task_id 命中）时优先用 run 的会话（不误落活动会话）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const session = useSessionStore()
    session.activeId = 'c-active'
    messages.byConversation['c-own'] = []
    messages.ensureRun('t-own', 'c-own')

    routeFrame(writeFrame('toolwrite-t-own-0', 't-own'), messages, approvals)

    expect(messages.list('c-own').filter((i) => i.kind === 'approval')).toHaveLength(1)
    expect(messages.list('c-active').filter((i) => i.kind === 'approval')).toHaveLength(0)
  })

  it('无活动会话时回落收件箱（不丢卡）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    useSessionStore().activeId = ''

    routeFrame(writeFrame('toolwrite-t-y-0', 't-y'), messages, approvals)

    expect(
      messages.list(INBOX_CONVERSATION_ID).filter((i) => i.kind === 'approval'),
    ).toHaveLength(1)
  })

  it('**契约不破**：显式 conversation_id="__inbox__" 仍落全局收件箱', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const session = useSessionStore()
    session.activeId = 'c-active'
    messages.byConversation['c-active'] = []

    routeFrame(
      writeFrame('toolwrite-t-z-0', 't-z', { conversation_id: INBOX_CONVERSATION_ID }),
      messages,
      approvals,
    )

    expect(
      messages.list(INBOX_CONVERSATION_ID).filter((i) => i.kind === 'approval'),
    ).toHaveLength(1)
    expect(messages.list('c-active').filter((i) => i.kind === 'approval')).toHaveLength(0)
    expect(approvals.inboxItems.map((i) => i.request_id)).toEqual(['toolwrite-t-z-0'])
  })

  it('显式真实会话 id 仍落该会话（标准 §A1 原义）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.byConversation['c-other'] = []

    routeFrame(writeFrame('toolwrite-t-w-0', 't-w', { conversation_id: 'c-other' }), messages, approvals)

    expect(messages.list('c-other').filter((i) => i.kind === 'approval')).toHaveLength(1)
  })
})
