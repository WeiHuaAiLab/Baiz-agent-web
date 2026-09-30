// **令·1.0.30 T批 · T5① 前端** 红证／绿证：「申请放行」＝**契约先行未落地**。
//
// 病（真机 R5①）：`ApprovalCard.vue:109-115` → `stores/approval.ts:277+ escalate()`
// → `client/index.ts:191`（`rpc.call('approval.escalate')`）；而 daemon `crates/daemon/src/**`
// **无该分派** ⇒ 落默认臂 ⇒ `-32601`（method_not_found）⇒ 该钮**必报错**。
//
// 本件判据（四甲一乙）：
//   甲① 未实装 ⇒ **人话**上屏，且**保留错误码**（`-32601`）——不许只吐机器语；
//   甲② 未实装 ⇒ **不出现**裸码串（旧口径 `申请放行失败：RPC -32601: method not found`）；
//   甲③ 未实装 ⇒ **禁谎称成功**（不得出现「已申请放行」，钮不得切「已申请」文案）；
//   甲④ 未实装 ⇒ 钮**置灰**（死钮不得反复打服务端）∧ 记档在 **daemon 面**（换卡同置灰）；
//   乙  实装（mock 成功）⇒ **文案不变**（「已申请放行」）∧ 真发 `approval.escalate({request_id})`
//       ∧ **不得**落「本期未开放」态（正向不破）。
// 判据唯一＝`utils/errors.ts::mapRpcError`（`-32601 ⇒ methodNotFound`）——**只认码面**
// （`RpcError.code`），与 `undoAction`／`kb`／`memory` 同法；禁拿消息文本"看着像就归"。
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

/** 未决卡（`approved` 缺 ⇒ `resolved === false` ⇒ 按钮区在屏）；requestId 非空＝可点 */
const PENDING = {
  requestId: 'r-t5',
  toolName: 'shell_exec',
  argsPreview: '{"cmd":"rm -rf build"}',
  reason: '要清构建产物',
  risk: 'medium',
}

function mountCard(meta: MessageMeta = { ...PENDING }) {
  return mount(ApprovalCard, {
    props: {
      message: {
        id: 'm-t5',
        conversationId: 'c-t5',
        kind: 'approval' as const,
        text: '',
        createdAt: Date.now(),
        meta,
      },
    },
    global: { plugins: [i18n] },
  })
}

/** daemon 未实装——**真形**（`RpcError` 带 `code`，与 http／tauri／mock 三运输层同构） */
function methodNotFound() {
  return new RpcError({ code: -32601, message: 'RPC -32601: method not found' })
}

