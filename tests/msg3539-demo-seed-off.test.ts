// MSG-3539 刀①红证：**web 演示会话"默认不播"**
//
// 病灶（跨族外审：智谱判词第 11 条 · 千问判词 A·3(a)）：`App.vue` `onMounted` 里
// `await seedDemoIfNeeded()` **无条件**执行 ⇒ 用户装完首启即被塞 3 条假会话
// （"今日客户总结／Rust 项目重构／周报起草"）——**演示面冒充用户数据**。
//
// 判据（令 §一·1）：改后 `seedDemoIfNeeded()` 只受**显式 demo 闸门**（`settings.demoMode`，
// 与下两行 `working.seedDemo()`／`memory.seedDemo()` 同闸）控制；`demoMode` 缺省 `false`
// ⇒ **默认不播**。
//
// 红证口径（令 §一·1「用例须能失败在"播了"这一面」）：
//   · **旧态（缺闸）⇒ 本件①必红**（首启落 3 条 `seed-conv-*`）；
//   · **新态（有闸）⇒ 复绿**；②证明**显式 demo 态仍能播**（演示面不废·非"一刀砍死"）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import App from '../src/App.vue'
import { router } from '../src/router'
import { db, setDbAccount } from '../src/db'
import { useSettingsStore } from '../src/stores/settings'
import zhCN from '../src/locales/zh-CN'
import enUS from '../src/locales/en-US'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
})

/** 演示种子的判别形：id 前缀 `seed-`（`seedDemoIfNeeded` 恒用此形）。 */
async function seedRows(): Promise<string[]> {
  const rows = await db.conversations.toArray()
  return rows.filter((row) => row.id.startsWith('seed-')).map((row) => row.id)
}

/** 放干挂载期的异步链：`seedDemoIfNeeded → session.load → session.create`（均含 IndexedDB 往返）。 */
async function settle(times = 12): Promise<void> {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

function newPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

async function mountApp(pinia: ReturnType<typeof createPinia>) {
  const wrapper = mount(App, { global: { plugins: [pinia, i18n, router] } })
  await settle()
  return wrapper
}

beforeEach(async () => {
  setDbAccount('')
  await db.conversations.clear()
  await db.messages.clear()
  await db.drafts.clear()
  localStorage.clear()
})

describe('MSG-3539 刀① · 演示会话默认不播', () => {
  it('① 缺省（demoMode=false）⇒ 首启零 seed 会话（**旧态此处必红**）', async () => {
    const pinia = newPinia()
    expect(useSettingsStore(pinia).demoMode).toBe(false)
    const wrapper = await mountApp(pinia)
    expect(await seedRows()).toEqual([])
    expect(localStorage.getItem('baiz.seeded')).not.toBe('1')
    wrapper.unmount()
  })

  it('② 显式 demo 态（demoMode=true）⇒ 仍播 3 条（演示面不废）', async () => {
    const pinia = newPinia()
    useSettingsStore(pinia).setDemoMode(true)
    const wrapper = await mountApp(pinia)
    expect((await seedRows()).length).toBe(3)
    wrapper.unmount()
  })
})
