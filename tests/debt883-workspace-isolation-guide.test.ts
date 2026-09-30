// **DEBT-883 红证**：工作区**按账号隔离**——须**明写**，并给**找回旧工作区**入口。
//
// 根因（**不在本场·仅供理解**）：`crates/daemon/src/sse/workspace_config.rs:93`
// `base.join("users").join(account_segment(account_id))`——工作区根**按身份分段**
// （未登录落 `users/__anon__`；头注 `:70-77` 明写 **fail-closed·与登录账号互不可见·不回落**）。
// 换账号 ⇒ 有效根变 ⇒ 旧目录不在新根之下 ⇒ 表现为"没权限"；而设置页**一字未提**，用户无从判断。
//
// 甲案（令文原样，**本席照做**）：**只改文案／引导**——
//   ① 明写「工作区按账号隔离·换账号会换根」；② 给「找回旧工作区」入口；
//   **不动 fail-closed 隔离语义**、**禁自造后端接口**（入口复用既有 `files.authorizeDir`，
//   即桥 `fs.pickDir` 的系统目录选择器——**零新增后端接口**）。
//
// 判据（三条·①②改前皆无 ⇒ 红）：
//   ① 工作区卡明写隔离语义（按账号隔离／换账号会换根）；
//   ② 有「找回旧工作区目录」入口；
//   ③ 入口**真复用既有能力**（点击调 `files.authorizeDir`；选中后入授权根）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import WorkspaceCard from '../src/components/settings/WorkspaceCard.vue'
import { useFilesStore } from '../src/stores/files'
import { useSettingsStore } from '../src/stores/settings'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 旧工作区目录（示例路径·**非真实路径**） */
const LEGACY_DIR = 'C:/Users/example/baiz-workspace/users/old-account'

function mountCard() {
  return mount(WorkspaceCard, { global: { plugins: [i18n] } })
}

describe('DEBT-883：工作区账号隔离须明写＋给找回入口（零后端改动）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('① 明写「按账号隔离·换账号会换根」（改前＝一字未提）', async () => {
    const card = mountCard().find('.settings-card')
    const text = card.text()
    expect(text, '须明写隔离语义（否则用户无从判断"为何没权限"）').toContain('按账号隔离')
    expect(text, '须讲清"换账号会换工作区根"').toContain('换账号')
  })

  it('② 给「找回旧工作区目录」入口（改前＝无）', async () => {
    const wrapper = mountCard()
    expect(
      wrapper.find('.workspace-legacy-entry').exists(),
      '须给找回／迁移旧工作区的入口（改前＝只有一句 dirHint）',
    ).toBe(true)
  })

  it('③ 入口复用既有能力：点击调 files.authorizeDir，选中即入授权根', async () => {
    const wrapper = mountCard()
    const files = useFilesStore()
    const pick = vi
      .spyOn(files, 'authorizeDir')
      .mockResolvedValue({ name: 'old-account', path: LEGACY_DIR })

    await wrapper.find('.workspace-legacy-entry').trigger('click')
    await flushPromises()

    expect(pick, '入口须复用既有 fs.pickDir 能力（零新增后端接口）').toHaveBeenCalled()
    expect(
      useSettingsStore().workspaces,
      '选中旧目录后须入授权根（重新可用＝找回）',
    ).toContain(LEGACY_DIR)
  })
})
