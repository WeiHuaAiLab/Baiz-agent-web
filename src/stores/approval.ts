// 审批 store：待审批队列 + 真实 permission.respond 转发。
import { defineStore } from 'pinia'
import { getClientSetup } from '../client/singleton'
import { useMessageStore } from './message'
import { useUiStore } from './ui'

export interface PendingApprovalItem {
  request_id: string
  action: string
  risk: string
  details?: string
}

export const useApprovalStore = defineStore('approval', {
  state: () => ({
    pending: [] as PendingApprovalItem[],
  }),
  actions: {
    upsert(item: PendingApprovalItem) {
      const existing = this.pending.find((entry) => entry.request_id === item.request_id)
      if (existing) {
        Object.assign(existing, item)
      } else {
        this.pending.push(item)
      }
    },
    resolve(requestId: string) {
      this.pending = this.pending.filter((entry) => entry.request_id !== requestId)
    },
    // P2 修复（2026-08-22）：daemon 协议帧零扩（裁985②），approval.required
    // 不带 risk——真实档位在 PermissionStore，经 permission.pending RPC 取回
    // 后回填审批卡与消息 meta（显示"高风险/中风险/低风险"真档）。
    async refreshRisk(requestId: string) {
      try {
        const { client } = getClientSetup()
        const { pending } = await client.permissionPending()
        const found = pending.find((entry) => entry.request_id === requestId)
        if (!found || !found.risk) return
        this.upsert({
          request_id: found.request_id,
          action: found.action,
          risk: found.risk,
          details: found.details,
        })
        useMessageStore().updateRisk(requestId, found.risk)
      } catch {
        // 拉取失败保持默认档位（fail-open 仅影响展示，不影响审批门禁）
      }
    },
    async respond(requestId: string, approved: boolean) {
      const { client, transport } = getClientSetup()
      try {
        await client.permissionRespond({ request_id: requestId, approved })
      } catch (error) {
        if (transport.kind === 'mock') {
          // 演示模式：脚本化响应，正常销单
          this.resolve(requestId)
          return
        }
        useUiStore().toast(`审批提交失败：${(error as Error).message}`, 'error')
        // fail-closed：保留待办条目，允许重试
        return
      }
      this.resolve(requestId)
    },
  },
})
