// SSE 帧解析：契约书 v2.0 tagged 格式；未知事件降级 unknown，心跳透出供看门狗。
export type SseEventType =
  | 'task.updated'
  | 'token'
  | 'reasoning'
  | 'done'
  | 'error'
  | 'tool.call'
  | 'tool.result'
  | 'approval.required'
  | 'approval.resolved'
  | 'permission.request'
  | 'daemon.notify'
  | 'brief.ready'
  | 'message'
  | 'heartbeat'
  | 'unknown'

export interface SseFrame {
  id?: number
  event: SseEventType
  data?: unknown
  raw?: string
}

const KNOWN_EVENTS: readonly string[] = [
  'task.updated',
  'token',
  'reasoning',
  'done',
  'error',
  'tool.call',
  'tool.result',
  'approval.required',
  'approval.resolved',
  'permission.request',
  'daemon.notify',
  'brief.ready',
  'message',
]

const MAX_BUFFER = 1024 * 1024

export function parseSseBlock(block: string): SseFrame {
  const normalized = block.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (normalized.trimStart().startsWith(':')) {
    return { event: 'heartbeat', raw: block }
  }

  let id: number | undefined
  let event = 'message'
  const dataLines: string[] = []

  for (const line of normalized.split('\n')) {
    if (line.startsWith('id:')) {
      const raw = line.slice(3).trim()
      if (raw !== '') {
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) id = parsed
      }
    } else if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  const dataText = dataLines.join('\n')
  let data: unknown
  if (dataText) {
    try {
      data = JSON.parse(dataText)
    } catch {
      data = { raw: dataText }
    }
  }

  const eventType = KNOWN_EVENTS.includes(event) ? (event as SseEventType) : 'unknown'
  return { id, event: eventType, data, raw: block }
}

export class SseParser {
  private buffer = ''

  constructor(private readonly onFrame: (frame: SseFrame) => void) {}

  push(chunk: string): void {
    this.buffer += chunk
    // 统一为 LF 后再切分：兼容 CRLF（SSE 规范允许）与裸 \r
    this.buffer = this.buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (this.buffer.length > MAX_BUFFER) {
      console.error('[baiz] sse buffer overflow, resetting')
      this.buffer = ''
      return
    }
    let idx: number
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 2)
      this.onFrame(parseSseBlock(block))
    }
  }

  flush(): void {
    const rest = this.buffer.trim()
    this.buffer = ''
    if (rest) {
      this.onFrame(parseSseBlock(rest))
    }
  }
}
