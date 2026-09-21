// 《前端协作标准 v1.0》契约红证（§A1／§B／§C／§E）：
// ① 帧字段收全（含 `__inbox__` 落全局收件箱，不丢）；② 档位真实（无假 medium）；
// ③ `scope` 回填（一次＝不建规则）；④ 重连补拉（permission.pending）不丢卡；
// ⑤ mock 全链路：一次照弹／本会话不弹／撤销后必重弹；
// ⑥ 人话摘要（无裸 JSON／无内部术语）；⑦ 队列条（queued／position ＋ 单条取消）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { INBOX_CONVERSATION_ID } from '../src/client/types'
import { demoHandle } from '../src/demo/script'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import ApprovalCard from '../src/components/chat/ApprovalCard.vue'
import { humanizeArgs } from '../src/utils/approvalText'
import zhCN from '../src/locales/zh-CN'
import type { ApprovalRule } from '../src/client/types'
import type { MessageMeta } from '../src/models'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const rpc = (method: string, params?: unknown) => ({ jsonrpc: '2.0' as const, id: 1, method, params })

function approvalFrames(res: ReturnType<typeof demoHandle>) {
  return (res?.frames ?? []).filter((frame) => frame.event === 'approval.required')
}

function frameData<T>(frame: { data?: unknown }): T {
  return frame.data as T
}

describe('§A1／§C B5：__inbox__ 卡落全局收件箱（不丢）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('无会话来源的卡进收件箱会话，且卡上带 reason／档位', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()

    routeFrame(
      {
        event: 'approval.required',
        data: {
          request_id: 'ri-1',
          task_id: 'sched-1',
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

    const inbox = messages.list(INBOX_CONVERSATION_ID)
    expect(inbox).toHaveLength(1)
    expect(inbox[0]?.kind).toBe('approval')
    expect(inbox[0]?.meta?.reason).toBe('定时任务到点要跑一遍全量测试')
    expect(inbox[0]?.meta?.risk).toBe('high')
    expect(inbox[0]?.meta?.inbox).toBe(true)
    // 收件箱分区命中；会话内分区为空
    expect(approvals.inboxItems.map((item) => item.request_id)).toEqual(['ri-1'])
    expect(approvals.sessionItems).toHaveLength(0)
  })

  it('有会话归属的卡落原会话（不进收件箱）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-sess', 'c-sess')

    routeFrame(
      {
        event: 'approval.required',
        data: {
          request_id: 'rs-1',
          task_id: 't-sess',
          tool_name: 'classify_customers',
          args_preview: '{"range":"today"}',
          conversation_id: 'c-sess',
          reason: '要给今天的客户打标签',
          risk: 'medium',
        },
      },
      messages,
      approvals,
    )

    expect(messages.list('c-sess').filter((item) => item.kind === 'approval')).toHaveLength(1)
    expect(messages.list(INBOX_CONVERSATION_ID)).toHaveLength(0)
    expect(approvals.sessionItems.map((item) => item.request_id)).toEqual(['rs-1'])
  })
})

describe('§C B8：档位真实（任何路径都不出现假 medium）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('补拉失败：卡与消息档位钉为 unknown，不冒充 medium', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    routeFrame(
      {
        event: 'approval.required',
        data: {
          request_id: 'rk-1',
          task_id: 'sched-2',
          tool_name: 'shell_exec',
          args_preview: '{"command":"rm -rf build"}',
          conversation_id: INBOX_CONVERSATION_ID,
          reason: '要清掉构建产物',
        },
      },
      messages,
      approvals,
    )
    expect(approvals.pending[0]?.risk).toBeUndefined()

    vi.spyOn(getClientSetup().client, 'permissionPending').mockRejectedValue(new Error('net down'))
    const ok = await approvals.syncPending()

    expect(ok).toBe(false)
    expect(approvals.pending[0]?.risk).toBe('unknown')
    expect(messages.list(INBOX_CONVERSATION_ID)[0]?.meta?.risk).toBe('unknown')
    expect(messages.list(INBOX_CONVERSATION_ID)[0]?.meta?.risk).not.toBe('medium')
  })
})

