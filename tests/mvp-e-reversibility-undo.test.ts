// **令·补24 片 E（P1-8）红证**：可逆性标签 ＋ 消息下方撤销入口。
//
// 铁律：**只认 daemon 实测事实三径**——①回收站策略内 ②daemon 生成之移动/改动清单在位
//       ③备份件已落盘并校验哈希。三者皆无 ⇒ 红字「不可撤销」（fail-closed：不承诺没根据的可逆性）。
// 撤销入口**就在该条消息下方**（不得藏设置页）；后端回滚面属 daemon 片 ⇒ 本片只证「可点＋发出正确请求」，
// 且 daemon 未实装时**人话降级**（禁假装成功——照本仓 `schedule.run_detail` / `audit.execModeChanged` 契约先行同法）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ApprovalCard from '../src/components/chat/message/ApprovalCard.vue'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import zhCN from '../src/locales/zh-CN'
import type { MessageMeta } from '../src/models'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function mountCard(meta: MessageMeta) {
  return mount(ApprovalCard, {
    props: {
      message: {
        id: 'm-e',
        conversationId: 'c-e',
        kind: 'approval' as const,
        text: '',
        createdAt: Date.now(),
        meta,
      },
    },
    global: { plugins: [i18n] },
  })
}

/** 已决（已批准）卡——撤销入口的正当落点（未执行＝无可撤） */
const RESOLVED = {
  requestId: 'r-e',
  toolName: 'write_file',
  argsPreview: '{"path":"src/a.ts"}',
  reason: '要改这个文件',
  risk: 'medium',
  approved: true,
  scope: 'once' as const,
}

describe('片 E ①／② 可逆性标签：只认 daemon 实测事实（三径）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('①三径俱在 ⇒ 显「可撤销（回收站／清单／备份）」', () => {
    const wrapper = mountCard({
      ...RESOLVED,
      recycleBin: true,
      changeManifest: true,
      backupVerified: true,
    })
    const rev = wrapper.find('.rev')
    expect(rev.exists()).toBe(true)
    expect(rev.text()).toBe('可撤销（回收站／清单／备份）')
    expect(rev.attributes('data-reversibility')).toBe('1')
    // 有据＝绿档（复用 risk 徽章同族色调）
    expect(rev.classes()).toContain('low')
  })

  it('①b 部分有据 ⇒ 只列**真有据**的那几径（不得凑数）', () => {
    const wrapper = mountCard({ ...RESOLVED, backupVerified: true })
    expect(wrapper.find('.rev').text()).toBe('可撤销（备份）')
    expect(wrapper.find('.rev').text()).not.toContain('回收站')
  })

  it('②无任何事实依据 ⇒ 红字「不可撤销」（fail-closed）', () => {
    const wrapper = mountCard({ ...RESOLVED })
    const rev = wrapper.find('.rev')
    expect(rev.exists()).toBe(true)
    expect(rev.text()).toBe('不可撤销')
    expect(rev.attributes('data-reversibility')).toBe('0')
    expect(rev.classes()).toContain('high')
  })

  it('②b 假值不算有据：只认 `=== true`（"看着像就归"一律禁）', () => {
    const wrapper = mountCard({
      ...RESOLVED,
      // 非布尔真值一律不算——daemon 未到位时的降级面
      recycleBin: 'yes' as unknown as boolean,
    })
    expect(wrapper.find('.rev').text()).toBe('不可撤销')
    expect(wrapper.find('.rev').attributes('data-reversibility')).toBe('0')
  })

  it('②c 待决卡同显该标签（可逆性是**决策输入**，不是事后说明）', () => {
    const wrapper = mountCard({ ...RESOLVED, approved: undefined, recycleBin: true })
    expect(wrapper.find('.approval-scope').exists()).toBe(true)
    expect(wrapper.find('.rev').text()).toBe('可撤销（回收站）')
    // 未执行 ⇒ 无可撤：撤销钮**不得**出现
    expect(wrapper.find('.approval-undo').exists()).toBe(false)
  })
})

describe('片 E ③ 撤销入口：就在该条消息下方、可点、发出正确请求', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('③a 可逆已决卡 ⇒ 撤销钮在卡内（不藏设置页），点击发出 approval.undo({request_id})', async () => {
    const undo = vi
      .spyOn(getClientSetup().client, 'approvalUndo')
      .mockResolvedValue({ ok: true })
    const wrapper = mountCard({ ...RESOLVED, requestId: 'r-undo', recycleBin: true })

    const btn = wrapper.find('.approval-undo')
    expect(btn.exists(), '撤销入口必须就在该条消息下方').toBe(true)
    expect(btn.attributes('data-undo-request-id')).toBe('r-undo')

    await btn.trigger('click')
    await flushPromises()
    expect(undo).toHaveBeenCalledTimes(1)
    expect(undo).toHaveBeenCalledWith({ request_id: 'r-undo' })
  })

  it('③b 不可逆 ⇒ **不给**撤销钮（按不动的钮比没钮更坏）', () => {
    const wrapper = mountCard({ ...RESOLVED, requestId: 'r-no' })
    expect(wrapper.find('.rev').text()).toBe('不可撤销')
    expect(wrapper.find('.approval-undo').exists()).toBe(false)
  })

  it('③c 被拒／失效卡 ⇒ 无可撤（未执行），无撤销钮', () => {
    const denied = mountCard({ ...RESOLVED, requestId: 'r-deny', approved: false, recycleBin: true })
    expect(denied.find('.approval-undo').exists()).toBe(false)
    const expired = mountCard({
      ...RESOLVED,
      requestId: 'r-exp',
      approved: undefined,
      expired: true,
      recycleBin: true,
    })
    expect(expired.find('.approval-undo').exists()).toBe(false)
  })

  it('③d daemon 未实装（-32601）⇒ 人话降级，**禁假装成功**', async () => {
    vi.spyOn(getClientSetup().client, 'approvalUndo').mockRejectedValue(
      new Error('RPC -32601: method not found'),
    )
    const wrapper = mountCard({ ...RESOLVED, requestId: 'r-404', backupVerified: true })

    await wrapper.find('.approval-undo').trigger('click')
    await flushPromises()

    const err = wrapper.find('[data-undo-error="1"]')
    expect(err.exists(), '失败必须显式上屏人话（禁静默）').toBe(true)
    expect(err.text()).toContain('撤销失败')
    expect(wrapper.text()).not.toContain('已撤销')
  })
})
