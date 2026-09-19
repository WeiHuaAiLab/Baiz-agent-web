// 审批 store（src/stores/approval.ts）：待审批队列增删、mock 模式响应、档位回填；
// 以及事件路由（src/client/eventRouter.ts）的审批分发与边界处理。
//
// 契约基线：《前端协作标准 v1.0》§A1／§B／§C——帧内 `risk` 直接采信，
// 取不到即「档位未知」，**任何路径都不落假 medium**（§C B8）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { routeFrame } from '../src/client/eventRouter'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'

describe('approval store：待审批队列', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('upsert：新增条目并默认入队', () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec', risk: 'medium', details: 'ls -la' })
    expect(approvals.pending).toHaveLength(1)
    expect(approvals.pending[0]).toMatchObject({ request_id: 'r1', action: 'shell.exec', risk: 'medium' })
  })

  it('upsert：同 request_id 合并而非重复入队', () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec', risk: 'low' })
    approvals.upsert({ request_id: 'r1', action: 'shell.exec', risk: 'high', details: 'rm -rf' })
    expect(approvals.pending).toHaveLength(1)
    expect(approvals.pending[0]?.risk).toBe('high')
    expect(approvals.pending[0]?.details).toBe('rm -rf')
  })

  it('resolve：按 request_id 移除条目', () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'a', risk: 'low' })
    approvals.upsert({ request_id: 'r2', action: 'b', risk: 'low' })
    approvals.resolve('r1')
    expect(approvals.pending.map((item) => item.request_id)).toEqual(['r2'])
  })

  it('respond：mock 模式提交成功即销单（缺省档位＝once ⇒ 载荷不带 scope）', async () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec', risk: 'high' })
    const { client } = getClientSetup()
    const respond = vi
      .spyOn(client, 'permissionRespond')
      .mockResolvedValue({ resolved: true, status: 'approved' })

    await approvals.respond('r1', true)

    // §B：缺省＝once（不建规则）——载荷不带 scope 键
    expect(respond).toHaveBeenCalledWith({ request_id: 'r1', approved: true })
    expect(approvals.pending).toHaveLength(0)
  })

  it('respond：mock 模式下提交失败也正常销单（演示脚本化）', async () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec', risk: 'high' })
    const { client } = getClientSetup()
    vi.spyOn(client, 'permissionRespond').mockRejectedValue(new Error('rpc down'))

    await approvals.respond('r1', false)

    expect(approvals.pending).toHaveLength(0)
  })

  it('refreshRisk：补拉无该条目 ⇒ 档位未知（不猜 medium）', async () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec' })

    await approvals.refreshRisk('r1')

    expect(approvals.pending[0]?.risk).toBe('unknown')
  })

  it('refreshRisk：后端返回真实风险档位时回填并同步消息', async () => {
    const approvals = useApprovalStore()
    const messages = useMessageStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec' })
    const { client } = getClientSetup()
    vi.spyOn(client, 'permissionPending').mockResolvedValue({
      pending: [{ request_id: 'r1', action: 'shell.exec', risk: 'high', details: 'git push --force' }],
    })

    await approvals.refreshRisk('r1')

    expect(approvals.pending[0]?.risk).toBe('high')
    expect(approvals.pending[0]?.details).toBe('git push --force')
    expect(messages).toBeDefined()
  })

  it('refreshRisk：拉取失败 ⇒ 档位未知（不落假 medium）', async () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec' })
    const { client } = getClientSetup()
    vi.spyOn(client, 'permissionPending').mockRejectedValue(new Error('net'))

    await approvals.refreshRisk('r1')

    expect(approvals.pending[0]?.risk).toBe('unknown')
  })
})

describe('routeFrame：审批事件分发与边界', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('approval.required：帧内 risk 直接采信（不再默认 medium）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 't-a'
    messages.ensureRun(taskId, 'c-a')

    routeFrame(
      {
        event: 'approval.required',
        data: {
          request_id: 'r1',
          task_id: taskId,
          tool_name: 'classify_customers',
          args_preview: '{"range":"today"}',
          conversation_id: 'c-a',
          pending_total: 3,
          reason: '要给今天的客户打标签',
          risk: 'high',
        },
      },
      messages,
      approvals,
    )

    expect(approvals.pending).toHaveLength(1)
    expect(approvals.pending[0]).toMatchObject({
      request_id: 'r1',
      action: 'classify_customers',
      risk: 'high',
      reason: '要给今天的客户打标签',
      conversationId: 'c-a',
    })
    // §C B5：角标取 daemon 全库挂起总数
    expect(approvals.pendingTotal).toBe(3)
    expect(approvals.badgeCount).toBe(3)
  })

  it('approval.required：帧缺 risk ⇒ 档位未知（绝不出现猜出来的 medium）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 't-b'
    messages.ensureRun(taskId, 'c-b')

    routeFrame(
      {
        event: 'approval.required',
        data: { request_id: 'r2', task_id: taskId, tool_name: 'shell_exec', args_preview: '{}' },
      },
      messages,
      approvals,
    )

    expect(approvals.pending[0]?.risk).toBeUndefined()
    expect(approvals.pending[0]?.risk).not.toBe('medium')
  })

  it('approval.resolved：按 request_id 销单', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'x', risk: 'low' })

    routeFrame({ event: 'approval.resolved', data: { request_id: 'r1', approved: true } }, messages, approvals)

    expect(approvals.pending).toHaveLength(0)
  })

  it('permission.request：直接入队', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()

    routeFrame(
      { event: 'permission.request', data: { request_id: 'r9', action: 'fs.write', risk: 'high' } },
      messages,
      approvals,
    )

    expect(approvals.pending).toHaveLength(1)
    expect(approvals.pending[0]?.request_id).toBe('r9')
  })

  it('未知事件与缺失 data 不抛错', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()

    expect(() => routeFrame({ event: 'future.event', data: { a: 1 } }, messages, approvals)).not.toThrow()
    expect(() => routeFrame({ event: 'token', data: undefined }, messages, approvals)).not.toThrow()
    expect(() => routeFrame({ event: 'token' } as never, messages, approvals)).not.toThrow()
  })
})
