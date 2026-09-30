// R2 波三（web 面三件）红证：
//   ① DEBT-874／T9「搜索很慢·几十秒」——**搜索族**在途可见（旧判式只认 web_fetch）
//      ＋**在途耗时读数**（每秒一跳："有数在动"）
//   ② DEBT-873／T9「下载被沙箱拦（许可面口径）」——**策略拒绝**与**网络／服务失败**
//      分开说（旧式：`denied` 归 network；字幕一律"换个方式继续"）
//   ③ DEBT-876／T8「记忆可解释性」——每条现形**来源＋时间**（旧式只有摘要＋裸来源串）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToolRow from '../src/components/chat/message/ToolRow.vue'
import MemoryCard from '../src/components/settings/MemoryCard.vue'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { RpcError } from '../src/client/rpc'
import { useMemoryStore } from '../src/stores/memory'
import { subtitleForTool } from '../src/stores/message'
import { isPolicyDenied, mapRpcError, POLICY_DENIED_HUMAN } from '../src/utils/errors'
import { translateTool } from '../src/utils/commandTranslator'
import type { ChatMessage } from '../src/models'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function msg(
  meta: Record<string, unknown>,
  text = '',
  createdAt = Date.now(),
): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    kind: 'tool_call',
    text,
    createdAt,
    meta: meta as ChatMessage['meta'],
  }
}

function mountRow(message: ChatMessage) {
  return mount(ToolRow, { props: { message }, global: { plugins: [i18n, createPinia()] } })
}

