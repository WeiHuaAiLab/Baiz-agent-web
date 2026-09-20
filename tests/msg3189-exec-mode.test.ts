// MSG-3189 · E1 介入方式选择器 ＋ E2 安全四钉（前端面）红证：
// ①三档可切＋当前档常显 ②默认＝每次确认 ③**重启不记忆"完全执行"**（fail-closed）
// ④切"完全执行"后**越界写仍被拒**（前端面：不改变任何闸门输入、前端不自动放行）
// ⑤切档审计**有调用**（daemon 未实装 ⇒ 本地留存待补报，不静默丢弃）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { routeFrame } from '../src/client/eventRouter'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import {
  EXEC_MODE_KEY,
  persistedValueFor,
  readPersistedExecMode,
  useExecModeStore,
} from '../src/stores/execMode'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useSettingsStore } from '../src/stores/settings'
import ChatInput from '../src/components/chat/ChatInput.vue'
import { router } from '../src/router'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function mountInput() {
  return mount(ChatInput, { global: { plugins: [i18n, router] } })
}

describe('E2③ · fail-closed：默认每次确认；"完全执行"不跨重启', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    localStorage.clear()
  })

  it('②默认＝每次确认（空存储 / 未知值都回落默认）', () => {
    const mode = useExecModeStore()
    expect(mode.hydrate()).toBe('confirm')
    expect(readPersistedExecMode(null)).toBe('confirm')
    expect(readPersistedExecMode('whatever')).toBe('confirm')
    expect(readPersistedExecMode('auto')).toBe('confirm') // 盘上 auto 也回落（双保险）
  })

  it('③切「完全执行」后：**盘上只存 default**；模拟重启 ⇒ 回到每次确认', async () => {
    const mode = useExecModeStore()
    vi.spyOn(getClientSetup().client, 'auditExecModeChanged').mockResolvedValue({ ok: true })

    await mode.setMode('auto')
    expect(mode.mode).toBe('auto') // 本会话内生效
    expect(localStorage.getItem(EXEC_MODE_KEY)).toBe('confirm') // 盘上**不存 auto**
    expect(persistedValueFor('auto')).toBe('confirm')

    // 模拟重启：新 store 实例 + hydrate（读盘）
    const fresh = useExecModeStore()
    fresh.$reset()
    expect(fresh.hydrate()).toBe('confirm')
    expect(fresh.mode).toBe('confirm')
  })

  it('「计划模式」可跨重启存活（只禁 auto，不禁 plan）', async () => {
    const mode = useExecModeStore()
    vi.spyOn(getClientSetup().client, 'auditExecModeChanged').mockResolvedValue({ ok: true })
    await mode.setMode('plan')
    expect(localStorage.getItem(EXEC_MODE_KEY)).toBe('plan')
    const fresh = useExecModeStore()
    fresh.$reset()
    expect(fresh.hydrate()).toBe('plan')
  })
})

describe('E1 · 选择器（DOM）＋E2②⑤ 切档审计', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    localStorage.clear()
  })

  it('①三档可切＋**当前档常显**（按钮文案随档变）', async () => {
    const mode = useExecModeStore()
    vi.spyOn(getClientSetup().client, 'auditExecModeChanged').mockResolvedValue({ ok: true })
    const wrapper = mountInput()

    // 常显：按钮上就是当前档
    expect(wrapper.find('.exec-mode-label').text()).toBe(zhCN.execMode.confirm)

    // 打开菜单 ⇒ 三档俱在（role=menuitemradio ＋ aria-checked 标当前）
    await wrapper.find('.exec-mode-btn').trigger('click')
    const items = wrapper.findAll('.exec-mode-item')
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.find('.em-name').text())).toEqual([
      zhCN.execMode.plan,
      zhCN.execMode.confirm,
      zhCN.execMode.auto,
    ])
    expect(wrapper.find('.exec-mode-item.active .em-name').text()).toBe(zhCN.execMode.confirm)

    // 切到「完全执行」⇒ 常显文案随动（菜单收起）
    await wrapper.find('.exec-mode-item[data-mode="auto"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(mode.mode).toBe('auto')
    expect(wrapper.find('.exec-mode-label').text()).toBe(zhCN.execMode.auto)
    expect(wrapper.find('.exec-mode-menu').exists()).toBe(false)
  })

  it('⑤切档审计**有调用**：口径＝audit.execModeChanged{mode,previous,at,account}', async () => {
    const audit = vi
      .spyOn(getClientSetup().client, 'auditExecModeChanged')
      .mockResolvedValue({ ok: true })
    const mode = useExecModeStore()
    await mode.setMode('auto')

    expect(audit).toHaveBeenCalledTimes(1)
    const payload = audit.mock.calls[0][0]
    expect(payload).toMatchObject({ mode: 'auto', previous: 'confirm', account: 'local' })
    expect(typeof payload.at).toBe('string')
    expect(Number.isNaN(Date.parse(payload.at))).toBe(false)
    expect(mode.lastAudit).toBe('ok')
    expect(mode.pendingAudits).toHaveLength(0)
  })

  it('⑤daemon 未实装（-32601）⇒ **本地留存待补报**，不静默丢弃', async () => {
    const { RpcError } = await import('../src/client/rpc')
    vi.spyOn(getClientSetup().client, 'auditExecModeChanged').mockRejectedValue(
      new RpcError({ code: -32601, message: 'RPC -32601: method not found' }),
    )
    const mode = useExecModeStore()
    const ok = await mode.setMode('auto')

    expect(ok).toBe(false)
    expect(mode.lastAudit).toBe('pending')
    expect(mode.pendingAudits).toHaveLength(1)
    expect(mode.pendingAudits[0]).toMatchObject({ mode: 'auto', previous: 'confirm' })
  })
})

describe('E2①④ · "完全执行"不得越过沙箱（前端面红证）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    localStorage.clear()
  })

  it('④切 auto **不改变任何闸门输入**：授权目录／工作区原样（不因调档而放宽）', async () => {
    const settings = useSettingsStore()
    const mode = useExecModeStore()
    vi.spyOn(getClientSetup().client, 'auditExecModeChanged').mockResolvedValue({ ok: true })

    settings.addWorkspace('F:/ws-authorized')
    const before = JSON.stringify({
      workspaces: settings.workspaces,
      active: settings.activeWorkspace,
    })

    await mode.setMode('auto')

    const after = JSON.stringify({
      workspaces: settings.workspaces,
      active: settings.activeWorkspace,
    })
    expect(after).toBe(before) // 档位与"授权范围"是两层：调档不动授权面
    // store 面：execMode **只持档位**，不持任何路径/白名单面
    const state = JSON.stringify(mode.$state)
    expect(state).not.toContain('workspace')
    expect(state).not.toContain('authorized')
  })

  it('④切 auto 后：审批帧**照常入队**（前端不因"完全执行"自动放行任何卡）', () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const mode = useExecModeStore()
    mode.mode = 'auto'

    routeFrame(
      {
        event: 'approval.required',
        data: {
          request_id: 'r-auto-1',
          task_id: 't-auto-1',
          tool_name: 'shell_exec',
          args_preview: '{"command":"rm -rf ../outside"}',
          conversation_id: '__inbox__',
          reason: '越界写：沙箱应拒',
          risk: 'high',
        },
      },
      messages,
      approvals,
    )

    // 卡仍在待办（未自动批准）——事前介入档不替代沙箱/审批闸
    expect(approvals.pending.some((item) => item.request_id === 'r-auto-1')).toBe(true)
    expect(approvals.inboxItems).toHaveLength(1)
  })
})
