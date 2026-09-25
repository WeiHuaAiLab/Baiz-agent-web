// **令·补26 §一**（撤销「诚实降级」）红证：`approval.undo` 未实装（`-32601`）⇒ 撤销钮**置灰**（不可点）
// ＋ 明白话「本次改动不可自动回滚」；**禁**把 `-32601` 渲染成成功、**禁**静默吞掉。双向：
//   甲 未实装 ⇒ 钮不可点 ∧ 文案含「不可自动回滚」∧ 无「已撤销」∧ 不落回「撤销失败」重试径；
//   乙 实装后（mock 成功）⇒ 钮**可点** ∧ 走成功径（真发 `approval.undo({request_id})` ＋ 成功回执）。
// 判据唯一＝`utils/errors.ts::mapRpcError`（`-32601 ⇒ methodNotFound`）——与 `stores/kb.ts`／`memory.ts` 同法：
// **只认码面**（`RpcError.code`），禁拿消息文本"看着像就归"（第二套真源）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { RpcError } from '../src/client/rpc'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import ApprovalCard from '../src/components/chat/message/ApprovalCard.vue'
import { useApprovalStore } from '../src/stores/approval'
import { useUiStore } from '../src/stores/ui'
import zhCN from '../src/locales/zh-CN'
import type { MessageMeta } from '../src/models'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 已决（approved）＋ 有据（备份在盘）＝撤销入口的正当落点（`face.canUndo === true`） */
const RESOLVED = {
  requestId: 'r-e2',
  toolName: 'write_file',
  argsPreview: '{"path":"src/a.ts"}',
  reason: '要改这个文件',
  risk: 'medium',
  approved: true,
  scope: 'once' as const,
  backupVerified: true,
}

function mountCard(meta: MessageMeta) {
  return mount(ApprovalCard, {
    props: {
      message: {
        id: 'm-e2',
        conversationId: 'c-e2',
        kind: 'approval' as const,
        text: '',
        createdAt: Date.now(),
        meta,
      },
    },
    global: { plugins: [i18n] },
  })
}

/** daemon 回滚面未实装——**真形**（`RpcError` 带 `code`，与 http／tauri／mock 三运输层同构） */
function methodNotFound() {
  return new RpcError({ code: -32601, message: 'RPC -32601: method not found' })
}

describe('令·补26 §一 甲：未实装（-32601）⇒ 钮不可点 ＋「不可自动回滚」', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('甲① 未实装 ⇒ 钮置灰（再点不发 RPC）∧ 文案含「不可自动回滚」∧ 无「已撤销」', async () => {
    const undo = vi.spyOn(getClientSetup().client, 'approvalUndo').mockRejectedValue(methodNotFound())
    const wrapper = mountCard({ ...RESOLVED })

    await wrapper.find('.approval-undo').trigger('click')
    await flushPromises()
    expect(undo).toHaveBeenCalledTimes(1)

    const btn = wrapper.find('.approval-undo')
    expect(btn.attributes('disabled'), '未实装 ⇒ 钮**不可点**').toBeDefined()
    await btn.trigger('click')
    await flushPromises()
    expect(undo, '置灰后不得再发 RPC（死钮不得反复打服务端）').toHaveBeenCalledTimes(1)

    const note = wrapper.find('[data-undo-unsupported="1"]')
    expect(note.exists(), '明白话必须上屏（禁静默吞掉）').toBe(true)
    expect(note.text()).toContain('不可自动回滚')
    expect(
      wrapper.find('[data-undo-error="1"]').exists(),
      '未实装不是普通失败——不得落回「撤销失败…重试」径',
    ).toBe(false)
    expect(wrapper.text()).not.toContain('已撤销')
    expect(useApprovalStore().undoUnsupported).toBe(true)
  })

  it('甲② 记档在 **daemon 面**（非单卡）：另一张卡同置灰、同文案', async () => {
    vi.spyOn(getClientSetup().client, 'approvalUndo').mockRejectedValue(methodNotFound())
    const first = mountCard({ ...RESOLVED, requestId: 'r-1' })
    await first.find('.approval-undo').trigger('click')
    await flushPromises()

    const second = mountCard({ ...RESOLVED, requestId: 'r-2' })
    expect(second.find('.approval-undo').attributes('disabled')).toBeDefined()
    expect(second.find('[data-undo-unsupported="1"]').text()).toContain('不可自动回滚')
  })

  it('甲③ 未实装 ⇒ **零**「已请求回滚」成功回执（禁假成功）', async () => {
    vi.spyOn(getClientSetup().client, 'approvalUndo').mockRejectedValue(methodNotFound())
    const wrapper = mountCard({ ...RESOLVED, requestId: 'r-3' })
    await wrapper.find('.approval-undo').trigger('click')
    await flushPromises()

    const said = useUiStore().toasts.map((item) => item.message).join('｜')
    expect(said, '未实装不得回「已请求回滚」').not.toContain('已请求回滚')
    expect(wrapper.text()).not.toContain('已撤销')
  })

  it('甲④ 卡内「撤销失败」行**不遮**置灰理由（两桩事实并存，禁互相盖掉）', async () => {
    const undo = vi.spyOn(getClientSetup().client, 'approvalUndo')
    // 卡 A：普通失败（-32603：非未实装）⇒ 人话上屏，钮仍可点（原行为不破）
    undo.mockRejectedValueOnce(new RpcError({ code: -32603, message: 'transport not connected' }))
    const a = mountCard({ ...RESOLVED, requestId: 'r-a' })
    await a.find('.approval-undo').trigger('click')
    await flushPromises()
    expect(a.find('[data-undo-error="1"]').exists()).toBe(true)
    expect(a.find('.approval-undo').attributes('disabled')).toBeUndefined()

    // 卡 B：得知回滚面未实装 ⇒ daemon 面记档
    undo.mockRejectedValue(methodNotFound())
    const b = mountCard({ ...RESOLVED, requestId: 'r-b' })
    await b.find('.approval-undo').trigger('click')
    await flushPromises()

    expect(a.find('[data-undo-error="1"]').exists(), '失败人话仍在（禁静默吞）').toBe(true)
    expect(a.find('.approval-undo').attributes('disabled'), 'A 卡钮同置灰（daemon 面）').toBeDefined()
    expect(a.find('[data-undo-unsupported="1"]').text(), '置灰理由不得被错误行遮掉').toContain('不可自动回滚')
  })
})

describe('令·补26 §一 乙：实装后（mock 成功）⇒ 钮可点且走成功径', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('乙 可点 ∧ 发出 approval.undo({request_id}) ∧ 成功回执 ∧ 不落「不可回滚」态', async () => {
    const undo = vi.spyOn(getClientSetup().client, 'approvalUndo').mockResolvedValue({ ok: true })
    const wrapper = mountCard({ ...RESOLVED, requestId: 'r-ok' })

    expect(wrapper.find('.approval-undo').attributes('disabled'), '实装面 ⇒ 钮**可点**').toBeUndefined()
    await wrapper.find('.approval-undo').trigger('click')
    await flushPromises()

    expect(undo).toHaveBeenCalledTimes(1)
    expect(undo).toHaveBeenCalledWith({ request_id: 'r-ok' })
    expect(useApprovalStore().undoUnsupported).toBe(false)
    expect(wrapper.find('.approval-undo').attributes('disabled'), '成功径不得把钮锁死').toBeUndefined()
    expect(wrapper.text()).not.toContain('不可自动回滚')
    expect(wrapper.find('[data-undo-error="1"]').exists()).toBe(false)
    expect(useUiStore().toasts.map((item) => item.message).join('｜')).toContain('已请求回滚')
  })
})
