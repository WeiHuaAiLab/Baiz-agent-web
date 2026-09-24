// **MSG-3575 前端窗 · `1.0.25` 追加三项 红证／绿证**（令 §一：预设项 UI · P5 降噪 · A1 KB 账号面）
//
// 病灶（改前＝`ad0686a`／`33532f9`）：
//   · **预设项**：首启自带的 `preset-*` 任务**照旧上屏**（用户没建过却"默认有"），且**无清理入口**；
//   · **P5**：外网取件／KB 失败把**原文**（`-32603`／方法名／URL）直接上屏，且**同类重复刷屏**；
//   · **A1**：KB 读面**不分账号**（换账号仍显上一账号／全局配置；登出不失效）。
//
// 判据（红＝改前必红；绿＝本支必绿）：
//   Δ1 预置项**默认不上屏**＋给软隐藏说明与「清理预置项」入口；
//   Δ2 清理**须二次确认**（取消零删）且逐条走 daemon **既有** `schedule.delete`；
//   Δ3 取件/KB 失败 ⇒ **一句人话**（内部号/术语零上屏）＋同类合并「×N」；
//   Δ4 KB 面**按账号**：换账号先清场再重取；未登录**不发读**且不显示；
//   Δ5 普通任务面同口径：预置项软隐藏、清理只删 `preset-*`（用户自建项一字不动）；
//   Δ6 分型/合并/分拣**纯函数**（只认分型词；连续同类才合并；异类与会话失效不误伤）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { router } from '../src/router'
import ScheduledView from '../src/components/working/ScheduledView.vue'
import TasksView from '../src/components/working/TasksView.vue'
import StatusMessage from '../src/components/chat/message/StatusMessage.vue'
import { useAuthStore } from '../src/stores/auth'
import { useKbStore } from '../src/stores/kb'
import { useWorkspaceStore } from '../src/stores/workspace'
import type { ChatMessage } from '../src/models'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 测试账号（**非凭据**：口令/令牌均为假值） */
const ACCT_A = 'acct-a-3575'
const ACCT_B = 'acct-b-3575'

function scheduledRow(id: string, title: string) {
  return {
    id,
    title,
    instruction: '',
    mode: 'cloud',
    cycle: 'daily',
    day: 1,
    weekday: 1,
    time_secs: 9 * 3600,
    every_secs: 0,
    run_at_secs: 0,
    enabled: true,
    created_at: 1,
    updated_at: 1,
  }
}

function statusFailure(text: string): ChatMessage {
  return {
    id: 'm-3575',
    conversationId: 'c-3575',
    kind: 'status',
    text,
    createdAt: 1,
    meta: { status: 'error', statusKey: 'taskError', errorKey: 'unknown' },
  } as ChatMessage
}

