// MSG-2418 甲 红证：展示页数据层——中文保真／游标增量无重无漏／空态／token 携带面。
import { describe, expect, it, vi } from 'vitest'
import {
  fetchAllWechatMessages,
  fetchWechatMessages,
  type WechatRecvMessage,
} from '../src/utils/wechatView'

function okJson(messages: WechatRecvMessage[]) {
  return { ok: true, status: 200, json: async () => ({ messages }) } as Response
}

describe('微信展示页数据层（2418 乙契约）', () => {
  it('中文保真：text 原样不转码不截断', async () => {
    const fetchImpl = vi.fn(async () =>
      okJson([
        {
          id: 1,
          type: 'text',
          from: '客户-张三',
          text: '你好，微信测试消息——中文内容保真 ✓',
          ts: 1725000000000,
        },
      ]),
    )
    const page = await fetchWechatMessages(0, '', fetchImpl)
    expect(page).toHaveLength(1)
    expect(page[0]?.text).toBe('你好，微信测试消息——中文内容保真 ✓')
    expect(page[0]?.from).toBe('客户-张三')
  })

  it('游标增量：全量拉取逐页推进——无重无漏', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      const since = Number(new URL(url, 'http://x').searchParams.get('since'))
      if (since === 0) {
        return okJson([
          { id: 1, type: 'text', from: 'A', text: '第一条', ts: 1 },
          { id: 2, type: 'text', from: 'B', text: '第二条', ts: 2 },
        ])
      }
      if (since === 2) {
        return okJson([{ id: 3, type: 'text', from: 'C', text: '第三条', ts: 3 }])
      }
      return okJson([])
    })
    const all = await fetchAllWechatMessages('', fetchImpl)
    expect(all.map((m) => m.id)).toEqual([1, 2, 3])
    expect(all.map((m) => m.text)).toEqual(['第一条', '第二条', '第三条'])
    expect(calls).toEqual([
      '/wechat-recv/messages?since=0',
      '/wechat-recv/messages?since=2',
      '/wechat-recv/messages?since=3',
    ])
  })

  it('空态：空批即尾——返回空列表零推进', async () => {
    const fetchImpl = vi.fn(async () => okJson([]))
    const all = await fetchAllWechatMessages('', fetchImpl)
    expect(all).toHaveLength(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const page = await fetchWechatMessages(7, '', fetchImpl)
    expect(page).toHaveLength(0)
  })

  it('token 携带面：空串零头／有值带 Authorization: Bearer（零硬码零落盘）', async () => {
    let captured: HeadersInit | undefined
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init?.headers
      return okJson([])
    })
    await fetchWechatMessages(0, '', fetchImpl)
    expect(captured).toBeUndefined()
    await fetchWechatMessages(0, '老板直注-占位值', fetchImpl)
    expect(captured).toEqual({ Authorization: 'Bearer 老板直注-占位值' })
  })
})