// ───────────────────────── ① DEBT-874 · 搜索在途 ─────────────────────────
describe('R2波三 ① DEBT-874 · 取件族（抓网页／联网搜索）在途可见＋耗时读数', () => {
  it('①a 点号族 `web.search` 在途 ⇒ 出「正在联网搜索…」（改前：无任何在途人话）', () => {
    const w = mountRow(msg({ taskId: 't1', callId: 'c1', toolName: 'web.search', argsPreview: '{"q":"x"}' }))
    expect(w.find('.tool-hint').exists()).toBe(true)
    expect(w.find('.tool-hint').text()).toContain('正在联网搜索')
  })

  it('①b 下划线族 `web_search`（双族归一）同上——不漏生产径', () => {
    const w = mountRow(msg({ taskId: 't1', callId: 'c1', toolName: 'web_search', argsPreview: '{"q":"x"}' }))
    expect(w.find('.tool-hint').text()).toContain('正在联网搜索')
  })

  it('①c 在途耗时读数：每秒一跳（"几十秒"里**有数在动**，不是死住）', async () => {
    vi.useFakeTimers()
    try {
      const w = mountRow(msg({ taskId: 't1', callId: 'c1', toolName: 'web.search' }, '', Date.now()))
      expect(w.find('.tool-elapsed').exists()).toBe(true)
      expect(w.find('.tool-elapsed').text()).toContain('0')
      vi.advanceTimersByTime(3000)
      await flushPromises()
      expect(w.find('.tool-elapsed').text()).toContain('3')
      // 卸载即清定时器（不给测试/切会话留后台跳表）
      w.unmount()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('①d 零扩散：非取件族（shell_exec）**不**出在途人话、**不**出读数', () => {
    const w = mountRow(msg({ taskId: 't1', callId: 'c1', toolName: 'shell_exec', argsPreview: '{"command":"ls"}' }))
    expect(w.find('.tool-hint').exists()).toBe(false)
    expect(w.find('.tool-elapsed').exists()).toBe(false)
  })

  it('①e 结果行（success 定）⇒ 在途人话与读数**俱消失**（不残留进行态）', () => {
    const w = mountRow(
      msg({ taskId: 't1', callId: 'c1', toolName: 'web.search', success: true }, '[取件 0.7s／上界 8s]\n结果…'),
    )
    expect(w.find('.tool-hint').exists()).toBe(false)
    expect(w.find('.tool-elapsed').exists()).toBe(false)
  })

  it('①f 旧 A10 口径不回归：web_fetch 在途仍出「正在抓取网页…」', () => {
    const w = mountRow(msg({ taskId: 't1', callId: 'c1', toolName: 'web_fetch', argsPreview: '{"url":"https://e.com/"}' }))
    expect(w.find('.tool-hint').text()).toContain('正在抓取网页')
  })

  it('①g 读数实测：45 秒长等 ⇒ 读数取值 46 个（改前：**0** 个——全程零反馈）', async () => {
    vi.useFakeTimers()
    try {
      const w = mountRow(msg({ taskId: 't1', callId: 'c1', toolName: 'web.search' }, '', Date.now()))
      const seen = new Set<string>()
      seen.add(w.find('.tool-elapsed').text())
      for (let i = 0; i < 45; i += 1) {
        vi.advanceTimersByTime(1000)
        await flushPromises()
        seen.add(w.find('.tool-elapsed').text())
      }
      // 45 次跳表 ⇒ 0..45 共 46 个不同读数；末值确为 45
      expect(seen.size).toBe(46)
      expect(w.find('.tool-elapsed').text()).toContain('45')
      w.unmount()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ──────────────────── ② DEBT-873 · 策略拒绝≠网络失败 ────────────────────
describe('R2波三 ② DEBT-873 · 许可面口径（策略拒绝 vs 网络／服务失败）', () => {
  it('②a 沙箱拒（即便码面是 -32603 internal）⇒ `policyDenied`，**不**落 internal／network', () => {
    const mapped = mapRpcError(
      new RpcError({ code: -32603, message: '沙箱拒绝执行：目标不在授权目录内' }),
    )
    expect(mapped.key).toBe('policyDenied')
    expect(mapped.detail).toBe('RPC -32603: 沙箱拒绝执行：目标不在授权目录内')
  })

  it('②b 旧式「denied ⇒ network」并轨**已断**：裸 denied 落 unknown（原文照透，不谎称网络）', () => {
    expect(mapRpcError(new Error('request denied by upstream')).key).toBe('unknown')
  })

  it('②c 网络族**不误伤**：Failed to fetch 仍 `network`', () => {
    expect(mapRpcError(new TypeError('Failed to fetch')).key).toBe('network')
  })

  it('②d 会话失效族**不被吞**：-32002 仍走 sessionExpired（策略判据不得越权）', () => {
    expect(
      mapRpcError(
        new RpcError({ code: -32002, message: '会话已失效或服务端重启后身份不可证——请重新登录' }),
      ).key,
    ).toBe('sessionExpired')
  })

  it('②e 系统权限／IO 面**不**归本件（`Permission denied` 不是策略拒绝）', () => {
    expect(isPolicyDenied('file.preview: 文件不可读: Access is denied. (os error 5)')).toBe(false)
    expect(isPolicyDenied('Permission denied')).toBe(false)
    expect(isPolicyDenied('沙箱拒绝')).toBe(true)
  })

  it('②f 工具行人话：策略拒绝⇒说清是哪一类＋下一步，**禁**「换个方式继续」', () => {
    const denied = translateTool('web_fetch', false, 'sandbox denied: 下载被安全策略拒绝')
    expect(denied).toContain('被安全策略拒绝')
    expect(denied).not.toContain('换个方式继续')
    expect(denied).toContain('申请放行')
  })

  it('②g 网络失败族**零变**：仍「这次没成，我换个方式继续」（可重试语义保留）', () => {
    expect(translateTool('web_fetch', false, 'ETIMEDOUT connecting to host')).toContain('换个方式继续')
  })

  it('②h 字幕（message.ts）：取件失败遇策略拒绝⇒不再"换个来源试试"', () => {
    const denied = subtitleForTool('web_fetch', false, '下载被沙箱拦截：许可面拒绝')
    expect(denied).toBe(POLICY_DENIED_HUMAN)
    expect(denied).not.toContain('换个来源试试')
  })

  it('②i 字幕**族外亦通**（未知下载类工具名走 default 径）——本债之正题', () => {
    expect(subtitleForTool('web_download', false, '被沙箱拒绝')).toBe(POLICY_DENIED_HUMAN)
  })

  it('②j 字幕网络族**零变**：没抓下来仍「换个来源试试」', () => {
    const net = subtitleForTool('web_fetch', false, 'connection reset by peer')
    expect(net).toContain('换个来源试试')
    expect(net).not.toBe(POLICY_DENIED_HUMAN)
  })

  it('②k i18n 面（toast／页头）有同名口径键，且**不**承诺重试', () => {
    expect(zhCN.errors.policyDenied).toContain('安全策略')
    expect(zhCN.errors.policyDenied).toContain('申请放行')
    expect(zhCN.errors.policyDenied).toContain('重试也不会变')
  })
})

// ─────────────────── ③ DEBT-876 · 记忆来源／时间现形 ───────────────────
describe('R2波三 ③ DEBT-876 · 记忆可解释性（来源／时间逐条现形）', () => {
  const ITEM = {
    id: '1727-abc12345',
    text: '客户 A 公司偏好每周一上午收到周报',
    source: 'conv-1',
    created_at: '2026-09-23T05:00:00+00:00',
    owner: 'user-a',
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('③a 逐条现形：摘要＋「来源：」＋「记住于：」三件齐（改前：只有摘要＋裸来源串，无时间）', async () => {
    vi.spyOn(getClientSetup().client, 'memoryList').mockResolvedValue({
      owner: 'user-a',
      count: 1,
      items: [ITEM],
    })
    const w = mount(MemoryCard, { global: { plugins: [i18n] } })
    await flushPromises()

    const li = w.find('.memory-fact-list li')
    expect(li.text()).toContain(ITEM.text)
    expect(w.find('.fact-source').text()).toContain('来源：')
    expect(w.find('.fact-source').text()).toContain(ITEM.source)
    expect(w.find('.fact-time').exists()).toBe(true)
    expect(w.find('.fact-time').text()).toContain('记住于：')
  })

  it('③b 时间缺失（daemon 未给／解析失败）⇒ 明说「未标注」，**不**显 1970 假时间', async () => {
    vi.spyOn(getClientSetup().client, 'memoryList').mockResolvedValue({
      owner: 'user-a',
      count: 1,
      items: [{ ...ITEM, created_at: '' }],
    })
    const memory = useMemoryStore()
    await memory.load()
    expect(memory.facts[0].createdAt).toBe(0)

    const w = mount(MemoryCard, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(w.find('.fact-time').text()).toContain('时间未标注')
    expect(w.find('.fact-time').text()).not.toContain('1970')
  })
})
