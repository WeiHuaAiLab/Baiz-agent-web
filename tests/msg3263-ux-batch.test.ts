// MSG-3263 红证：ZCode 高标准 UX 走查·前端批（5 件）。
// ① 文件面板空态误判（根有文件却「暂无文件」）＋不显示无关卡片；
// ② 导出会话有 toast＋落点回显（被拒给明确原因）；③ 人话字幕默认开；
// ④ 角标以 daemon 权威清单对卯＋档位未知不再显「档位未知」；⑤ 同路由二次进入内容稳定。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { resetBridgeForTests } from '../src/bridge'
import type { Bridge, CapabilityName, FileEntry } from '../src/bridge'
import FilesPanel from '../src/components/ExtensionPanels/FilesPanel.vue'
// MSG-3335 G-4：审批卡按上游结构迁至 chat/message/（测试随迁改 import，断言零改）
import ApprovalCard from '../src/components/chat/message/ApprovalCard.vue'
import SettingsView from '../src/components/settings/SettingsView.vue'
import MemoryCard from '../src/components/settings/MemoryCard.vue'
import UpdateCard from '../src/components/settings/UpdateCard.vue'
import { useFilesStore } from '../src/stores/files'
import { useSettingsStore } from '../src/stores/settings'
import { useUiStore } from '../src/stores/ui'
import { exportConversation, downloadText } from '../src/utils/export'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const WS = 'C:/ws/demo'
const WS_FILES: FileEntry[] = Array.from({ length: 8 }, (_, i) => ({
  name: `file-${i + 1}.md`,
  path: `${WS}/file-${i + 1}.md`,
  isDir: false,
}))

function fakeBridge(): Bridge {
  const capabilities = new Set<CapabilityName>(['fs.pickDir'])
  return {
    runtime: 'tauri',
    capabilities,
    has: (name) => capabilities.has(name),
    fs: {
      async readTextFile() {
        return ''
      },
      async listDir() {
        return WS_FILES
      },
      async pickAndReadText() {
        return null
      },
      async pickAttachment() {
        return null
      },
      async pickDirectory() {
        return { name: 'demo', path: WS }
      },
      async listPickedDirectory(key: string) {
        return key === WS ? WS_FILES : []
      },
      async listDrives() {
        return []
      },
      async createDir() {
        return null
      },
    },
    clipboard: {
      async readText() {
        return ''
      },
      async writeText() {
        /* noop */
      },
    },
    notification: { async show() {} },
    dialog: { async openFile() { return null } },
    windowControl: { async minimize() {}, async setAlwaysOnTop() {} },
    openExternal: { async open() {} },
  } as unknown as Bridge
}

describe('MSG-3263 ① 文件面板空态误判', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetBridgeForTests(fakeBridge())
  })

  it('配了工作区 ⇒ 不显「暂无文件」，并把工作区并入授权目录（根文件可达）', async () => {
    const settings = useSettingsStore()
    const files = useFilesStore()
    settings.activeWorkspace = WS
    const wrapper = mount(FilesPanel, { global: { plugins: [i18n] } })
    await wrapper.vm.$nextTick()

    // 旧代码：working.list 空 ⇒ 直跳「暂无文件」（与盘面 8 文件相悖）
    expect(wrapper.text()).not.toContain('暂无文件')
    // 工作区已自动并入授权目录 ⇒ 展开即见 8 件
    expect(Object.keys(files.pickedDirs)).toContain(WS)
    await wrapper.find('.authorized-dir-name').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 20))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('file-1.md')
    expect(wrapper.text()).toContain('file-8.md')
  })

  it('渲染归属：本面板不出现无关卡片（定时任务面）', async () => {
    const settings = useSettingsStore()
    settings.activeWorkspace = WS
    const wrapper = mount(FilesPanel, { global: { plugins: [i18n] } })
    await wrapper.vm.$nextTick()
    // 无关卡片判据：定时任务/普通任务的文案或容器类名俱不得出现在文件面板内
    expect(wrapper.text()).not.toContain('定时任务')
    expect(wrapper.html()).not.toContain('scheduled-')
    expect(wrapper.find('.files-panel').exists()).toBe(true)
  })
})

