// 审批 store：待审批队列 + 真实 permission.respond 转发 + 规则/档位管理。
//
// 契约基线：《前端协作标准 v1.0》§A1／§B／§C。要点：
// - 帧内 `risk` **直接采信**（§A1 钉：回退径永不触发，故占位逻辑已删）；
// - 取不到 `risk` ⇒ 档位**未知**，任何路径都不落假 medium（§C B8）；
// - `conversation_id === '__inbox__'` 的卡归「全局收件箱」，不丢（§C B5）；
// - `pending_total` ⇒ 角标「另有 N 张卡」（§C B5）；
// - `respond` 带 `scope`：缺省＝once（不建规则）（§B）。
import { defineStore } from 'pinia'
import { getClientSetup } from '../client/singleton'
import { INBOX_CONVERSATION_ID, isInboxConversation } from '../client/types'
import type { ApprovalRule, ApprovalScope } from '../client/types'
import { normalizeRisk } from '../utils/approvalText'
import { useMessageStore } from './message'
import { useUiStore } from './ui'

export interface PendingApprovalItem {
  request_id: string
  action: string
  /** 帧内直采的真实档位；缺省＝档位未知（禁默认 medium） */
  risk?: string
  details?: string
  /** 理由一句（人话）——卡上必须显示 */
  reason?: string
  /** 会话归属；无来源＝`__inbox__`（全局收件箱） */
  conversationId?: string
  createdAt?: number
  /** 最近一次提交所选档位（仅本地展示用） */
  scope?: ApprovalScope
}

export { INBOX_CONVERSATION_ID }

