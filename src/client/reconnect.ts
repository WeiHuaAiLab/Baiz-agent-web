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
  heartbeatTimeoutMs?: number
  retryDelayMs?: number
  maxRetryDelayMs?: number
  onStateChange?: (state: ReconnectState) => void
  onResyncRequired?: (info: { oldest_seq: number; latest_seq: number }) => void
}

export class SseReconnect {
  private latestSeq = 0
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
    const params: EventSubscribeParams = { task_id: this.options.taskId }
    if (this.latestSeq > 0) params.last_event_id = this.latestSeq
    await this.options.subscribe(params)
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
