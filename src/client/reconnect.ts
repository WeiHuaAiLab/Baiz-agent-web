import { RpcError, RPC_ERROR_CODES } from './rpc'
import type { RpcTransport } from './transport'
import type { SseFrame } from './sse'
import type { EventSubscribeParams, EventSubscribeResult } from './types'

// 断线续订：按已消费 seq 续订、RESYNC_REQUIRED 全量重同步、
// 90s 看门狗（任意帧复位）+ 指数退避重连（含抖动与上限）、stop 后可重启。
export type ReconnectState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'resync'

export interface ReconnectOptions {
  transport: RpcTransport
  taskId: string
  subscribe(params: EventSubscribeParams): Promise<EventSubscribeResult>
  /**
   * F4 挡板（MSG-2322）：首连 handshake——短连接取 daemon 当前最新事件
   * seq（event.subscribe RPC result.latest_seq；tauri 壳长连面会吞掉
   * result 行，故 probe 走短连接 RPC）。返回 >0 的 seq 或抛错/0 降级。
   */
  probeLatestSeq?: () => Promise<number>
  heartbeatTimeoutMs?: number
  retryDelayMs?: number
  maxRetryDelayMs?: number
  onStateChange?: (state: ReconnectState) => void
  onResyncRequired?: (info: { oldest_seq: number; latest_seq: number }) => void
}

export class SseReconnect {
  private latestSeq = 0
  /** F4：最近一次成功订阅携带的 last_event_id（弃帧基线——id<=base 的重放帧不达路由） */
  private consumeBase = 0
  /** F4：handshake 探得的 daemon 最新 seq（首连/resync 后订阅携带） */
  private probeSeq = 0
  /** F4：经弃帧过滤后的事件消费者（main.ts 路由注册于此，替代直连 transport） */
  private readonly dispatchHandlers = new Set<(frame: SseFrame) => void>()
  private watchdog: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private attempts = 0
  private stopped = false
  private unsubscribeEvents: (() => void) | undefined
  private unsubscribeDisconnect: (() => void) | undefined
  private readonly heartbeatTimeoutMs: number
  private readonly retryDelayMs: number
  private readonly maxRetryDelayMs: number

  constructor(private readonly options: ReconnectOptions) {
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 90_000
    this.retryDelayMs = options.retryDelayMs ?? 1_000
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 30_000
  }

  start(): Promise<void> {
    this.stopped = false
    this.attempts = 0
    // stop 后重新注册事件订阅，保证可重启
    this.unsubscribeEvents = this.options.transport.onEvent((frame) => this.onFrame(frame))
    this.unsubscribeDisconnect =
      this.options.transport.onDisconnect?.(() => this.scheduleReconnect()) ?? (() => {})
    return this.connectOnce()
  }

  /**
   * F4：注册经弃帧过滤的事件消费者（替代 transport 直连——弃帧面唯一入口）。
   * 长期有效，不受 stop()/start() 生命周期影响。
   */
  onDispatch(handler: (frame: SseFrame) => void): () => void {
    this.dispatchHandlers.add(handler)
    return () => {
      this.dispatchHandlers.delete(handler)
    }
  }

  stop(): void {
    this.stopped = true
    this.clearWatchdog()
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.unsubscribeEvents?.()
    this.unsubscribeDisconnect?.()
    this.unsubscribeEvents = undefined
    this.unsubscribeDisconnect = undefined
    this.options.transport.close()
  }

  private async connectOnce(): Promise<void> {
    if (this.stopped) return
    this.setState(this.attempts > 0 ? 'reconnecting' : 'connecting')
    // 中止上一次遗留的连接，避免 fetch/reader 泄漏
    this.options.transport.abort?.()
    try {
      await this.options.transport.connect()
      await this.subscribeOnce()
      this.attempts = 0
      this.setState('connected')
      this.armWatchdog()
    } catch (error) {
      if (error instanceof RpcError && error.code === RPC_ERROR_CODES.RESYNC_REQUIRED) {
        await this.handleResync(error)
      } else {
        this.scheduleReconnect()
      }
    }
  }

