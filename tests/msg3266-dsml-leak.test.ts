// MSG-3266 P0 红证：DSML 工具调用语法**裸泄漏进正文**（＋回合预算耗尽 8/8）。
// 真机（会话 68fafbb9）：三回合全 8/8；A 尾部泄漏 DSML 调用块；B 整条回复＝纯 DSML 协议文本。
//
// 改前红：daemon 无 DSML 解析器、`strip_tool_markers` 只认 ASCII 信封、前端 `decisionStream`
// 只认决策 JSON 键 ⇒ **全角 DSML 直进 run.text → 正文**（协议乱码）。
// 改后绿：收帧层 `protocolLeak` 过滤器把未解析的协议块**从正文剥离**（零丢证归折叠区），
// 并给**可见重试**（status.protocolLeak＋卡上「重试」钮）——用户不再拿到协议乱码。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import MessageItem from '../src/components/chat/MessageItem.vue'
import { router } from '../src/router'
import {
  containsDsml,
  createProtocolLeakFilter,
  stripDsmlBlocks,
} from '../src/utils/protocolLeak'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 真机形态：全角竖线 DSML 信封（含换行／中文参数／嵌套引号） */
const DSML_BLOCK = [
  '＜｜｜DSML｜｜invoke name="shell_exec"＞',
  '＜｜｜DSML｜｜parameter name="command"＞',
  'python -c "print(\'你好，世界\')"',
  '＜/｜｜DSML｜｜parameter＞',
  '＜/｜｜DSML｜｜invoke＞',
].join('\n')

const hasProtocolMarkers = (text: string) => containsDsml(text) || /invoke name=|<\|/.test(text)

function slices(text: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

describe('MSG-3266 ① 协议块不进正文（零丢证）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('单帧整块 ⇒ 正文零协议标记；原文归受控折叠区', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-1', 'c-1')
    routeFrame({ event: 'token', data: { task_id: 't-1', token: `代码已改好。\n${DSML_BLOCK}` } }, messages, approvals)
    routeFrame({ event: 'done', data: { task_id: 't-1' } }, messages, approvals)

    const run = messages.runs['t-1']
    expect(hasProtocolMarkers(run?.text ?? '')).toBe(false)
    expect(run?.text ?? '').toContain('代码已改好')
    expect(run?.decision ?? '').toContain('DSML') // 零丢证：原文进折叠区
  })

  it('逐片分帧（9 字一片）⇒ 任一片后正文都不得出现半截协议', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-2', 'c-2')
    for (const piece of slices(`先看结果。\n${DSML_BLOCK}`, 9)) {
      routeFrame({ event: 'token', data: { task_id: 't-2', token: piece } }, messages, approvals)
      expect(hasProtocolMarkers(messages.runs['t-2']?.text ?? '')).toBe(false)
    }
    routeFrame({ event: 'done', data: { task_id: 't-2' } }, messages, approvals)
    expect(hasProtocolMarkers(messages.runs['t-2']?.text ?? '')).toBe(false)
  })
})

describe('MSG-3266 ② 未解析形态 ⇒ 可见重试（禁静默）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未闭合残块（B 情形：整条＝纯协议文本）⇒ 正文无人话壳也不留协议；给 status.protocolLeak＋重试钮', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-3', 'c-3')
    // 截断形态：只有 open 标记，没有闭合（真机 A 的尾部 412 字残文）
    routeFrame(
      { event: 'token', data: { task_id: 't-3', token: DSML_BLOCK.split('＜/')[0] } },
      messages,
      approvals,
    )
    routeFrame({ event: 'done', data: { task_id: 't-3' } }, messages, approvals)
    await Promise.resolve()

    const run = messages.runs['t-3']
    expect(hasProtocolMarkers(run?.text ?? '')).toBe(false)
    // 可见交代＋重试入口
    const status = messages.list('c-3').find((item) => item.meta?.statusKey === 'protocolLeak')
    expect(status, '剥到协议文本须有可见交代').toBeTruthy()
    const wrapper = mount(MessageItem, { props: { message: status! }, global: { plugins: [i18n, router] } })
    expect(wrapper.text()).toContain('工具协议文本')
    expect(wrapper.find('.retry-btn').exists()).toBe(true)
  })
})

describe('MSG-3266 ③ 8/8 边界：不得以协议文本收口', () => {
  it('整条回复＝纯 DSML（B 情形）⇒ 正文零协议；用户拿到人话交代（非乱码/非空壳）', async () => {
    setActivePinia(createPinia())
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-4', 'c-4')
    for (const piece of slices(DSML_BLOCK, 13)) {
      routeFrame({ event: 'token', data: { task_id: 't-4', token: piece } }, messages, approvals)
    }
    routeFrame({ event: 'done', data: { task_id: 't-4' } }, messages, approvals)
    await Promise.resolve()

    const run = messages.runs['t-4']
    expect(hasProtocolMarkers(run?.text ?? '')).toBe(false)
    const human = messages
      .list('c-4')
      .filter((item) => item.kind === 'status')
      .map((item) => item.meta?.statusKey)
    expect(human).toContain('protocolLeak') // 有人话交代 ⇒ 不是"零人话"收口
  })
})

describe('MSG-3266 协议过滤器单元面', () => {
  it('stripDsmlBlocks：整块剥离（容错换行／中文／嵌套引号），非协议文本零扰动', () => {
    const mixed = `前文\n${DSML_BLOCK}\n后文`
    const { text, stripped } = stripDsmlBlocks(mixed)
    expect(hasProtocolMarkers(text)).toBe(false)
    expect(text).toContain('前文')
    expect(text).toContain('后文')
    expect(stripped).toContain('DSML')

    const clean = '普通正文：invoke 这个词不该被误伤'
    expect(stripDsmlBlocks(clean).text).toBe(clean)
  })

  it('状态机 flush：未闭合残块一律归 suppressed（宁丢正文不泄协议）', () => {
    const filter = createProtocolLeakFilter()
    const first = filter.push('人话一段＜｜｜DSML｜｜invoke name="x"＞未闭合')
    expect(hasProtocolMarkers(first.body)).toBe(false)
    expect(first.body).toContain('人话一段')
    const tail = filter.flush()
    expect(hasProtocolMarkers(tail.body)).toBe(false)
    expect(tail.suppressed).toContain('DSML')
  })
})
