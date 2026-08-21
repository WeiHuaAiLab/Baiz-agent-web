// 审批 store：待审批队列 + 真实 permission.respond 转发。
import { defineStore } from 'pinia'
import { getClientSetup } from '../client/singleton'
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