describe('§B／§C B3：scope 回填（一次＝不建规则）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('「一次」不带 scope、「本会话」带 scope=session', async () => {
    const approvals = useApprovalStore()
    const respond = vi
      .spyOn(getClientSetup().client, 'permissionRespond')
      .mockResolvedValue({ resolved: true, status: 'approved' })

    await approvals.respond('r-once', true, 'once')
    expect(respond).toHaveBeenLastCalledWith({ request_id: 'r-once', approved: true })

    await approvals.respond('r-session', true, 'session')
    expect(respond).toHaveBeenLastCalledWith({
      request_id: 'r-session',
      approved: true,
      scope: 'session',
    })
  })
})

describe('§C B6：重连补拉（permission.pending）不丢卡', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('补拉回来的卡入队并回填真实档位到卡面', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r-back', action: 'shell_exec' })
    routeFrame(
      {
        event: 'approval.required',
        data: {
          request_id: 'r-back',
          task_id: 'sched-3',
          tool_name: 'shell_exec',
          args_preview: '{"command":"cargo test"}',
          conversation_id: INBOX_CONVERSATION_ID,
          reason: '断线期间产生的卡',
        },
      },
      messages,
      approvals,
    )

    vi.spyOn(getClientSetup().client, 'permissionPending').mockResolvedValue({
      pending: [
        {
          request_id: 'r-back',
          action: 'shell_exec',
          risk: 'high',
          details: '{"command":"cargo test"}',
          reason: '断线期间产生的卡',
          conversation_id: INBOX_CONVERSATION_ID,
          created_at: new Date().toISOString(),
        },
      ],
    })

    const ok = await approvals.syncPending()

    expect(ok).toBe(true)
    expect(approvals.pending.find((item) => item.request_id === 'r-back')?.risk).toBe('high')
    expect(messages.list(INBOX_CONVERSATION_ID)[0]?.meta?.risk).toBe('high')
  })
})

describe('§E 判据④：mock 全链路——一次照弹／本会话不弹／撤销后必重弹', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    // 清干净 mock 台账：规则全撤、挂起卡全决
    const rules = (demoHandle(rpc('approval.rules'))?.result ?? []) as ApprovalRule[]
    for (const rule of rules) demoHandle(rpc('approval.revoke', { rule_id: rule.rule_id }))
    const pending = (
      demoHandle(rpc('permission.pending'))?.result as { pending: Array<{ request_id: string }> }
    )?.pending
    for (const item of pending ?? []) {
      demoHandle(rpc('permission.respond', { request_id: item.request_id, approved: true }))
    }
  })

  const send = (message: string) =>
    demoHandle(rpc('chat.send', { message, conversation_id: 'c-e2e' }))

  it('默认「一次」第二次照弹；选「本会话」第二次不弹；approval.revoke 后必重弹', () => {
    // 第一次：默认「一次」——批准但不落规则
    const first = approvalFrames(send('第一次'))
    expect(first).toHaveLength(1)
    const firstCard = frameData<{ request_id: string }>(first[0])
    demoHandle(rpc('permission.respond', { request_id: firstCard.request_id, approved: true }))

    // 第二次：同类照弹（一次＝不建规则）
    const second = approvalFrames(send('第二次'))
    expect(second).toHaveLength(1)
    const secondCard = frameData<{ request_id: string }>(second[0])

    // 选「本会话」批准 ⇒ 落规则
    demoHandle(
      rpc('permission.respond', {
        request_id: secondCard.request_id,
        approved: true,
        scope: 'session',
      }),
    )
    const rules = (demoHandle(rpc('approval.rules'))?.result ?? []) as ApprovalRule[]
    expect(rules).toHaveLength(1)
    expect(rules[0]?.scope).toBe('session')

    // 第三次：同类不弹
    expect(approvalFrames(send('第三次'))).toHaveLength(0)

    // 撤销规则 ⇒ 必重弹
    demoHandle(rpc('approval.revoke', { rule_id: rules[0]!.rule_id }))
    expect(((demoHandle(rpc('approval.rules'))?.result ?? []) as ApprovalRule[]).length).toBe(0)
    expect(approvalFrames(send('第四次'))).toHaveLength(1)
  })

  it('无会话来源（含「定时」字样）另出一张 __inbox__ 卡，pending_total 取台账实数', () => {
    const frames = send('定时任务：跑一遍测试')?.frames ?? []
    const cards = frames.filter((frame) => frame.event === 'approval.required')
    const inboxCard = cards.find(
      (frame) => frameData<{ conversation_id: string }>(frame).conversation_id === INBOX_CONVERSATION_ID,
    )
    expect(inboxCard).toBeTruthy()
    const data = frameData<{ pending_total: number; reason: string; risk: string }>(inboxCard!)
    expect(data.pending_total).toBeGreaterThanOrEqual(1)
    expect(data.reason.length).toBeGreaterThan(0)
    expect(['high', 'medium']).toContain(data.risk)
  })
})

