// **`1.0.28` · 定时任务详情样式整改 · 红绿两证**（规格件 `outputs\UI整改-定时任务详情-v1.0-20260925.md` §五.2／§五.3）
//
// 改前四病灶（本席实取）：
//   ① `.task-run-full` **全仓无规则**（裸 `<pre>`：无内边距／无 `max-height`／长行横溢）；
//   ② **同段全文渲染两次**：行内 `pre[data-run-full]` ＋ 展开面板内 `pre[data-run-full]`（同条件同内容）；
//   ③ `.task-item { min-height: 120px }`（内容少的卡片留一大片空）；
//   ④ 六个 `task-run-*` 类**俱无规则**；既有 `.task-runs*` 违 `DESIGN.md` §10 四闸
//      （`font-size: 12px` 不在字号集／`padding: 8px 10px`・`margin-top: 6px` 非 4 倍数）。
//
// 闸之性质：**能对真回归报警**——故取「结构（读源码·CSS 规则面）＋行为（DOM 计数）」双层。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

/** 读源码（vitest 之 cwd＝仓根·与 loc／typecheck 门禁同口径） */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const css = read('src/styles/working.css')
const sfc = read('src/components/working/ScheduledView.vue')

/** CSS 规则表：选择器 ⇒ 声明体（多选择器组按组内**逐条**登记；先剥注释） */
function cssRules(source: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const sel of m[1].split(',')) {
      const key = sel.trim().replace(/\s+/g, ' ')
      if (!key) continue
      map.set(key, (map.get(key) ?? '') + m[2])
    }
  }
  return map
}

const rules = cssRules(css)

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

function runRow(id: number, summary: string, status = 'success') {
  return { id, task_id: 's1', triggered_at: 1_700_000_000 + id, status, summary, error: '' }
}

/** 前三条带 summary（对应「最近 3 条自动预取」）·第 4 条空文本（空态面）·第 5 条 `skipped`（未知态） */
const runs = [
  runRow(1, '第一条产出'),
  runRow(2, '第二条产出'),
  runRow(3, '第三条产出'),
  runRow(4, ''),
  runRow(5, '', 'skipped'),
]