describe('MSG-3575 追加三项（预设项 UI · P5 降噪 · A1 KB 账号面）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('Δ1 预置项默认不上屏（软隐藏），并给说明＋清理入口', async () => {
    const auth = useAuthStore()
    auth.sessionToken = 'tok-placeholder'
    auth.userId = ACCT_A
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([
      scheduledRow('preset-1', '每日简报（预置）'),
      scheduledRow('task-user-1', '我的任务'),
    ] as never)

    const wrapper = mount(ScheduledView, { global: { plugins: [i18n, router] } })
    await flushPromises()

    // ★ Δ1（改前必红：预置项照旧在列）
    expect(
      wrapper.findAll('.task-title').map((node) => node.text()),
      '预置项默认不得上屏（软隐藏·不自动删）',
    ).toEqual(['我的任务'])
    expect(wrapper.find('[data-preset-bar="1"]').exists(), '须给软隐藏说明行').toBe(true)
    expect(wrapper.find('.preset-clear').exists(), '须给「清理预置项」入口').toBe(true)
  })

  it('Δ2 清理预置项：取消则零删；确认后逐条走 daemon 既有 schedule.delete', async () => {
    const auth = useAuthStore()
    auth.sessionToken = 'tok-placeholder'
    auth.userId = ACCT_A
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([
      scheduledRow('preset-1', '预置一'),
      scheduledRow('preset-2', '预置二'),
      scheduledRow('task-user-1', '我的任务'),
    ] as never)
    const del = vi.spyOn(client, 'scheduleDelete').mockResolvedValue({ ok: true } as never)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    const wrapper = mount(ScheduledView, { global: { plugins: [i18n, router] } })
    await flushPromises()
    await wrapper.find('.preset-clear').trigger('click')
    await flushPromises()
    // ★ Δ2 前半（红线：删须用户点——取消 ⇒ 一条不删）
    expect(del, '未确认 ⇒ 一条都不得删').not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await wrapper.find('.preset-clear').trigger('click')
    await flushPromises()
    expect(
      del.mock.calls.map((call) => call[0]).sort(),
      '确认后须逐条走既有 schedule.delete（不新增删除通道）',
    ).toEqual(['preset-1', 'preset-2'])
  })

  it('Δ3 取件/KB 失败 ⇒ 一句人话（内部号/术语零上屏）＋同类合并 ×N', async () => {
    const raw =
      'web_fetch 失败：-32603 internal error @ https://hn.algolia.com/api/v1/search?query=x'
    const wrapper = mount(StatusMessage, {
      props: { message: statusFailure(raw), repeat: 3 },
      global: { plugins: [i18n] },
    })
    const text = wrapper.text()
    // ★ Δ3（改前必红：原文直上屏）
    expect(text, '须给一句人话').toContain('网络取件不可用')
    expect(text, '内部号/方法名/URL 一律不得上屏').not.toMatch(/-32603|web_fetch|algolia/)
    expect(text, '同类重复须合并标记').toContain('×3')

    const kbWrapper = mount(StatusMessage, {
      props: { message: statusFailure('kb_list 失败：知识库连接被拒（127.0.0.1:9100）') },
      global: { plugins: [i18n] },
    })
    expect(kbWrapper.text()).toContain('知识库暂不可用')
    expect(kbWrapper.text()).not.toMatch(/kb_list|9100/)
  })

  it('Δ4 A1：KB 面按账号——换账号先清场再重取；未登录不显示且不发读', async () => {
    const auth = useAuthStore()
    const kb = useKbStore()
    const client = getClientSetup().client
    const get = vi.spyOn(client, 'weknoraGetConfig')

    auth.sessionToken = 'tok-placeholder'
    auth.userId = ACCT_A
    get.mockResolvedValue({
      base_url: 'https://kb-a.example.test',
      configured: true,
      source: 'file',
      key_fp: 'ab12',
    } as never)
    await kb.load()
    expect(kb.baseUrl).toBe('https://kb-a.example.test')

    // 换账号 B ⇒ 同步段即**清场**（上一账号 KB 零残留），随后按 B 重取
    auth.userId = ACCT_B
    get.mockResolvedValue({ base_url: '', configured: false, source: '', key_fp: '' } as never)
    const pending = kb.load()
    // ★ Δ4（改前必红：换账号仍显 A 的 base_url）
    expect(kb.baseUrl, '换账号瞬间不得残留上一账号 KB').toBe('')
    expect(kb.configured).toBe(false)
    await pending
    expect(get.mock.calls.length, '换账号须重取（禁用上一账号结果顶账）').toBe(2)

    // 登出 ⇒ 缓存即清；未登录面**不发读**且不显示
    await auth.logout()
    const callsAfterLogout = get.mock.calls.length
    await kb.load()
    expect(get.mock.calls.length, '未登录面不得发读 RPC').toBe(callsAfterLogout)
    expect(kb.baseUrl).toBe('')
    expect(kb.status).toBe('unconfigured')
  })

  it('Δ5 普通任务面：预置项软隐藏；清理只删 preset-*（用户自建项一字不动）', async () => {
    const workspace = useWorkspaceStore()
    workspace.tasks = [
      { id: 'preset-plain-1', title: '预置待办', instruction: '', createdAt: 1 },
      { id: 't-mine', title: '我的待办', instruction: '', createdAt: 2 },
    ]
    const wrapper = mount(TasksView, { global: { plugins: [i18n, router] } })
    await flushPromises()
    // ★ Δ5 前半（改前必红：预置待办照旧在列）
    expect(wrapper.findAll('.task-title').map((node) => node.text())).toEqual(['我的待办'])

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await wrapper.find('.preset-clear').trigger('click')
    await flushPromises()
    expect(
      workspace.tasks.map((task) => task.id),
      '清理只删预置项——用户自建项一字不动',
    ).toEqual(['t-mine'])
  })

})