describe('T5① 甲：未实装（-32601）⇒ 人话＋保留错误码＋不谎称成功', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('甲① 人话上屏且**保留错误码**（-32601）——不许只吐机器语', async () => {
    vi.spyOn(getClientSetup().client, 'approvalEscalate').mockRejectedValue(methodNotFound())
    const wrapper = mountCard()
    await wrapper.find('button.escalate').trigger('click')
    await flushPromises()

    const note = wrapper.find('[data-escalate-unsupported="1"]')
    expect(note.exists(), '明白话必须上屏（禁静默吞掉）').toBe(true)
    expect(note.text(), '**保留错误码**：-32601 须逐字可见').toContain('-32601')
    expect(note.text(), '人话须说清"本期未开放"这层语义').toContain('未开放')
  })

  it('甲② 不出现裸码串（旧口径「申请放行失败：RPC -32601: method not found」）', async () => {
    vi.spyOn(getClientSetup().client, 'approvalEscalate').mockRejectedValue(methodNotFound())
    const wrapper = mountCard()
    await wrapper.find('button.escalate').trigger('click')
    await flushPromises()

    const said = useUiStore()
      .toasts.map((item) => item.message)
      .join('｜')
    const onScreen = `${wrapper.text()}｜${said}`
    expect(onScreen, '裸码串不得上屏').not.toContain('method not found')
    expect(onScreen, '裸 RPC 前缀不得上屏').not.toContain('RPC -32601')
    expect(onScreen, '「申请放行失败」这一旧口径整句不得上屏').not.toContain('申请放行失败')
  })

  it('甲③ **禁谎称成功**：不得出现「已申请放行」，钮不得切「已申请」文案', async () => {
    vi.spyOn(getClientSetup().client, 'approvalEscalate').mockRejectedValue(methodNotFound())
    const wrapper = mountCard()
    const btn = wrapper.find('button.escalate')
    expect(btn.text(), '初始文案＝「申请放行」').toBe(zhCN.approval.escalate)
    await btn.trigger('click')
    await flushPromises()

    expect(btn.text(), '未实装 ⇒ 钮文案**不得**切「已申请放行」').toBe(zhCN.approval.escalate)
    expect(wrapper.text(), '全屏不得出现「已申请放行」').not.toContain(zhCN.approval.escalateSent)
    const said = useUiStore()
      .toasts.map((item) => item.message)
      .join('｜')
    expect(said, '不得回「已申请放行」成功回执').not.toContain('已申请放行')
  })

  it('甲④ 钮置灰（死钮不反复打服务端）∧ 记档在 **daemon 面**（另一张卡同置灰）', async () => {
    const escalate = vi
      .spyOn(getClientSetup().client, 'approvalEscalate')
      .mockRejectedValue(methodNotFound())
    const first = mountCard({ ...PENDING, requestId: 'r-t5-a' })
    await first.find('button.escalate').trigger('click')
    await flushPromises()
    expect(escalate).toHaveBeenCalledTimes(1)

    const btn = first.find('button.escalate')
    expect(btn.attributes('disabled'), '未实装 ⇒ 钮**不可点**').toBeDefined()
    await btn.trigger('click')
    await flushPromises()
    expect(escalate, '置灰后不得再发 RPC').toHaveBeenCalledTimes(1)
    expect(useApprovalStore().escalateUnsupported).toBe(true)

    const second = mountCard({ ...PENDING, requestId: 'r-t5-b' })
    expect(
      second.find('button.escalate').attributes('disabled'),
      '记档在 daemon 面 ⇒ 换卡同置灰',
    ).toBeDefined()
    expect(second.find('[data-escalate-unsupported="1"]').exists()).toBe(true)
  })

  it('甲⑤ 非未实装的普通失败（-32603）⇒ 仍走人话 toast＋可重试（原径不破·不误判为未开放）', async () => {
    vi.spyOn(getClientSetup().client, 'approvalEscalate').mockRejectedValue(
      new RpcError({ code: -32603, message: 'transport not connected' }),
    )
    const wrapper = mountCard()
    const btn = wrapper.find('button.escalate')
    await btn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-escalate-unsupported="1"]').exists(), '普通失败≠未实装').toBe(false)
    expect(
      useUiStore()
        .toasts.map((item) => item.message)
        .join('｜'),
      '普通失败须给可读人话（走既有 toast 径）',
    ).toContain('申请放行失败')
    expect(btn.attributes('disabled'), '普通失败 ⇒ 钮仍可重试').toBeUndefined()
    expect(btn.text(), '普通失败不得标「已申请放行」').toBe(zhCN.approval.escalate)
  })
})

describe('T5① 乙：实装（mock 成功）⇒ 文案不变 ∧ 真发 RPC ∧ 不落「未开放」态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('乙 成功径：发 approval.escalate({request_id}) ∧ 文案切「已申请放行」∧ 钮锁死 ∧ 无未开放态', async () => {
    const escalate = vi
      .spyOn(getClientSetup().client, 'approvalEscalate')
      .mockResolvedValue({ escalated: true })
    const wrapper = mountCard()
    const btn = wrapper.find('button.escalate')
    expect(btn.attributes('disabled'), '初始＝可点').toBeUndefined()

    await btn.trigger('click')
    await flushPromises()

    expect(escalate).toHaveBeenCalledTimes(1)
    expect(escalate).toHaveBeenCalledWith({ request_id: 'r-t5' })
    expect(btn.text(), '**成功径文案不变**').toBe(zhCN.approval.escalateSent)
    expect(btn.attributes('disabled'), '已申请 ⇒ 钮锁死').toBeDefined()
    expect(useApprovalStore().escalateUnsupported, '成功径不得落未开放态').toBe(false)
    expect(wrapper.find('[data-escalate-unsupported="1"]').exists()).toBe(false)
    expect(wrapper.find('[data-escalate-error="1"]').exists()).toBe(false)
    expect(
      useUiStore()
        .toasts.map((item) => item.message)
        .join('｜'),
    ).toContain('已申请放行')
  })
})