describe('§C B2：人话摘要（禁裸 JSON／禁内部术语）', () => {
  it('命令／路径／范围翻成人话，且不含花括号方括号', () => {
    expect(humanizeArgs('shell_exec', '{"command":"cargo test --workspace"}')).toBe(
      '运行命令：cargo test --workspace',
    )
    expect(humanizeArgs('read_file', '{"path":"src/stores/message.ts"}')).toBe(
      '读取文件：src/stores/message.ts',
    )
    expect(humanizeArgs('classify_customers', '{"range":"today"}')).toContain('今天')
    expect(humanizeArgs('apply_patch', '{"path":"src/a.ts","op":"新增首页"}')).toBe(
      '修改文件：src/a.ts（新增首页）',
    )
    // 解析失败也净化：卡面永不出现 `{`／`[` 开头的原始 JSON
    for (const raw of ['{"command":"ls"}', '{坏 json', '["a","b"]']) {
      expect(humanizeArgs('shell_exec', raw)).not.toMatch(/[{}\[\]]/)
    }
    // 未知字段也走中文键名，不裸露 JSON 形
    expect(humanizeArgs('mystery_tool', '{"alpha":1,"beta":"x"}')).not.toMatch(/[{}\[\]]/)
  })
})

describe('§C B1~B4／B8：审批卡面', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  function mountCard(meta: MessageMeta) {
    return mount(ApprovalCard, {
      props: {
        message: {
          id: 'm-1',
          conversationId: 'c-1',
          kind: 'approval' as const,
          text: '',
          createdAt: Date.now(),
          meta,
        },
      },
      global: { plugins: [i18n] },
    })
  }

  it('理由置顶＋人话摘要（卡面不含裸 JSON）', () => {
    const wrapper = mountCard({
      requestId: 'r1',
      toolName: 'shell_exec',
      argsPreview: '{"command":"cargo test --workspace","cwd":"F:/x"}',
      reason: '要跑一遍全量测试',
      risk: 'high',
    })
    const body = wrapper.find('.approval-body')
    // B1：理由一句是卡头下第一行
    expect(body.element.firstElementChild?.className).toBe('approval-reason')
    expect(wrapper.find('.approval-reason').text()).toBe('要跑一遍全量测试')
    // B2：人话摘要，无 `<pre>` 裸 JSON
    expect(wrapper.find('.approval-summary').text()).toBe('运行命令：cargo test --workspace')
    expect(wrapper.find('pre').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('cargo test --workspace&quot;')
    expect(wrapper.find('.approval-body').text()).not.toMatch(/[{}\[\]]/)
  })

  it('档位未知不伪装：无 risk ⇒ **不显档位徽章**（MSG-3263 ④：旧「档位未知」文案已废），且绝不伪装中风险', () => {
    const wrapper = mountCard({ requestId: 'r2', toolName: 'write_file', argsPreview: '{"path":"a.txt"}' })
    // 令（ZCode UX 走查 P2-6）：卡上不再出现「档位未知」（对用户零信息）
    expect(wrapper.find('.risk').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('档位未知')
    expect(wrapper.text()).not.toContain('中风险')
  })

  it('档位下拉默认「一次」高亮；「记住这条」在「一次」档下禁用；被拒可「申请放行」', async () => {
    const wrapper = mountCard({
      requestId: 'r3',
      toolName: 'classify_customers',
      argsPreview: '{"range":"today"}',
      reason: '要给今天的客户打标签',
      risk: 'medium',
    })
    expect(wrapper.find('.scope-option.active').text()).toBe('一次')
    const remember = wrapper.find('button.remember')
    expect(remember.attributes('disabled')).toBeDefined()

    // 选「本会话」⇒ 高亮随动、记住键可点
    const session = wrapper.findAll('.scope-option').find((btn) => btn.text() === '本会话')
    await session?.trigger('click')
    expect(wrapper.find('.scope-option.active').text()).toBe('本会话')
    expect(wrapper.find('button.remember').attributes('disabled')).toBeUndefined()

    // B4：放行语写明「被沙箱拒绝」（非「服务不可用」）
    const escalate = wrapper.find('button.escalate')
    expect(escalate.exists()).toBe(true)
    expect(escalate.attributes('title')).toContain('沙箱')
    expect(escalate.text()).toBe('申请放行')
  })

  it('点「同意」按所选档位提交（本会话 ⇒ scope=session）', async () => {
    const approvals = useApprovalStore()
    const respond = vi
      .spyOn(getClientSetup().client, 'permissionRespond')
      .mockResolvedValue({ resolved: true, status: 'approved' })
    const wrapper = mountCard({
      requestId: 'r4',
      toolName: 'classify_customers',
      argsPreview: '{"range":"today"}',
      risk: 'medium',
    })

    const session = wrapper.findAll('.scope-option').find((btn) => btn.text() === '本会话')
    await session?.trigger('click')
    await wrapper.find('button.approve').trigger('click')
    await Promise.resolve()

    expect(respond).toHaveBeenCalledWith({
      request_id: 'r4',
      approved: true,
      scope: 'session',
    })
    expect(approvals).toBeDefined()
  })
})

describe('§A3：队列条（queued／position ＋ 单条取消）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('chat.send 回执 queued:true ⇒ 排队中·第 N 位；取消走 chat.queue_cancel', async () => {
    const messages = useMessageStore()
    const mockTransport = getClientSetup().transport as unknown as {
      requests: Array<{ method: string }>
    }

    await messages.sendUserMessage('c-q', '帮我排队跑一下')

    const row = messages.list('c-q').find((item) => item.kind === 'status' && item.meta?.queued)
    expect(row).toBeTruthy()
    expect(row?.meta?.queuePosition).toBe(2)

    await messages.cancelQueued('c-q', row!.id)

    const after = messages.list('c-q').find((item) => item.id === row!.id)
    expect(after?.meta?.queued).toBe(false)
    expect(after?.meta?.queueCancelled).toBe(true)
    expect(after?.text).toBe('已取消排队')
    expect(mockTransport.requests.some((req) => req.method === 'chat.queue_cancel')).toBe(true)
  })
})

