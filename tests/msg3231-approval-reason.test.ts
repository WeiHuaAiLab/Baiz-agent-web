// MSG-3231 ③ 红证：审批卡与收件箱显示**理由**（对卯 daemon 侧 MSG-3230 的 `reason`）。
// 改前红：无 `reason` 时显「（未提供理由）」——对用户零信息（令明令该呈现必须消失）。
// 改后绿：有 `reason` 原样显示；缺 ⇒ 可读兜底「需要你确认：<工具> 对 <摘要>」。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
// MSG-3335 G-4：审批卡按上游结构迁至 chat/message/（测试随迁改 import，断言零改）
import ApprovalCard from '../src/components/chat/message/ApprovalCard.vue'
import ApprovalInbox from '../src/components/ApprovalInbox.vue'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useUiStore } from '../src/stores/ui'
import { INBOX_CONVERSATION_ID } from '../src/client/types'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function approvalMessage(meta: Record<string, unknown>) {
  return {
    id: 'm-a1',
    conversationId: 'c-1',
    kind: 'approval' as const,
    text: '',
    createdAt: 1,
    meta: { requestId: 'r-1', toolName: 'shell_exec', ...meta },
  }
}

describe('MSG-3231 ③ 审批理由', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('T1 有 reason ⇒ 卡上**原样**显示', () => {
    const wrapper = mount(ApprovalCard, {
      props: {
        message: approvalMessage({
          reason: '要安装依赖，需要联网下载',
          argsPreview: '{"command":"npm ci"}',
        }) as never,
      },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.approval-reason').text()).toBe('要安装依赖，需要联网下载')
  })

  it('T2 无 reason ⇒ 可读兜底（含工具与摘要），且**不得**出现「未提供理由」', () => {
    const wrapper = mount(ApprovalCard, {
      props: {
        message: approvalMessage({ argsPreview: '{"command":"rm -rf build"}' }) as never,
      },
      global: { plugins: [i18n] },
    })
    const reason = wrapper.find('.approval-reason').text()
    expect(reason).not.toBe('')
    expect(reason).not.toContain('未提供理由')
    expect(reason).toContain('需要你确认')
    expect(reason).toContain('命令')
    expect(reason).toContain('rm -rf build')
  })

  it('T3 收件箱（会话来源行）同样显示理由；缺则兜底、不空', async () => {
    const approvals = useApprovalStore()
    const messages = useMessageStore()
    const ui = useUiStore()
    // 免副作用：挂载期的补拉/规则加载不真跑
    vi.spyOn(messages, 'load').mockResolvedValue(undefined)
    vi.spyOn(approvals, 'loadRules').mockResolvedValue(undefined)
    approvals.pending = [
      {
        request_id: 'r-1',
        action: 'shell_exec',
        risk: 'high',
        details: '{"command":"git push"}',
        reason: '需要你确认推送范围',
        conversationId: 'c-1',
      },
      {
        request_id: 'r-2',
        action: 'fs_write',
        risk: 'medium',
        details: '{"path":"C:/ws/a.txt"}',
        conversationId: 'c-2',
      },
    ]
    ui.inboxOpen = true

    const wrapper = mount(ApprovalInbox, { global: { plugins: [i18n] } })
    const rows = wrapper.findAll('.inbox-row-reason').map((row) => row.text())
    expect(rows[0]).toBe('需要你确认推送范围')
    expect(rows[1]).not.toBe('')
    expect(rows[1]).not.toContain('未提供理由')
    expect(rows[1]).toContain('需要你确认')
    void INBOX_CONVERSATION_ID
  })
})
