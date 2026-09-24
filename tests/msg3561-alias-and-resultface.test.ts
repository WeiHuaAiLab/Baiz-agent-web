// **MSG-3561 红证／绿证**：单元 B（库名稳定映射＋旧库只增导入）＋ 单元 C3（任务结果面全文）。
//
// 病灶（已定谳）：
//   · **库名随账号字面漂移**：同一账号从邮箱形 `1554408909@qq.com` 变归一形
//     `x-h-1b7249424147d193` ⇒ 库名由 `baiz-u-h70813df3` 变 `baiz-u-x-h-1b7249424147d193`
//     ⇒ **老库不被打开**（"记录从零"）。
//   · **任务结果看不到**：`runs` 只回 200 字截断的 `summary`，web 无结果面。
//
// 判据：①邮箱形与归一形**落同一库**（幂等）②旧库（`baiz`／`baiz-u-*`）**只增导入**当前库、
//       连跑两次**不重复** ③≥300 字答复**全文可见**＋「打开该次会话」入口。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { db, dbNameFor, setDbAccount } from '../src/db'
import { useSessionStore } from '../src/stores/session'
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

/** 测试账号（**非真账号**·凭据零入文）；归一形＝FNV-1a64(邮箱)（与 daemon 派生同源·实测对卯） */
const EMAIL = '1554408909@qq.com'
const NORM = 'x-h-1b7249424147d193'
const OLD_SEG_DB = 'baiz-u-h70813df3'
const CURRENT = 'u-3561'

/** 造一个"旧库"（raw indexedDB·只用于喂迁移器） */
function seedRawDb(
  name: string,
  conversations: Record<string, unknown>[],
  messages: Record<string, unknown>[],
): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      const conn = req.result
      if (!conn.objectStoreNames.contains('conversations')) {
        conn.createObjectStore('conversations', { keyPath: 'id' })
      }
      if (!conn.objectStoreNames.contains('messages')) {
        conn.createObjectStore('messages', { keyPath: 'id' })
      }
    }
    req.onerror = () => resolve()
    req.onsuccess = () => {
      const conn = req.result
      const tx = conn.transaction(['conversations', 'messages'], 'readwrite')
      for (const row of conversations) tx.objectStore('conversations').put(row)
      for (const row of messages) tx.objectStore('messages').put(row)
      tx.oncomplete = () => {
        conn.close()
        resolve()
      }
      tx.onerror = () => {
        conn.close()
        resolve()
      }
    }
  })
}

describe('MSG-3561 库名稳定映射＋结果面全文', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    localStorage.clear()
  })

  it('① 库名稳定：邮箱形与归一形落同一库（重复调用幂等）', () => {
    const first = dbNameFor(EMAIL)
    const second = dbNameFor(EMAIL)
    const normalized = dbNameFor(NORM)
    expect(first, '同一字面重复调用须幂等').toBe(second)
    expect(normalized, '同账号两种字面必须落同一库（禁字面漂移）').toBe(first)
  })

  it('② 旧库只增导入：老数据可见，且连跑两次不重复', async () => {
    await seedRawDb(
      'baiz',
      [{ id: 'c-legacy', title: '旧版会话', createdAt: 1, updatedAt: 1 }],
      [{ id: 'm-legacy', conversationId: 'c-legacy', kind: 'user', text: '旧消息', createdAt: 1 }],
    )
    await seedRawDb(
      OLD_SEG_DB,
      [{ id: 'c-oldseg', title: '旧段会话', createdAt: 2, updatedAt: 2 }],
      [{ id: 'm-oldseg', conversationId: 'c-oldseg', kind: 'user', text: '旧段消息', createdAt: 2 }],
    )
    setDbAccount(CURRENT)
    await useSessionStore().load()
    const rows = await db.conversations.toArray()
    expect(rows.map((r) => r.id).sort(), '旧库数据须只增导入当前库（改前＝0）').toEqual([
      'c-legacy',
      'c-oldseg',
    ])
    // 幂等：再走一次首启径（迁移器重入）⇒ 计数**不变**（不重复导入）
    await useSessionStore().load()
    const after = (await db.conversations.toArray()).length
    expect(after, '迁移器幂等：连跑两次结果一致（不重复导入）').toBe(rows.length)
  })

  it('③ 结果面全文可见（≥300 字不截断）＋「打开该次会话」入口', async () => {
    const full = `${'甲乙丙丁戊己庚辛壬癸'.repeat(32)}【END】` // ≥300 码点
    expect(full.length).toBeGreaterThan(300)
    const client = getClientSetup().client
    vi.spyOn(client, 'scheduleList').mockResolvedValue([
      {
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
      },
    ])
    vi.spyOn(client, 'scheduleListRuns').mockResolvedValue([
      {
        id: 7,
        task_id: 's1',
        triggered_at: 1_700_000_000,
        status: 'success',
        summary: `${full.slice(0, 200)}…`, // 后端截断面（200 字）
        error: '',
        full_text: full, // 结果面全文（C1 落地后由此回）
      },
    ])
    const wrapper = mount(ScheduledView, { global: { plugins: [i18n, router] } })
    await flushPromises()
    await wrapper.find('.task-runs-btn').trigger('click')
    await flushPromises()

    const fullEl = wrapper.find('.task-run-full')
    expect(fullEl.exists(), '结果面须有全文块（改前只有截断的一句话）').toBe(true)
    expect(fullEl.text(), '全文须完整上屏（不得 200 字截断）').toContain('【END】')
    expect(fullEl.text().length, '上屏长度须≈全文').toBeGreaterThan(300)
    expect(wrapper.find('.task-run-open').exists(), '须有「打开该次会话」入口').toBe(true)
  })
})
