// **DEBT-885 红证**：定时任务「打开该次会话」须展示**该次执行的结果全文**。
//
// 病灶（备用3 已实读·本席复读 `ScheduledView.vue:104-109`）：该入口走
// `openRunSession()` ⇒ 落到**镜像会话** `scheduled-<task_id>`；而定时径
// `chat.send`（`crates/daemon/src/scheduled.rs:249`）的消息不进前端所读会话库
// ⇒ **点进去是空会话**（现象：有执行记录、打开却空）。
// 甲案（令文）：该入口改为**展示 `run_results` 全文**（前端面·**不外造后端接口**——
// 用既有 `schedule.run_detail`，即 `loadRunDetail`）。
//
// 判据（三条·③ 为防回归）：
//   ① 点开某次执行 ⇒ **该次**结果全文上屏（改前＝跳空会话·无结果块 ⇒ 红）
//   ② 该次执行**无任何结果文本** ⇒ **明确空态**（不得空白）（改前＝无空态 ⇒ 红）
//   ③ 防回归：既有「最近 3 条自动全文块」仍默认渲染（MSG-3561 C3 不许破）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { router } from '../src/router'
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

/** 第 4 次执行的全文（多行·长·含【END】哨兵）——**超出自动预取窗口**（只预取最近 3 条） */
const FULL4 = `${'甲乙丙丁戊己庚辛壬癸'.repeat(32)}\n第二段：多行不得被并成一行\n第三段【END】`

/** 结果源：只有 run 4 有全文；run 5 **无任何结果文本**（空态面） */
const DETAIL: Record<number, string> = { 4: FULL4 }

function runRow(id: number, summary: string, status = 'success') {
  return { id, task_id: 's1', triggered_at: 1_700_000_000 + id, status, summary, error: '' }
}

const runs = [runRow(1, '第一条产出'), runRow(2, '第二条产出'), runRow(3, '第三条产出'), runRow(4, ''), runRow(5, '', 'skipped')]

/** 挂载 + 展开执行记录（进到 run 行面） */
async function openRuns() {
  const wrapper = mount(ScheduledView, { global: { plugins: [i18n, router] } })
  await flushPromises()
  await wrapper.find('.task-runs-btn').trigger('click')
  await flushPromises()
  return wrapper
}

describe('DEBT-885：「打开该次会话」须展示该次执行结果全文', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    localStorage.clear()
    // 改前该入口会 `router.push('/')`（跳空会话）——此处钉住，使"红"是**干净断言失败**
    vi.spyOn(router, 'push').mockResolvedValue(undefined as never)
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([taskRow])
    vi.spyOn(client, 'scheduleListRuns').mockResolvedValue(runs)
    vi.spyOn(client, 'scheduleRunDetail').mockImplementation(async (params: unknown) => ({
      full_text: DETAIL[(params as { run_id: number }).run_id] ?? '',
    }))
  })

  it('① 点开第 4 次执行 ⇒ 该次结果全文上屏（改前＝跳空会话·无结果块）', async () => {
    const wrapper = await openRuns()
    const opens = wrapper.findAll('.task-run-open')
    expect(opens.length, '每次执行须有"看结果"入口').toBe(runs.length)

    await opens[3].trigger('click')
    await flushPromises()

    const panel = wrapper.find('[data-run-result="4"]')
    expect(panel.exists(), '点开须展开**该次**结果面板（改前＝跳去空会话）').toBe(true)
    expect(panel.text(), '该次结果全文上屏（长文本不得被静默截断）').toContain('【END】')
    expect(panel.text().length, '上屏长度须≈全文（非 200 字截断面）').toBeGreaterThan(300)
    expect(
      wrapper.find('[data-run-result="5"]').exists(),
      '未点开的行不得跟着展开',
    ).toBe(false)
  })

  it('② 该次执行无结果文本 ⇒ 明确空态（不得空白）', async () => {
    const wrapper = await openRuns()
    await wrapper.findAll('.task-run-open')[4].trigger('click')
    await flushPromises()

    const panel = wrapper.find('[data-run-result="5"]')
    expect(panel.exists(), '无结果也须展开面板（不得点了没反应）').toBe(true)
    const empty = wrapper.find('[data-run-empty="5"]')
    expect(empty.exists(), '无结果须给**明确空态**（不得留白）').toBe(true)
    expect(empty.text().trim().length, '空态文案不得为空').toBeGreaterThan(0)
  })

  it('③ 防回归：既有「最近 3 条自动全文块」仍默认渲染（C3 不许破）', async () => {
    const wrapper = await openRuns()
    // 未点任何"看结果"入口时，既有自动预取面仍须在（MSG-3561 ③ 的绿证基座）
    expect(wrapper.find('.task-run-open').exists(), '入口须仍在（MSG-3561 ③ 断言面）').toBe(true)
    expect(
      wrapper.findAll('.task-run-full').length,
      '既有自动全文块不得被本刀删掉',
    ).toBeGreaterThan(0)
  })
})
