// MSG-3189 · `E1` 介入方式选择器 ＋ `E2` 安全四钉（**前端面·契约先行**）
//
// 三档：`plan`（计划模式·编辑前先出计划）／`confirm`（**每次确认·默认**）／`auto`（完全执行）。
//
// 四钉（前端侧落点）：
//   ① **完全执行不得越过沙箱**：本 store **只持有档位**——不碰路径闸／白名单／授权目录
//      （切档既不写入也不清空任何闸门输入，见测试 ④）；
//   ② **切档落审计**：`audit.execModeChanged`（契约先行·daemon 面待落地）——上报失败
//      **本地留存待补报**（`pendingAudits`，不静默丢弃）；
//   ③ **fail-closed**：持久化**只存到「每次确认」**——`auto` **不落盘**、**不跨重启**；
//   ④ **三层正交**：介入方式（本档·事前）× 记住范围（审批卡四档）× 授权目录——互不替代。
import { defineStore } from 'pinia'
import { getClient } from '../client/singleton'
import { useAuthStore } from './auth'

export type ExecMode = 'plan' | 'confirm' | 'auto'

export const EXEC_MODE_KEY = 'baiz.execMode'
/** 默认档＝**每次确认**（E2③） */
export const EXEC_MODE_DEFAULT: ExecMode = 'confirm'
/** 本地待补报审计上限（daemon 端点到位前留存；防无限增长） */
export const PENDING_AUDIT_LIMIT = 50

/**
 * 读持久化档位（**fail-closed**）：**只有 `plan` 可跨重启**——`auto` 与一切未知值
 * 一律回落默认「每次确认」。即"完全执行"在重启后**永不存活**。
 */
export function readPersistedExecMode(raw: string | null | undefined): ExecMode {
  return raw === 'plan' ? 'plan' : EXEC_MODE_DEFAULT
}

/** 写盘值：`auto` **不落盘**（写默认档）——持久层只见 plan／confirm */
export function persistedValueFor(mode: ExecMode): ExecMode {
  return mode === 'plan' ? 'plan' : EXEC_MODE_DEFAULT
}

/** `E2②` 切档审计条目（与 `audit.execModeChanged` 字段一一对应） */
export interface ExecModeAudit {
  mode: ExecMode
  previous: ExecMode
  at: string
  account: string
}

export const useExecModeStore = defineStore('execMode', {
  state: () => ({
    /** 当前档（常显于输入框 `+` 旁） */
    mode: EXEC_MODE_DEFAULT as ExecMode,
    /** 待补报审计（daemon 端点未落地期间的本地留存） */
    pendingAudits: [] as ExecModeAudit[],
    /** 最近一次上报：'' 未报｜'ok' 已报｜'pending' 待补报 */
    lastAudit: '' as '' | 'ok' | 'pending',
  }),
  getters: {
    /** 完全执行（UI 提示用——沙箱/白名单/授权目录**照旧生效**） */
    isAuto: (state) => state.mode === 'auto',
  },
  actions: {
    /** 启动恢复（fail-closed）：盘上只可能读到 plan／confirm */
    hydrate(): ExecMode {
      try {
        this.mode = readPersistedExecMode(localStorage.getItem(EXEC_MODE_KEY))
      } catch {
        this.mode = EXEC_MODE_DEFAULT
      }
      return this.mode
    },
    /**
     * 切档：立即生效＋按 fail-closed 落盘（auto 存 default）＋**落审计**。
     * 返回是否成功上报（false ＝ 入待补报队列）。
     */
    async setMode(next: ExecMode): Promise<boolean> {
      const previous = this.mode
      if (next === previous) return true
      this.mode = next
      try {
        localStorage.setItem(EXEC_MODE_KEY, persistedValueFor(next))
      } catch {
        /* 存储不可用：档位仅本次会话有效（更严，不报错） */
      }
      return this.reportAudit({
        mode: next,
        previous,
        at: new Date().toISOString(),
        account: useAuthStore().userId || 'local',
      })
    },
    /** `E2②` 上报切档（谁·何时·调到哪档）；失败＝本地留存待补报（不静默丢弃） */
    async reportAudit(entry: ExecModeAudit): Promise<boolean> {
      try {
        await getClient().auditExecModeChanged(entry)
        this.lastAudit = 'ok'
        return true
      } catch {
        this.lastAudit = 'pending'
        this.pendingAudits = [...this.pendingAudits, entry].slice(-PENDING_AUDIT_LIMIT)
        return false
      }
    },
  },
})
