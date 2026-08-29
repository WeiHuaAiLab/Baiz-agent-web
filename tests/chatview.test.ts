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
import CreateProject from '../src/components/chat/CreateProject.vue'
import CreateTask from '../src/components/chat/CreateTask.vue'
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

    const frames = buildDemoFrames(taskId, '测试')
    for (const frame of frames.slice(0, 5)) {
      routeFrame(frame, messages, approvals)
    }
    await wrapper.vm.$nextTick()

    expect(messages.list(conversationId).filter((item) => item.kind === 'assistant')).toHaveLength(0)
    expect(messages.activeRuns(conversationId)).toHaveLength(1)
    expect(wrapper.find('.streaming-tail').exists()).toBe(true)

    for (const frame of frames.slice(5)) {
      routeFrame(frame, messages, approvals)
    }
    await wrapper.vm.$nextTick()

    expect(messages.activeRuns(conversationId)).toHaveLength(0)
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

    expect(wrapper.find('.act-project-btn').exists()).toBe(true)
    ui.openCreate('session')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.create-center').exists()).toBe(true)
    // 项目选择已并入输入框加号左侧的下拉，而非顶部并排按钮
    expect(wrapper.find('.composer-picker-wrap').exists()).toBe(true)

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
    // 项目选择器位于输入框加号左侧
    expect(wrapper.find('.composer-picker-wrap').exists()).toBe(true)

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
    // CreateTask 由 App.vue 全局挂载（createMode === 'scheduled'），此处独立挂载验证表单
    const wrapper = mount(CreateTask, { global: { plugins: [i18n] } })

    expect(wrapper.find('.modal-create-task').exists()).toBe(true)

    // 名称为空/指令为空时创建按钮禁用；名称+指令必填
    expect((wrapper.find('.btn-primary').element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.findAll('.modal-input')[0].setValue('每日日报')
    await wrapper.find('.modal-textarea').setValue('每天生成日报')
    await wrapper.vm.$nextTick()
    expect((wrapper.find('.btn-primary').element as HTMLButtonElement).disabled).toBe(false)

    await wrapper.find('.btn-primary').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(ui.createMode).toBe('')
    expect(workspace.tasks[0]?.title).toBe('每日日报')
    expect(workspace.tasks[0]?.schedule?.cycle).toBe('daily')
  })

  it('项目选择器：下拉选择项目，创建任务时携带 projectId', async () => {
    const ui = useUiStore()
    const workspace = useWorkspaceStore()
    const wrapper = mount(ChatView, {
      global: { plugins: [i18n, router] },
    })

    ui.openCreate('task')
    await wrapper.vm.$nextTick()

    // 打开输入框加号左侧的项目下拉：展示项目列表
    await wrapper.find('.act-project-btn').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.picker-item').length).toBeGreaterThan(0)

    // 选中第一个项目：按钮显示项目名并高亮
    const first = workspace.projects[0]!
    await wrapper.findAll('.picker-item')[0].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.act-project').text()).toBe(first.title)
    expect(wrapper.find('.act-project-btn.picked').exists()).toBe(true)

    // 创建任务：自动携带选中的 projectId
    await wrapper.find('.create-center textarea').setValue('整理客户名单')
    await wrapper.vm.$nextTick()
    await wrapper.find('.create-center .composer').trigger('submit')
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(ui.createMode).toBe('')
    expect(workspace.tasks[0]?.title).toBe('整理客户名单')
    expect(workspace.tasks[0]?.projectId).toBe(first.id)
  })

  it('新建项目：CreateProject 表单填写名称并选择路径后创建', async () => {
    resetBridgeForTests(createMockBridge())
    const ui = useUiStore()
    const workspace = useWorkspaceStore()
    const settings = useSettingsStore()
    const files = useFilesStore()
    const wrapper = mount(CreateProject, { global: { plugins: [i18n] } })

    // 名称为空时创建按钮禁用
    expect((wrapper.find('.btn-primary').element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('.modal-input').setValue('财务分析')
    await wrapper.vm.$nextTick()
    expect((wrapper.find('.btn-primary').element as HTMLButtonElement).disabled).toBe(false)

    // 选择项目路径（mock 桥接授权 demo-workspace）
    await wrapper.find('.path-picker').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(wrapper.find('.path-text').text()).toContain('demo-workspace')

    await wrapper.find('.btn-primary').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(workspace.projects[0]?.title).toBe('财务分析')
    expect(files.pickedDirs['C:/projects/demo-workspace']?.name).toBe('demo-workspace')
    expect(settings.workspaces).toContain('C:/projects/demo-workspace')
    expect(settings.activeWorkspace).toBe('C:/projects/demo-workspace')
    // 非回归上下文（未设置 createReturn）：创建完成后直接关闭
    expect(ui.createMode).toBe('')
  })
})