  private async subscribeOnce(): Promise<void> {
    // F4 挡板（MSG-2322）：首连/resync 后 latestSeq=0——先 handshake 探取
    // daemon 最新 seq，订阅带 last_event_id（daemon 分支2 last_written=latest
    // → 零重放）。daemon 实况缺省 last_event_id 即全环重放（conn.rs
    // unwrap_or(0)——注释与实现不符面账照批二族），故必须显式携带。
    if (this.latestSeq === 0) await this.probeLatest()
    const base = this.latestSeq > 0 ? this.latestSeq : this.probeSeq
    const params: EventSubscribeParams = { task_id: this.options.taskId }
    if (base > 0) params.last_event_id = base
    this.consumeBase = base
    await this.options.subscribe(params)
  }

  /** F4 handshake：短连接取 daemon 最新事件 seq；失败降级（0）不阻断订阅 */
  private async probeLatest(): Promise<void> {
    if (!this.options.probeLatestSeq) return
    try {
      const seq = await this.options.probeLatestSeq()
      this.probeSeq = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : 0
    } catch {
      // 降级：probe 失败不带 last_event_id 直接订阅（首连订阅不可断——宁重勿断；
      // 重放帧实害由批二族 daemon 缺省语义修向收口，此处尽力而为）
      if (this.attempts === 0) console.warn('[baiz] latest_seq 探测失败——首连订阅降级')
      this.probeSeq = 0
    }
  }

  private async handleResync(error: RpcError): Promise<void> {
    const data = (error.data ?? {}) as { oldest_seq?: number; latest_seq?: number }
    this.latestSeq = 0
    this.options.onResyncRequired?.({
      oldest_seq: data.oldest_seq ?? 0,
      latest_seq: data.latest_seq ?? 0,
    })
    this.setState('resync')
    try {
      await this.subscribeOnce()
      this.attempts = 0
      this.setState('connected')
      this.armWatchdog()
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.retryTimer) return
    this.clearWatchdog()
    this.attempts += 1
    const delay = this.backoffDelay()
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connectOnce()
    }, delay)
  }

  private backoffDelay(): number {
    const exponent = Math.min(this.attempts, 6)
    const base = Math.min(this.retryDelayMs * 2 ** exponent, this.maxRetryDelayMs)
    // 加抖动（0-250ms），避免多端同时重连打爆服务
    return base + Math.floor(Math.random() * 250)
  }

  private onFrame(frame: SseFrame): void {
    if (frame.id !== undefined) this.latestSeq = Math.max(this.latestSeq, frame.id)
    // 任意帧都证明链路存活（含数据帧），避免高速输出中途误判超时
    this.armWatchdog()
    // F4 弃帧：id<=订阅基线（consumeBase）的帧系重放/重复残帧——daemon
    // 连接层尊重 last_event_id 时不会出现（补帧恒 >base）；出现即行为不符
    // 或乱序竞态——弃于路由外，勿当新事件处理（重放审批卡/旧 run 实害）
    if (this.isStaleReplay(frame)) return
    this.dispatchHandlers.forEach((handler) => {
      try {
        handler(frame)
      } catch (error) {
        // 消费者（store 路由）异常不牵连断线管理——留痕后继续
        console.warn('[baiz] frame dispatch 异常', error)
      }
    })
  }

  private isStaleReplay(frame: SseFrame): boolean {
    if (frame.id === undefined) return false
    if (this.consumeBase <= 0) return false
    return frame.id <= this.consumeBase
  }

  private armWatchdog(): void {
    this.clearWatchdog()
    this.watchdog = setTimeout(() => this.scheduleReconnect(), this.heartbeatTimeoutMs)
  }

  private clearWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = null
  }

  private setState(state: ReconnectState): void {
    this.options.onStateChange?.(state)
  }
}