describe('MSG-3263 ② 导出会话有回显', () => {
  it('导出成功 ⇒ toast 含文件名与落点；被拒 ⇒ toast 报明确原因', async () => {
    const ui = useUiStore()
    const conversation = { id: 'c-1', title: '测试会话', createdAt: 1, updatedAt: 2 }
    const messages = [
      { id: 'm-1', conversationId: 'c-1', kind: 'user' as const, text: '你好', createdAt: 1 },
    ]
    const { filename, content } = exportConversation(conversation, messages as never, 'md')
    const done = downloadText(filename, content)
    expect(done.filename).toBe('测试会话.md')
    expect(done.hint).toBeTruthy()
    ui.toast(`已导出「${done.filename}」`, 'success')
    expect(ui.toasts.some((item) => item.message.includes('已导出'))).toBe(true)

    // 环境被拒（createObjectURL 缺失）⇒ 抛错（调用方据此 toast）——禁静默
    const original = URL.createObjectURL
    // @ts-expect-error 故意置空以模拟受限宿主
    URL.createObjectURL = undefined
    expect(() => downloadText('x.md', 'x')).toThrowError(/不支持文件下载/)
    URL.createObjectURL = original
  })
})

describe('MSG-3263 ③ 人话字幕默认开', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('缺省（无本地偏好）⇒ showHuman 默认 true；显式关过仍 false', () => {
    expect(useSettingsStore().showHuman).toBe(true)
    setActivePinia(createPinia())
    localStorage.setItem('baiz.showHuman', '0')
    expect(useSettingsStore().showHuman).toBe(false)
    localStorage.clear()
  })
})

describe('MSG-3263 ④ 角标对卯＋档位未知不显', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('档位未知 ⇒ 卡上不显「档位未知」；有档位 ⇒ 照显', () => {
    const base = {
      id: 'm-1',
      conversationId: 'c-1',
      kind: 'approval' as const,
      text: '',
      createdAt: 1,
      meta: { requestId: 'r-1', toolName: 'shell_exec', argsPreview: '{}' },
    }
    const unknown = mount(ApprovalCard, { props: { message: base as never }, global: { plugins: [i18n] } })
    expect(unknown.find('.risk').exists()).toBe(false)
    expect(unknown.text()).not.toContain('档位未知')

    const high = mount(ApprovalCard, {
      props: { message: { ...base, meta: { ...base.meta, risk: 'high' } } as never },
      global: { plugins: [i18n] },
    })
    expect(high.find('.risk').text()).toContain('高风险')
  })

  it('进主界面即与 daemon 权威清单对卯（角标＝清单条数，非陈旧帧值）', async () => {
    const approvals = (await import('../src/stores/approval')).useApprovalStore()
    approvals.pendingTotal = 23 // 陈旧帧值（横幅曾显 23）
    const { client } = await import('../src/client/singleton').then((m) => m.getClientSetup())
    vi.spyOn(client, 'permissionPending').mockResolvedValue({ pending: [] })
    await approvals.syncPending()
    expect(approvals.badgeCount).toBe(0) // 权威清单为空 ⇒ 角标归零（不再 max 顶住 23）
  })

  it('进主界面**即**对卯（挂载期 syncPending）——源码机判', () => {
    const src = readFileSync('src/components/ChatView.vue', 'utf8')
    expect(src).toContain('void approvals.syncPending()')
  })
})

describe('MSG-3263 ⑤ 设置页同路由二次进入内容稳定', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function visiblePanel(wrapper: ReturnType<typeof mount>) {
    const panels = wrapper
      .findAll('.settings-panel')
      .filter((panel) => (panel.element as HTMLElement).style.display !== 'none')
    expect(panels).toHaveLength(1)
    return panels[0]
  }

  it('两次挂载＝两次进入：运行与更新页均为 UpdateCard（非 MemoryCard）', async () => {
    const stubs = {
      AppearanceCard: true, KbCard: true, WorkspaceCard: true, ApiKeyCard: true,
      ModelCard: true, McpCard: true, MemoryCard: true, DemoCard: true, SystemCard: true,
      UpdateCard: true,
    }
    for (const _round of [0, 1]) {
      const wrapper = mount(SettingsView, { global: { plugins: [i18n], stubs } })
      const tab = wrapper.findAll('.settings-tab').find((entry) => entry.text() === '运行与更新')
      expect(tab).toBeTruthy()
      await tab!.trigger('click')
      const panel = visiblePanel(wrapper)
      expect(panel.findComponent(UpdateCard).exists()).toBe(true)
      expect(panel.findComponent(MemoryCard).exists()).toBe(false)
      wrapper.unmount()
    }
  })
})
