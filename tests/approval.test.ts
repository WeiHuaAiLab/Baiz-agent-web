// 审批 store（src/stores/approval.ts）：待审批队列增删、mock 模式响应、风险回填；
// 以及事件路由（src/client/eventRouter.ts）的审批分发与边界处理。
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

  it('respond：mock 模式提交成功即销单（批准）', async () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec', risk: 'high' })
    const { client } = getClientSetup()
    const respond = vi
      .spyOn(client, 'permissionRespond')
      .mockResolvedValue({ resolved: true, status: 'approved' })

    await approvals.respond('r1', true)

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

  it('refreshRisk：mock pending 无该条目时保持默认档位不抛错', async () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec', risk: 'medium' })

    await approvals.refreshRisk('r1')

    expect(approvals.pending[0]?.risk).toBe('medium')
  })

  it('refreshRisk：后端返回真实风险档位时回填并同步消息', async () => {
    const approvals = useApprovalStore()
    const messages = useMessageStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec', risk: 'medium' })
    const { client } = getClientSetup()
    vi.spyOn(client, 'permissionPending').mockResolvedValue({
      pending: [{ request_id: 'r1', action: 'shell.exec', risk: 'high', details: 'git push --force' }],
    })

    await approvals.refreshRisk('r1')

    expect(approvals.pending[0]?.risk).toBe('high')
    expect(approvals.pending[0]?.details).toBe('git push --force')
    expect(messages).toBeDefined()
  })

  it('refreshRisk：拉取失败时 fail-open 保持默认档位', async () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r1', action: 'shell.exec', risk: 'medium' })
    const { client } = getClientSetup()
    vi.spyOn(client, 'permissionPending').mockRejectedValue(new Error('net'))

    await approvals.refreshRisk('r1')

    expect(approvals.pending[0]?.risk).toBe('medium')
  })
})

describe('routeFrame：审批事件分发与边界', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('approval.required：默认中风险档位入队并触发风险回填', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const taskId = 't-a'
    messages.ensureRun(taskId, 'c-a')

    routeFrame(
      {
        event: 'approval.required',
        data: { request_id: 'r1', task_id: taskId, tool_name: 'classify_customers', args_preview: '{}' },
      },
      messages,
      approvals,
    )

    expect(approvals.pending).toHaveLength(1)
    expect(approvals.pending[0]).toMatchObject({ request_id: 'r1', action: 'classify_customers', risk: 'medium' })

    // 等 refreshRisk 异步完成（mock pending 为空 → 保持默认档位）
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(approvals.pending[0]?.risk).toBe('medium')
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
