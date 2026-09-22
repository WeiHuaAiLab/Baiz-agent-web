// MSG-3375 U-4 红证：`/working` 必须**可见页签**＋**记忆上次页签**。
//
// 现状（在册件 U-4）：`src/router/index.ts` 里 `/working` 死写
// `redirect: '/working/scheduled'`，且 `WorkingView.vue` 只有裸 `<RouterView/>`
// ⇒ 无页签、无记忆（用户切走再回来永远看到"定时任务卡片"）。
//
// 本文件用**真 router 单例**（非替身）解析跳转，故能拒掉"只删 redirect 不加页签"
// 与"只加页签不接记忆"两类错补丁（紧致度见讫报）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhCN from '../src/locales/zh-CN'
import { router } from '../src/router/index'
import WorkingView from '../src/components/working/WorkingView.vue'
import {
  WORKING_DEFAULT_TAB,
  WORKING_TAB_KEY,
  WORKING_TABS,
  readWorkingTab,
  rememberWorkingTab,
  workingTabPath,
} from '../src/utils/workingTabs'
import { useSessionStore } from '../src/stores/session'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 过登录闸：闸读 `auth.loggedIn`（token 源＝sessionStorage） */
function grantLogin() {
  sessionStorage.setItem('baiz_session_token', 'msg3375-test-token')
}

describe('MSG-3375 U-4 ① 页签口径（纯函数）', () => {
  it('无记忆 ⇒ 默认页签（保持既有行为：定时任务）', () => {
    expect(readWorkingTab({ getItem: () => null })).toBe(WORKING_DEFAULT_TAB)
    expect(WORKING_DEFAULT_TAB).toBe('scheduled')
  })

  it('有记忆 ⇒ 取记忆值；非法值 ⇒ 回落默认', () => {
    expect(readWorkingTab({ getItem: () => 'extensions' })).toBe('extensions')
    expect(readWorkingTab({ getItem: () => 'tasks' })).toBe(WORKING_DEFAULT_TAB)
    expect(readWorkingTab({ getItem: () => '' })).toBe(WORKING_DEFAULT_TAB)
  })

  it('存储不可用（null／抛错）⇒ 不抛，回落默认', () => {
    expect(readWorkingTab(null)).toBe(WORKING_DEFAULT_TAB)
    expect(
      readWorkingTab({
        getItem: () => {
          throw new Error('denied')
        },
      }),
    ).toBe(WORKING_DEFAULT_TAB)
  })

  it('写入失败静默（不阻断导航）', () => {
    expect(() =>
      rememberWorkingTab('extensions', {
        setItem: () => {
          throw new Error('quota')
        },
      }),
    ).not.toThrow()
  })

  it('路径真源唯一：页签 ⇄ 路径一一对应', () => {
    expect(WORKING_TABS.map(workingTabPath)).toEqual([
      '/working/scheduled',
      '/working/extensions',
    ])
  })
})

describe('MSG-3375 U-4 ② 真 router：/working 落页签（含记忆）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    grantLogin()
    localStorage.removeItem(WORKING_TAB_KEY)
  })

  it('★无记忆 ⇒ /working 落默认页签（定时任务）', async () => {
    await router.push('/working')
    expect(router.currentRoute.value.path).toBe('/working/scheduled')
  })

  it('★有记忆 ⇒ /working 落**上次页签**（核心：切走再回来不丢页）', async () => {
    localStorage.setItem(WORKING_TAB_KEY, 'extensions')
    await router.push('/chat') // 先离开工作区（模拟"从文件面板切走"）
    await router.push('/working')
    expect(router.currentRoute.value.path).toBe('/working/extensions')
  })

  it('记忆非法值 ⇒ 回落默认（不落 404／空页）', async () => {
    localStorage.setItem(WORKING_TAB_KEY, 'nope')
    await router.push('/working')
    expect(router.currentRoute.value.path).toBe('/working/scheduled')
  })
})

describe('MSG-3375 U-4 ③ WorkingView：可见页签栏', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    grantLogin()
  })

  it('渲染可见页签栏：两枚页签＋当前页高亮（可点得着）', async () => {
    await router.push('/working/extensions')
    const wrapper = mount(WorkingView, {
      global: {
        plugins: [createPinia(), i18n, router],
        stubs: { RouterView: true },
      },
    })
    const tabs = wrapper.findAll('.working-tab')
    expect(tabs).toHaveLength(WORKING_TABS.length)
    expect(tabs.map((t) => t.text())).toEqual([zhCN.working.scheduled, zhCN.working.extensions])
    // 当前页高亮（aria-current 供无障碍与机判同源）
    const current = wrapper.findAll('.working-tab').filter((t) => t.attributes('aria-current'))
    expect(current).toHaveLength(1)
    // 应用用 hash history ⇒ 渲染出的 href 形如 `#/working/extensions`
    expect(current[0]?.attributes('href')).toContain('/working/extensions')
  })

  it('切页签即写记忆（下次回来落该页）', async () => {
    await router.push('/working/scheduled')
    const wrapper = mount(WorkingView, {
      global: { plugins: [createPinia(), i18n, router], stubs: { RouterView: true } },
    })
    await router.push('/working/extensions')
    await wrapper.vm.$nextTick()
    expect(localStorage.getItem(WORKING_TAB_KEY)).toBe('extensions')
  })

  it('会话 store 不受影响（页签导航零副作用）', async () => {
    await router.push('/working/extensions')
    expect(useSessionStore().conversations.length).toBe(0)
  })
})
