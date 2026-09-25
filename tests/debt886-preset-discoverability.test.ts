// **DEBT-886 红证**：预设项「发现性」——**软隐藏 ≠ 人间蒸发**。
//
// 病灶（备用3「MSG-3575 落地核」）：预置项按设计**软隐藏**（不上屏、**不删一字节数据**），
// 但说明面只有一句「已隐藏 N 个预置项」⇒ 用户既不知**它们还在**、也不知**为何看不到**
// 与**想用怎么办** ⇒ 测试员按"功能没做／找不到入口"立案（发现性缺）。
// 「重置演示数据」在正式版**不渲染**＝`demoResetAvailable()` **按设计收口**（E3 非缺陷），
// 但**须有一句说明**，免得被反复立案。
//
// 判据（三条·改前皆无该文案 ⇒ 红；**零行为改动**——只加文案/引导）：
//   ① `ScheduledView` 预置项条：给出「仍在本地／为何隐藏／怎么办」的引导；
//   ② `TasksView` 同口径（两处 UI 不许一显一隐）；
//   ③ `DemoCard`：给出「正式版不提供此入口」的设计说明（**不改行为**）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { router } from '../src/router'
import ScheduledView from '../src/components/working/ScheduledView.vue'
import TasksView from '../src/components/working/TasksView.vue'
import DemoCard from '../src/components/settings/DemoCard.vue'
import { useAuthStore } from '../src/stores/auth'
import { useWorkspaceStore } from '../src/stores/workspace'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 引导文案的**机判锚**（新文案独有片段——改前 i18n 无此键 ⇒ 渲染成键名 ⇒ 必红） */
const HINT_ANCHOR = '仍在本地'
/** 演示卡说明的机判锚 */
const DEMO_ANCHOR = '仅开发／演示构建可用'

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

describe('DEBT-886：预设项发现性（文案/引导·零行为改动）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('① ScheduledView 预置项条：讲清「仍在本地／为何看不到／怎么办」', async () => {
    const auth = useAuthStore()
    auth.sessionToken = 'tok-placeholder'
    auth.userId = 'acct-886'
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([
      scheduledRow('preset-1', '每日简报（预置）'),
      scheduledRow('task-user-1', '我的任务'),
    ] as never)

    const wrapper = mount(ScheduledView, { global: { plugins: [i18n, router] } })
    await flushPromises()

    const bar = wrapper.find('.preset-bar')
    expect(bar.exists(), '有预置项须显说明条（既有面不许丢）').toBe(true)
    expect(bar.text(), '须讲清"预置项仍在本地"——发现性缺口').toContain(HINT_ANCHOR)
    // 既有入口与既有说明**一字不动**（本刀只加引导）
    expect(bar.text(), '「清理预置项」入口不许丢').toContain('清理预置项')
    expect(bar.text(), '「已隐藏 N 个」既有说明不许丢').toContain('已隐藏')
  })

  it('② TasksView 同口径：普通任务面也给同一引导（两处不许一显一隐）', async () => {
    const workspace = useWorkspaceStore()
    workspace.tasks = [
      { id: 'preset-plain-1', title: '预置待办', instruction: '', createdAt: 1 },
      { id: 't-mine', title: '我的待办', instruction: '', createdAt: 2 },
    ] as never

    const wrapper = mount(TasksView, { global: { plugins: [i18n, router] } })
    await flushPromises()

    const bar = wrapper.find('.preset-bar')
    expect(bar.exists(), '有预置项须显说明条').toBe(true)
    expect(bar.text(), '普通任务面同口径（发现性）').toContain(HINT_ANCHOR)
    expect(bar.text(), '「清理预置项」入口不许丢').toContain('清理预置项')
  })

  it('③ DemoCard：给出「正式版不提供此入口」的设计说明（行为零改）', async () => {
    const wrapper = mount(DemoCard, { global: { plugins: [i18n] } })
    await flushPromises()

    const card = wrapper.find('[data-demo-card]')
    expect(card.exists(), 'dev 构建须渲染演示卡（否则本用例失去意义）').toBe(true)
    expect(card.text(), '须写明"仅开发／演示构建可用"（E3 属设计收口·非缺陷）').toContain(
      DEMO_ANCHOR,
    )
  })
})
