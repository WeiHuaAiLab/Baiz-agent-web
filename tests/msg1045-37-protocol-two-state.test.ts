// REQ-1045-37 刀②红证：协议泄漏**两态文案**（读后端终帧事实 `protocol_leak`·字段缺失回落）。
//
// 病灶（200-勘 §二·丙）：后端已把完整链 DSML **挽救为真调用并执行**，流式文本仍含协议块
// ⇒ 前端自数 `leakBytes` 照弹「未能解析」（误报「用户以为没执行」）。
// 修后：终帧事实 `{stripped_bytes,salvaged,executed}` 定两态——
//   ① `salvaged && executed` ⇒ 「本轮已按工具协议执行」且**不出现「未能解析」**；
//   ② 否则 ⇒ 文案含「（未执行）」＋重试入口；
//   ③ 字段缺失（旧后端）⇒ 行为与改前同（回落自数：statusKey 仍 `protocolLeak`＋重试）；
//   ④ 零泄漏（无字段，或字段在但 `stripped_bytes:0`）⇒ **不弹任何提示**。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import MessageItem from '../src/components/chat/MessageItem.vue'
import { router } from '../src/router'
import zhCN from '../src/locales/zh-CN'
import enUS from '../src/locales/en-US'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 完整 DSML 块（真机形态）——后端「能挽救」的正是完整链 */
const DSML_BLOCK = [
  '＜｜｜DSML｜｜invoke name="shell_exec"＞',
  '＜｜｜DSML｜｜parameter name="command"＞',
  'echo hi',
  '＜/｜｜DSML｜｜parameter＞',
  '＜/｜｜DSML｜｜invoke＞',
].join('\n')

/** 事实帧：后端终帧 `protocol_leak`（合同：`{stripped_bytes,salvaged,executed}`） */
function leakFact(stripped: number, salvaged: boolean, executed: boolean) {
  return { stripped_bytes: stripped, salvaged, executed }
}

function findStatus(messages: ReturnType<typeof useMessageStore>, convId: string, key: string) {
  return messages.list(convId).find((item) => item.meta?.statusKey === key)
}

function mountStatus(message: NonNullable<ReturnType<typeof findStatus>>) {
  return mount(MessageItem, { props: { message }, global: { plugins: [i18n, router] } })
}

describe('REQ-1045-37 刀② 协议两态文案（读后端终帧事实）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('① 已挽救已执行（salvaged:true,executed:true）⇒「已按工具协议执行」·不含「未能解析」·无重试', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-w1', 'c-w1')
    routeFrame(
      { event: 'token', data: { task_id: 't-w1', token: `改好了。\n${DSML_BLOCK}` } },
      messages,
      approvals,
    )
    routeFrame(
      {
        event: 'done',
        data: { task_id: 't-w1', protocol_leak: leakFact(412, true, true) },
      },
      messages,
      approvals,
    )
    await Promise.resolve()

    const msg = findStatus(messages, 'c-w1', 'protocolLeakExecuted')
    expect(msg, '已挽救例 ⇒ statusKey=protocolLeakExecuted').toBeTruthy()
    expect(msg!.meta?.status).toBe('completed')
    const wrapper = mountStatus(msg!)
    expect(wrapper.text()).toContain('已按工具协议执行')
    expect(wrapper.text()).not.toContain('未能解析')
    expect(wrapper.find('.retry-btn').exists()).toBe(false)
  })

  it('② 未挽救（salvaged/executed 非真）⇒ 文案含「未执行」＋重试入口', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-w2', 'c-w2')
    routeFrame(
      { event: 'token', data: { task_id: 't-w2', token: `改好了。\n${DSML_BLOCK}` } },
      messages,
      approvals,
    )
    routeFrame(
      {
        event: 'done',
        data: { task_id: 't-w2', protocol_leak: leakFact(412, false, false) },
      },
      messages,
      approvals,
    )
    await Promise.resolve()

    const msg = findStatus(messages, 'c-w2', 'protocolLeak')
    expect(msg, '未挽救例 ⇒ statusKey=protocolLeak').toBeTruthy()
    const wrapper = mountStatus(msg!)
    expect(wrapper.text()).toContain('未执行')
    expect(wrapper.text()).not.toContain('已按工具协议执行')
    expect(wrapper.find('.retry-btn').exists()).toBe(true)
  })

  it('③ 字段缺失（旧后端）⇒ 回落：statusKey 仍 protocolLeak＋重试（与改前行为同）', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    messages.ensureRun('t-w3', 'c-w3')
    routeFrame(
      { event: 'token', data: { task_id: 't-w3', token: `改好了。\n${DSML_BLOCK}` } },
      messages,
      approvals,
    )
    routeFrame({ event: 'done', data: { task_id: 't-w3' } }, messages, approvals)
    await Promise.resolve()

    const msg = findStatus(messages, 'c-w3', 'protocolLeak')
    expect(msg, '旧后端（无事实字段）⇒ 回落自数仍弹 protocolLeak').toBeTruthy()
    expect(msg!.meta?.status).toBe('error')
    const wrapper = mountStatus(msg!)
    expect(wrapper.find('.retry-btn').exists()).toBe(true)
  })

  it('④ 零泄漏 ⇒ 不弹任何提示（无字段 / stripped_bytes=0 两景）', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    // ㈠ 旧后端：无字段且无协议文本
    messages.ensureRun('t-w4a', 'c-w4a')
    routeFrame(
      { event: 'token', data: { task_id: 't-w4a', token: '一切正常，无协议文本。' } },
      messages,
      approvals,
    )
    routeFrame({ event: 'done', data: { task_id: 't-w4a' } }, messages, approvals)
    // ㈡ 新后端：字段在位但零剥离
    messages.ensureRun('t-w4b', 'c-w4b')
    routeFrame(
      { event: 'token', data: { task_id: 't-w4b', token: '一切正常，无协议文本。' } },
      messages,
      approvals,
    )
    routeFrame(
      {
        event: 'done',
        data: { task_id: 't-w4b', protocol_leak: leakFact(0, false, false) },
      },
      messages,
      approvals,
    )
    await Promise.resolve()

    for (const conv of ['c-w4a', 'c-w4b']) {
      const statuses = messages.list(conv).filter((item) => item.kind === 'status')
      expect(statuses, `${conv} 零泄漏不得弹任何提示`).toHaveLength(0)
    }
  })

  it('⑤ en 对照两键在位且语义对卯（不得再出现 could not be parsed）', () => {
    expect(zhCN.status.protocolLeakExecuted).toContain('已按工具协议执行')
    expect(zhCN.status.protocolLeak).toContain('未执行')
    expect(enUS.status.protocolLeakExecuted).toBeTruthy()
    expect(enUS.status.protocolLeakExecuted).not.toMatch(/could not be parsed/i)
    expect(enUS.status.protocolLeak).not.toMatch(/could not be parsed/i)
  })
})