describe('1.0.28 定时任务详情样式整改 · 结构闸（规格件 §五）', () => {
  it('① `.task-run-full` 须有规则（内边距＋max-height），不得再是裸 `<pre>`', () => {
    const body = rules.get('.task-run-full')
    expect(body, '`.task-run-full` 须有规则（改前＝全仓 0 条）').toBeTruthy()
    expect(body, '须给内边距').toContain('padding:')
    expect(body, '须限最大高（长全文不外溢）').toContain('max-height:')
  })

  it('② 六个 `task-run-*` 类俱有规则（规格件 §一.1 点名）', () => {
    const six = [
      '.task-run-head',
      '.task-run-full',
      '.task-run-open',
      '.task-run-result',
      '.task-run-loading',
      '.task-run-empty',
    ]
    for (const sel of six) expect(rules.get(sel), `${sel} 须有规则（改前＝俱无）`).toBeTruthy()
  })

  it('③ `.task-item` 不得再撑 `min-height: 120px`', () => {
    expect(rules.get('.task-item') ?? '').not.toMatch(/min-height:\s*120px/)
  })

  it('④ 项目 `DESIGN.md` §10 四闸：本文件零命中（裸 hex／圆角／字号／间距）', () => {
    const decls = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([a-z-]+):\s*([^;]+);/g)]
    // 1) 裸 hex ＝ 0（本文件非 token 定义块）
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], '裸 hex 须为 0').toEqual([])
    // 2) 圆角 ⊆ {4,8,12,16,9999}
    for (const m of decls) {
      if (m[1] !== 'border-radius') continue
      for (const v of m[2].matchAll(/(\d+(?:\.\d+)?)px/g)) {
        expect([4, 8, 12, 16, 9999], `圆角越集：${m[2].trim()}`).toContain(Number(v[1]))
      }
    }
    // 3) 字号 ⊆ {11,13,15,18,22,28}
    for (const m of decls) {
      if (m[1] !== 'font-size') continue
      for (const v of m[2].matchAll(/(\d+(?:\.\d+)?)px/g)) {
        expect([11, 13, 15, 18, 22, 28], `字号越集：${m[2].trim()}`).toContain(Number(v[1]))
      }
    }
    // 4) padding／margin／gap 全 4 倍数
    for (const m of decls) {
      if (!/^(padding|margin|gap)(-(top|right|bottom|left))?$/.test(m[1])) continue
      for (const v of m[2].matchAll(/(\d+(?:\.\d+)?)px/g)) {
        expect(Number(v[1]) % 4, `间距非 4 倍数：${m[1]}: ${m[2].trim()}`).toBe(0)
      }
    }
  })

  it('⑤ 状态徽章四态齐；**未知态不得伪装成功**', () => {
    expect(rules.get('.run-badge'), '`.run-badge` 须有规则').toBeTruthy()
    for (const t of ['.run-badge.tone-ok', '.run-badge.tone-fail', '.run-badge.tone-running', '.run-badge.tone-unknown']) {
      expect(rules.get(t), `${t} 须有规则`).toBeTruthy()
    }
    const unknown = rules.get('.run-badge.tone-unknown') ?? ''
    expect(unknown).toContain('var(--text-secondary)')
    expect(unknown, '未知态不得用成功色').not.toContain('--success')
  })

  it('⑥ 无障碍（结构）：全文块可聚焦＋loading 具 `aria-busy`', () => {
    expect(sfc, '全文块须 `tabindex="0"`（键盘可聚焦）').toMatch(
      /class="task-run-full"[\s\S]{0,200}?tabindex="0"/,
    )
    expect(sfc, '全文块须有 aria-label').toContain('aria-label="执行结果全文"')
    expect(sfc, 'loading 须 `aria-busy="true"`').toMatch(
      /class="task-run-loading"[\s\S]{0,80}?aria-busy="true"/,
    )
  })

  it('⑦ 响应式：<640px 全文降至 160／≥1024px 240', () => {
    expect(css).toContain('@media (max-width: 639px)')
    expect(css).toContain('@media (min-width: 1024px)')
    const narrow = css.slice(css.indexOf('@media (max-width: 639px)'), css.indexOf('@media (min-width: 1024px)'))
    expect(narrow).toContain('max-height: 160px')
  })
})

describe('1.0.28 定时任务详情样式整改 · 行为闸（DOM）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    localStorage.clear()
  })

  it('⑧ 同一段全文**只渲染一次**（展开后不得两份）＋徽章按状态着色', async () => {
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([taskRow] as never)
    vi.spyOn(client, 'scheduleListRuns').mockResolvedValue(runs as never)
    vi.spyOn(client, 'scheduleRunDetail').mockResolvedValue({ full_text: '' } as never)

    const wrapper = mount(ScheduledView, { global: { plugins: [i18n, router] } })
    await flushPromises()
    await wrapper.find('.task-runs-btn').trigger('click')
    await flushPromises()

    const lines = wrapper.findAll('.task-run-line')
    expect(lines.length, '每次执行一行').toBe(runs.length)

    const first = lines[0]
    expect(first.findAll('[data-run-full]').length, 'C3 自动全文块仍在（1 份）').toBe(1)
    await first.find('.task-run-open').trigger('click')
    await flushPromises()
    expect(first.findAll('[data-run-full]').length, '同一段全文不得渲染两份（改前＝2）').toBe(1)

    const badges = wrapper.findAll('.task-run-line .run-badge')
    expect(badges.length, '每次执行须一枚状态徽章').toBe(runs.length)
    expect(badges[0].classes(), 'success ⇒ 成功色').toContain('tone-ok')
    expect(badges[4].classes(), 'skipped ⇒ 未知态（不得伪装成功）').toContain('tone-unknown')

    expect(first.find('.task-run-head .run-badge').exists(), '徽章须在行首（同排）').toBe(true)
    expect(
      first.find('.task-run-head .task-run-summary').text().length,
      '行内须有单行摘要',
    ).toBeGreaterThan(0)
  })
})
