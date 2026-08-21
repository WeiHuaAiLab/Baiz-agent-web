import { describe, expect, it } from 'vitest'
import { mapRpcError } from '../src/utils/errors'
import { exportConversation } from '../src/utils/export'

describe('错误映射', () => {
  it('RPC 错误码映射友好键', () => {
    expect(mapRpcError({ code: -32002, message: 'unauthorized' }).key).toBe('unauthorized')
    expect(mapRpcError({ code: -32602, message: 'bad' }).key).toBe('invalidParams')
    expect(mapRpcError({ code: -32001, message: 'x' }).key).toBe('taskNotFound')
    expect(mapRpcError(new TypeError('Failed to fetch')).key).toBe('network')
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
