import { describe, expect, it } from 'vitest'
import { SseParser, parseSseBlock } from '../src/client/sse'

describe('parseSseBlock', () => {
  it('解析 tagged 帧（id/event/data）', () => {
    const frame = parseSseBlock(
      'id: 42\nevent: token\ndata: {"event":"token","data":{"task_id":"t-1","token":"hi"}}',
    )
    expect(frame.id).toBe(42)
    expect(frame.event).toBe('token')
    expect(frame.data).toEqual({ event: 'token', data: { task_id: 't-1', token: 'hi' } })
  })

  it('注释行降级为 heartbeat', () => {
    expect(parseSseBlock(': ping').event).toBe('heartbeat')
  })

  it('未知事件显式降级 unknown（不 panic 不静默透传）', () => {
    const frame = parseSseBlock('event: task.created\ndata: {}')
    expect(frame.event).toBe('unknown')
  })

  it('CRLF 归一化', () => {
    const frame = parseSseBlock('id: 1\r\nevent: done\r\ndata: {"task_id":"t"}\r\n\r\n')
    expect(frame.event).toBe('done')
  })

  it('CRLF 分帧：\r\n\r\n 分隔符可切分', () => {
    const frames: string[] = []
    const parser = new SseParser((frame) => frames.push(frame.event))
    parser.push('event: token\r\ndata: {"x":1}\r\n\r\nevent: done\r\ndata: {"task_id":"t"}\r\n\r\n')
    expect(frames).toEqual(['token', 'done'])
  })

  it('裸 id: 解析为 undefined 而非 0', () => {
    const frame = parseSseBlock('id:\nevent: token\ndata: {}')
    expect(frame.id).toBeUndefined()
  })
})

describe('SseParser 流式', () => {
  it('跨 chunk 组装完整帧', () => {
    const frames: string[] = []
    const parser = new SseParser((frame) => frames.push(frame.event))
    parser.push('event: token\ndata: {"a":1}\n\nid: 2\nev')
    parser.push('ent: done\ndata: {"task_id":"t"}\n\n')
    expect(frames).toEqual(['token', 'done'])
  })

  it('心跳帧以 heartbeat 事件回调（供看门狗复位）', () => {
    const frames: string[] = []
    const parser = new SseParser((frame) => frames.push(frame.event))
    parser.push(': ping\n\n')
    expect(frames).toEqual(['heartbeat'])
  })
})