export const useApprovalStore = defineStore('approval', {
  state: () => ({
    pending: [] as PendingApprovalItem[],
    /** 全库挂起总数（含积压）——daemon 帧 `pending_total` 直采 */
    pendingTotal: 0,
    /** 最近一次重连补拉是否成功（false ＝ 档位以「未知」呈现，不清真） */
    syncFailed: false,
    syncedAt: 0,
    /** MSG-3225 ②：最近一次对账收口的已终态卡条数（实测/讫报用） */
    staleReconciled: 0,
    rules: [] as ApprovalRule[],
    rulesLoaded: false,
    policy: [] as Array<{ name: string; priority: number }>,
  }),
  getters: {
    /** 全局收件箱条目（无会话来源的卡） */
    inboxItems(state): PendingApprovalItem[] {
      return state.pending.filter((entry) => isInboxConversation(entry.conversationId))
    },
    /** 会话内条目（有会话归属的卡） */
    sessionItems(state): PendingApprovalItem[] {
      return state.pending.filter((entry) => !isInboxConversation(entry.conversationId))
    },
    /** 角标数：实盘待办与 daemon 全库总数取大（积压不隐藏） */
    badgeCount(state): number {
      return Math.max(state.pending.length, state.pendingTotal)
    },
    /** 另有 N 张卡（全库总数 − 本地可见数） */
    hiddenCount(state): number {
      return Math.max(0, state.pendingTotal - state.pending.length)
    },
  },
  actions: {
    upsert(item: PendingApprovalItem) {
      const existing = this.pending.find((entry) => entry.request_id === item.request_id)
      if (existing) {
        // 只在有值时才覆盖——daemon 补拉缺 reason 时不抹掉帧内已到位的理由
        for (const [key, value] of Object.entries(item)) {
          if (value !== undefined && value !== null && value !== '') {
            ;(existing as Record<string, unknown>)[key] = value
          }
        }
      } else {
        this.pending.push({ ...item, createdAt: item.createdAt ?? Date.now() })
      }
    },
    resolve(requestId: string) {
      this.pending = this.pending.filter((entry) => entry.request_id !== requestId)
      if (this.pendingTotal > 0) this.pendingTotal -= 1
    },
    /** 帧内 `pending_total` 直采（§A1：全库挂起总数，含积压） */
    notePendingTotal(total?: number) {
      if (typeof total === 'number' && Number.isFinite(total) && total >= 0) {
        this.pendingTotal = Math.floor(total)
      }
    },
    /**
     * 重连补拉（§C B6）：推送可丢、状态须可查——（重）连建立即调
     * `permission.pending`，断线期间产生的卡重连后仍在。
     * 失败时保留本地待办并把无档位条目钉为「未知」（§C B8：不猜 medium）。
     */
    async syncPending(): Promise<boolean> {
      const { client } = getClientSetup()
      // MSG-3225 ②：对账起点——此**之后**到达的卡不参与本轮收口（防在途帧竞态）
      const startedAt = Date.now()
      try {
        const { pending } = await client.permissionPending()
        const list = Array.isArray(pending) ? pending : []
        const seen = new Set<string>()
        for (const entry of list) {
          seen.add(entry.request_id)
          this.upsert({
            request_id: entry.request_id,
            action: entry.action,
            risk: normalizeRisk(entry.risk) === 'unknown' ? undefined : entry.risk,
            details: entry.details,
            reason: entry.reason,
            conversationId: entry.conversation_id,
            createdAt: Date.parse(entry.created_at ?? '') || Date.now(),
          })
          const known = this.pending.find((item) => item.request_id === entry.request_id)
          if (known) useMessageStore().updateRisk(entry.request_id, known.risk ?? 'unknown')
        }
        // 断线期间已决（补拉清单里没有）的卡销单——状态可查即不残留
        const gone = this.pending.filter((entry) => !seen.has(entry.request_id))
        for (const entry of gone) this.resolve(entry.request_id)
        // MSG-3225 ②：同一次对账顺带收口**消息面**（收件箱面板真源是
        // `messages.list('__inbox__')`，不是本 store 的 pending）——权威清单外
        // 的旧卡标终态（不删档），已在本地永久留存的幽灵项就此不再展示。
        this.staleReconciled = useMessageStore().expireStaleApprovals(seen, startedAt)
        // MSG-3236 ③：计数**以 daemon 权威清单为准**（原 `Math.max(...)` 只增不减 ⇒
        // 超时/已决/被销卡后角标仍停旧值「待办 2」）。权威清单缩小时计数同轮下降。
        this.pendingTotal = list.length
        this.syncFailed = false
        this.syncedAt = Date.now()
        return true
      } catch {
        // fail-honest：拉取失败不销卡、不猜档位——待办与卡面同钉「未知」
        for (const entry of this.pending) {
          if (normalizeRisk(entry.risk) === 'unknown') {
            entry.risk = 'unknown'
            useMessageStore().updateRisk(entry.request_id, 'unknown')
          }
        }
        this.syncFailed = true
        return false
      }
    },
    /**
     * 单条档位补拉（仅重连/补拉径使用）。帧内已有 `risk` 时**不必**调用。
     * 后端无该条目或拉取失败 ⇒ 档位未知（不得默认 medium，§C B8）。
     */
    async refreshRisk(requestId: string) {
      const markUnknown = () => {
        const target = this.pending.find((entry) => entry.request_id === requestId)
        if (!target) return
        target.risk = 'unknown'
        useMessageStore().updateRisk(requestId, 'unknown')
      }
      try {
        const { client } = getClientSetup()
        const { pending } = await client.permissionPending()
        const found = pending.find((entry) => entry.request_id === requestId)
        if (!found || normalizeRisk(found.risk) === 'unknown') {
          markUnknown()
          return
        }
        this.upsert({
          request_id: found.request_id,
          action: found.action,
          risk: found.risk,
          details: found.details,
          reason: found.reason,
          conversationId: found.conversation_id,
        })
        useMessageStore().updateRisk(requestId, found.risk)
      } catch {
        // 拉取失败 ⇒ 档位未知（不伪装 medium）
        markUnknown()
      }
    },
    /**
     * 提交审批（§B）：`scope` 缺省＝once（不建规则）；session／project／
     * forever 才落规则。失败＝保留待办可重试＋toast（§C B7 fail-closed）。
     */
    async respond(
      requestId: string,
      approved: boolean,
      scope?: ApprovalScope,
    ): Promise<{ ok: boolean; error?: string }> {
      const { client, transport } = getClientSetup()
      const payload: { request_id: string; approved: boolean; scope?: ApprovalScope } = {
        request_id: requestId,
        approved,
      }
      // 「一次」＝不建规则：显式省略 scope，避免后端把 once 也当规则落库
      if (scope && scope !== 'once') payload.scope = scope
      try {
        await client.permissionRespond(payload)
      } catch (error) {
        if (transport.kind === 'mock') {
          // 演示模式：脚本化响应，正常销单
          this.resolve(requestId)
          return { ok: true }
        }
        // 契约 §C B7（fail-closed）：保留待办可重试 ＋ toast；同时把失败回给卡面
        // （设计规格 §三 error 态：卡内一行「提交失败：<人话>」＋不销卡）
        const reason = (error as Error).message
        useUiStore().toast(`审批提交失败：${reason}`, 'error')
        return { ok: false, error: reason }
      }
      this.resolve(requestId)
      // 记录档位：已决态一行显「· 本次／本会话／本项目／永久」（规格 §三 success）
      useMessageStore().noteScope(requestId, scope ?? 'once')
      if (scope && scope !== 'once') void this.loadRules()
      return { ok: true }
    },
    /** 规则管理页数据源（§B approval.rules） */
    async loadRules() {
      const { client, transport } = getClientSetup()
      try {
        this.rules = await client.approvalRules()
        this.rulesLoaded = true
      } catch {
        // 老 daemon 无此端：保持空表，不抛不改语义
        if (transport.kind === 'mock') this.rules = []
        this.rulesLoaded = true
      }
    },
    /** 撤销规则（§B approval.revoke）——撤销后必重弹 */
    async revokeRule(ruleId: string) {
      const { client } = getClientSetup()
      try {
        await client.approvalRevoke({ rule_id: ruleId })
      } catch (error) {
        useUiStore().toast(`撤销失败：${(error as Error).message}`, 'error')
        return
      }
      this.rules = this.rules.filter((rule) => rule.rule_id !== ruleId)
      useUiStore().toast('已撤销该规则——下次同类操作会重新弹卡确认', 'info')
    },
    /** 设置页展示的优先级表（§B approval.policy） */
    async loadPolicy() {
      const { client } = getClientSetup()
      try {
        const result = await client.approvalPolicy()
        this.policy = Array.isArray(result?.levels) ? result.levels : []
      } catch {
        this.policy = []
      }
    },
    /** 申请放行（§B approval.escalate）——升级≠免审：批准后仍走审批执行 */
    async escalate(requestId: string) {
      const { client } = getClientSetup()
      try {
        await client.approvalEscalate({ request_id: requestId })
      } catch (error) {
        useUiStore().toast(`申请放行失败：${(error as Error).message}`, 'error')
        return
      }
      useUiStore().toast('已申请放行——批准后仍会走一次审批执行', 'info')
    },
  },
})