describe('§A3：计费改读后端值（前端单价表已删）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('done 帧带 cost_usd／cost_per_mtok ⇒ run.usage 直采后端值', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-cost', 'c-cost')

    routeFrame(
      {
        event: 'done',
        data: {
          task_id: 't-cost',
          usage: {
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
            cost_usd: 0.000412,
            cost_per_mtok: 0.82,
          },
        },
      },
      messages,
      approvals,
    )

    expect(messages.runs['t-cost']?.usage?.costUsd).toBe(0.000412)
    expect(messages.runs['t-cost']?.usage?.costPerMtok).toBe(0.82)
  })

  it('done 帧不带 cost_usd ⇒ 不显示金额（禁前端另算一份）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-cost2', 'c-cost2')

    routeFrame(
      {
        event: 'done',
        data: {
          task_id: 't-cost2',
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      },
      messages,
      approvals,
    )

    expect(messages.runs['t-cost2']?.usage?.costUsd).toBeUndefined()
  })
})

describe('§A3：task.updated 终态收口（旧版不发 done 也不再「像还在跑」）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('completed 帧到达即收口 assistant 消息（streaming 关、终态落）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-fin', 'c-fin')
    routeFrame({ event: 'token', data: { task_id: 't-fin', token: '做完了' } }, messages, approvals)
    routeFrame({ event: 'task.updated', data: { task_id: 't-fin', status: 'completed' } }, messages, approvals)

    const msg = messages.list('c-fin').find((item) => item.kind === 'assistant')
    expect(msg?.text).toBe('做完了')
    expect(msg?.meta?.streaming).toBe(false)
    expect(msg?.meta?.status).toBe('completed')
    expect(messages.runs['t-fin']?.status).toBe('completed')
  })
})
