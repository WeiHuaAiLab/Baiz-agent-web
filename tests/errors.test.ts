import { describe, expect, it } from 'vitest'
import { mapRpcError } from '../src/utils/errors'
import { exportConversation } from '../src/utils/export'
import { RpcError } from '../src/client/rpc'

describe('错误映射', () => {
  it('RPC 错误码映射友好键', () => {
    expect(mapRpcError({ code: -32002, message: 'unauthorized' }).key).toBe('unauthorized')
    expect(mapRpcError({ code: -32602, message: 'bad' }).key).toBe('invalidParams')
    expect(mapRpcError({ code: -32001, message: 'x' }).key).toBe('taskNotFound')
    expect(mapRpcError(new TypeError('Failed to fetch')).key).toBe('network')
  })
})

describe('MSG-2609 RpcError 裸串透传（修面二——真因可辨）', () => {
  it('壳 Err(String) reject 裸串 → message 原文直用（勿落通用兜底）', () => {
    const e = new RpcError('RPC 已被前端中止' as never)
    expect(e.message).toBe('RPC 已被前端中止')
    // mapRpcError 透传原文（红条显真因——非「未知错误」吞没）
    expect(mapRpcError(e).detail).toBe('RPC 已被前端中止')
  })
  it('对象形（code+message 双全）照旧拼 RPC 前缀——零 undefined 裸串钉', () => {
    const e = new RpcError({ code: -32004, message: 'out of window' })
    expect(e.message).toBe('RPC -32004: out of window')
    expect(e.message).not.toContain('undefined')
  })
  it('对象形缺省兜底照旧可读——「RPC undefined」零现钉恒', () => {
    const e = new RpcError({ code: undefined as never, message: '' })
    expect(e.message).toBe('RPC 调用失败（未知错误）')
    expect(e.message).not.toContain('RPC undefined')
    expect(new RpcError(undefined as never).message).toBe('RPC 调用失败（未知错误）')
    expect(new RpcError(null as never).message).toBe('RPC 调用失败（未知错误）')
  })
})

describe('会话导出', () => {
  it('MD 导出包含标题与消息', () => {
    const { filename, content } = exportConversation(
      { id: 'c', title: '测试', createdAt: 1, updatedAt: 1 },
      [{ id: 'm', conversationId: 'c', kind: 'user', text: '你好', createdAt: 1 }],
      'md',
    )
    expect(filename).toBe('测试.md')
    expect(content).toContain('# 测试')
    expect(content).toContain('你好')
  })
})
