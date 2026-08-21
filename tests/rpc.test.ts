import { describe, expect, it } from 'vitest'
import { RpcClient, RPC_ERROR_CODES } from '../src/client/rpc'
import { createMockTransport } from '../src/client/transports/mock'

describe('RpcClient', () => {
  it('call 返回 result 并记录请求', async () => {
    const transport = createMockTransport({
      results: { 'a2a.status': { enabled: true, tasks: 0 } },
    })
    const client = new RpcClient(transport)
    const result = await client.call<{ enabled: boolean; tasks: number }>('a2a.status')
    expect(result).toEqual({ enabled: true, tasks: 0 })
    expect(transport.requests[0]).toMatchObject({ jsonrpc: '2.0', method: 'a2a.status' })
  })

  it('未知方法映射 METHOD_NOT_FOUND', async () => {
    const transport = createMockTransport()
    const client = new RpcClient(transport)
    await expect(client.call('chat.send', { message: '' })).rejects.toMatchObject({
      code: RPC_ERROR_CODES.METHOD_NOT_FOUND,
    })
  })

  it('mock 事件流可订阅/退订', async () => {
    const transport = createMockTransport()
    const events: string[] = []
    const unsubscribe = transport.onEvent((frame) => events.push(frame.event))
    transport.emit({ event: 'token', data: { token: 'x' } })
    unsubscribe()
    transport.emit({ event: 'done', data: {} })
    expect(events).toEqual(['token'])
  })
})
