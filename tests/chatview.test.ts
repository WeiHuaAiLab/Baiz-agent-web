import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { buildDemoFrames } from '../src/demo/script'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { useSessionStore } from '../src/stores/session'
import { useUiStore } from '../src/stores/ui'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useSettingsStore } from '../src/stores/settings'
import { useFilesStore } from '../src/stores/files'
import ChatView from '../src/components/ChatView.vue'
import { router } from '../src/router'
import { createMockBridge } from '../src/bridge/mock'
import { resetBridgeForTests } from '../src/bridge'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

describe('ChatView 消息流渲染', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('流式期间：真实消息 1 条 + 独立流式尾条；完成后：尾条消失且只留 1 条 assistant', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const session = useSessionStore()
    const conversationId = 'c-1'
    const taskId = 'demo-abc'
    session.activeId = conversationId
    messages.ensureRun(taskId, conversationId)

    const wrapper = mount(ChatView, {
      global: { plugins: [i18n, router] },
    })
    const vm = wrapper.vm as unknown as {
      displayItems: { kind: string }[]
      streamingRuns: unknown[]
    }

    const frames = buildDemoFrames(taskId, '测试')
    for (const frame of frames.slice(0, 5)) {
      routeFrame(frame, messages, approvals)
    }
    await wrapper.vm.$nextTick()

    expect(vm.displayItems.filter((item) => item.kind === 'assistant')).toHaveLength(0)
    expect(vm.streamingRuns).toHaveLength(1)
    expect(wrapper.find('.streaming-tail').exists()).toBe(true)

    for (const frame of frames.slice(5)) {
      routeFrame(frame, messages, approvals)
    }
    await wrapper.vm.$nextTick()

    expect(vm.streamingRuns).toHaveLength(0)
    expect(wrapper.find('.streaming-tail').exists()).toBe(false)
    const assistant = messages.list(conversationId).find((item) => item.kind === 'assistant')
    expect(assistant).toBeDefined()
    expect(assistant?.meta?.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('新建会话：聊天区中央大输入框创建会话', async () => {
    const session = useSessionStore()
    const ui = useUiStore()
    const wrapper = mount(ChatView, {
      global: { plugins: [i18n, router] },
    })

    expect(wrapper.find('.voice-btn').exists()).toBe(true)
    ui.openCreate('session')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.create-center').exists()).toBe(true)
    expect(wrapper.findAll('.option-tabs button')).toHaveLength(2)

    await wrapper.find('.create-center textarea').setValue('新项目会话')
    await wrapper.vm.$nextTick()
    await wrapper.find('.create-center .composer').trigger('submit')
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(ui.createMode).toBe('')
    expect(session.conversations.some((item) => item.title === '新项目会话')).toBe(true)
  })

  it('新建任务：创建普通任务（无定时）', async () => {
    const ui = useUiStore()
    const workspace = useWorkspaceStore()
    const wrapper = mount(ChatView, {
      global: { plugins: [i18n, router] },
    })

    ui.openCreate('task')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.create-center').exists()).toBe(true)
    expect(wrapper.findAll('.option-tabs button')).toHaveLength(3)

    await wrapper.find('.create-center textarea').setValue('整理客户名单')
    await wrapper.vm.$nextTick()
    await wrapper.find('.create-center .composer').trigger('submit')
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(ui.createMode).toBe('')
    expect(workspace.tasks[0]?.title).toBe('整理客户名单')
    expect(workspace.tasks[0]?.schedule).toBeUndefined()
  })

  it('新增定时任务：完整表单创建定时任务', async () => {
    const ui = useUiStore()
    const workspace = useWorkspaceStore()
    const wrapper = mount(ChatView, {
      global: { plugins: [i18n, router] },
    })

    ui.openCreate('scheduled')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.task-form').exists()).toBe(true)

    await wrapper.find('.task-form .field input').setValue('每日日报')
    await wrapper.vm.$nextTick()
    await wrapper.find('.create-card .btn-primary').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(ui.createMode).toBe('')
    expect(workspace.tasks[0]?.title).toBe('每日日报')
    expect(workspace.tasks[0]?.schedule?.cycle).toBe('daily')
  })

  it('工作区：未选文件夹时阻止提交，选择后可创建', async () => {
    const ui = useUiStore()
    const workspace = useWorkspaceStore()
    const settings = useSettingsStore()
    const wrapper = mount(ChatView, {
      global: { plugins: [i18n, router] },
    })

    ui.openCreate('task')
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as unknown as { projectOption: string; chosenDir: string }
    vm.projectOption = 'folder'

    await wrapper.find('.create-center textarea').setValue('任务A')
    await wrapper.vm.$nextTick()
    await wrapper.find('.create-center .composer').trigger('submit')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(workspace.tasks).toHaveLength(0)
    expect(ui.createMode).toBe('task')

    vm.chosenDir = 'C:/projects/x'
    await wrapper.find('.create-center .composer').trigger('submit')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(workspace.tasks[0]?.title).toBe('任务A')
    expect(settings.workspaces).toContain('C:/projects/x')
  })

  it('新建空白项目：选择盘符 + 新建文件夹后才能提交', async () => {
    resetBridgeForTests(createMockBridge())
    const ui = useUiStore()
    const workspace = useWorkspaceStore()
    const settings = useSettingsStore()
    const files = useFilesStore()
    const wrapper = mount(ChatView, {
      global: { plugins: [i18n, router] },
    })

    ui.openCreate('task')
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as unknown as {
      projectOption: string
      selectedDrive: string
      newProjectName: string
    }
    vm.projectOption = 'new'
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(wrapper.find('.location-picker').exists()).toBe(true)
    expect(wrapper.findAll('.drive-select option').length).toBeGreaterThan(0)

    // 未创建目录直接提交 → 阻止
    await wrapper.find('.create-center textarea').setValue('任务A')
    await wrapper.vm.$nextTick()
    await wrapper.find('.create-center .composer').trigger('submit')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(workspace.tasks).toHaveLength(0)
    expect(ui.createMode).toBe('task')

    // 创建项目目录后提交 → 成功并绑定授权工作区
    vm.newProjectName = '财务分析'
    await wrapper.vm.$nextTick()
    await wrapper.find('.location-picker .btn-primary').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(files.pickedDirs['C:\\财务分析']?.name).toBe('财务分析')
    expect(settings.workspaces).toContain('C:\\财务分析')

    await wrapper.find('.create-center .composer').trigger('submit')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(ui.createMode).toBe('')
    expect(workspace.tasks[0]?.title).toBe('任务A')
    expect(settings.activeWorkspace).toBe('C:\\财务分析')
  })
})
