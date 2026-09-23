// **MSG-3511 S1** 视图面红证件：列表/执行记录/删除/错误人话**全接 daemon**。
// 红证针：把 `loadScheduledTasks`／`loadTaskRuns` 的接线注掉 ⇒ 本件必红（见讫报 §二.2）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import ScheduledView from '../src/components/working/ScheduledView.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const taskRow = {
  id: 's1',
  title: '每日日报',
  instruction: '每天 09:00 生成日报',
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

describe('MSG-3511 S1：定时任务子页接线', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('列表读 daemon；展开「执行记录」真拉 runs；删除接 daemon', async () => {
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([taskRow])
    vi.spyOn(client, 'scheduleListRuns').mockResolvedValue([
      {
        id: 7,
        task_id: 's1',
        triggered_at: 1_700_000_000,
        status: 'success',
        summary: '产出：日报.md',
        error: '',
      },
    ])
    const del = vi.spyOn(client, 'scheduleDelete').mockResolvedValue({ ok: true })

    const wrapper = mount(ScheduledView, { global: { plugins: [i18n] } })
    await flushPromises()

    // 列表来自 daemon（不再是内存 store 的演示数据）
    expect(client.scheduleList).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('每日日报')
    expect(wrapper.text()).not.toContain('Rust 工具箱每周备份')

    // 展开执行记录 ⇒ 真调 list_runs，并看得见产出与状态人话
    await wrapper.find('.task-runs-btn').trigger('click')
    await flushPromises()
    expect(client.scheduleListRuns).toHaveBeenCalledWith('s1', 10)
    expect(wrapper.text()).toContain('成功')
    expect(wrapper.text()).toContain('产出：日报.md')

    // 删除按钮在（旧模板有、接线刀必须保留）——**MSG-3528：删除须先确认**
    // （"不得一键无声删"：确认后才真调 `schedule.delete`）
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper.find('.task-del').trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalled()
    // **取消确认 ⇒ 不得删**（此时行仍在：下方"确认后真删"仍可点）
    expect(del).not.toHaveBeenCalled()

    // 确认 ⇒ 真调 daemon 删除（随后行从列表摘除）
    confirmSpy.mockReturnValue(true)
    await wrapper.find('.task-del').trigger('click')
    await flushPromises()
    expect(del).toHaveBeenCalledWith('s1')
    expect(del).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })

  it('拉取失败 ⇒ 顶部错误行给人话（不得空白）', async () => {
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockRejectedValue(
      new Error('schedule.list 失败: 未登录——定时任务须归属某个账号'),
    )
    const wrapper = mount(ScheduledView, { global: { plugins: [i18n] } })
    await flushPromises()

    const err = wrapper.find('.scheduled-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('未登录')
    expect(err.text().trim().length).toBeGreaterThan(0)
  })

  it('空表 ⇒ 空态文案（不得空白）', async () => {
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([])
    const wrapper = mount(ScheduledView, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain(zhCN.working.emptyScheduledTitle)
  })
})
