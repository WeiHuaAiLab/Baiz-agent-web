import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMockBridge } from '../src/bridge/mock'
import { resetBridgeForTests } from '../src/bridge'
import { useFilesStore } from '../src/stores/files'
import { useSettingsStore } from '../src/stores/settings'
import { useToolStore } from '../src/stores/tools'
import { createEmptyTaskDraft, useWorkspaceStore } from '../src/stores/workspace'
import { useUiStore } from '../src/stores/ui'
import { useWorkingTreeStore } from '../src/stores/workingTree'
import { useMemoryStore } from '../src/stores/memory'

describe('M3 stores', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('settings：工作区目录增删与激活、key 状态持久化', () => {
    const settings = useSettingsStore()
    settings.addWorkspace('C:/projects/baiz')
    settings.addWorkspace('C:/projects/wechat')
    expect(settings.workspaces).toEqual(['C:/projects/baiz', 'C:/projects/wechat'])
    expect(settings.activeWorkspace).toBe('C:/projects/baiz')

    settings.setActiveWorkspace('C:/projects/wechat')
    expect(settings.activeWorkspace).toBe('C:/projects/wechat')

    settings.removeWorkspace('C:/projects/baiz')
    expect(settings.workspaces).toEqual(['C:/projects/wechat'])

    settings.setKeyConfigured(true)
    expect(localStorage.getItem('baiz.keyConfigured')).toBe('1')
  })

  it('settings：记忆偏好持久化', () => {
    const settings = useSettingsStore()
    settings.setMemoryEnabled(false)
    settings.setMemoryScope('all')
    settings.setAutoDistill(false)
    expect(settings.memoryEnabled).toBe(false)
    expect(settings.memoryScope).toBe('all')
    expect(settings.autoDistill).toBe(false)
    expect(localStorage.getItem('baiz.memoryEnabled')).toBe('0')
    expect(localStorage.getItem('baiz.memoryScope')).toBe('all')
  })

  it('tools：工具与技能开关可切换', () => {
    const tools = useToolStore()
    expect(tools.enabled['shell.exec']).toBe(true)
    tools.toggleTool('shell.exec')
    expect(tools.enabled['shell.exec']).toBe(false)
    expect(tools.skills.length).toBeGreaterThan(0)
    tools.toggleSkill('coding-discipline')
    expect(tools.enabledSkills['coding-discipline']).toBe(false)
  })

  it('files：mock 桥接读目录、读文件、上传解析', async () => {
    resetBridgeForTests(createMockBridge())
    const files = useFilesStore()
    await files.loadDir('/')
    expect(files.entries[0]?.name).toBe('demo.md')
    await files.openPath('/demo/demo.md')
    expect(files.previewName).toBe('demo.md')
    expect(files.content).toContain('mock')
    await files.upload()
    expect(files.previewName).toBe('demo.md')
    files.clearPreview()
    expect(files.previewName).toBe('')
  })

  it('files：附件添加/移除/清空', async () => {
    resetBridgeForTests(createMockBridge())
    const files = useFilesStore()
    await files.attachFromPicker()
    expect(files.attachments).toHaveLength(1)
    expect(files.attachments[0]?.name).toBe('demo.md')
    files.removeAttachment(files.attachments[0]!.id)
    expect(files.attachments).toHaveLength(0)
    await files.attachFromPicker()
    files.clearAttachments()
    expect(files.attachments).toHaveLength(0)
  })

  it('files：授权目录后可读取其中文件（授权非上传）', async () => {
    resetBridgeForTests(createMockBridge())
    const files = useFilesStore()
    const picked = await files.authorizeDir()
    expect(picked).toEqual({ name: 'demo-workspace', path: 'C:/projects/demo-workspace' })
    expect(files.pickedDirs['C:/projects/demo-workspace']?.name).toBe('demo-workspace')

    const entries = await files.loadAuthorizedDir('C:/projects/demo-workspace')
    expect(entries.some((entry) => entry.name === 'Cargo.toml')).toBe(true)
    expect(entries.some((entry) => entry.isDir && entry.name === 'src')).toBe(true)
  })

  it('files：列出盘符并在盘符下新建项目目录', async () => {
    resetBridgeForTests(createMockBridge())
    const files = useFilesStore()
    const drives = await files.listDrives()
    expect(drives).toContain('C:\\')
    expect(drives).toContain('D:\\')

    const created = await files.createDir('C:\\', 'blank-project')
    expect(created).toBe('C:\\blank-project')
    files.bindDir(created!, 'blank-project')
    expect(files.pickedDirs['C:\\blank-project']?.name).toBe('blank-project')
    expect(await files.loadAuthorizedDir('C:\\blank-project')).toEqual([])
  })

  it('workspace：任务创建与定时配置可保存', () => {
    const workspace = useWorkspaceStore()
    workspace.addPlainTask('整理名单', '汇总')
    expect(workspace.tasks[0].schedule).toBeUndefined()
    workspace.addTask({ ...createEmptyTaskDraft(), title: '周报', instruction: '生成周报' })
    expect(workspace.tasks[0].schedule?.cycle).toBe('daily')
    workspace.updateTask(workspace.tasks[0].id, {
      ...(workspace.tasks[0].schedule ?? createEmptyTaskDraft()),
      cycle: 'weekly',
      weekday: 3,
      time: '10:00',
    })
    expect(workspace.tasks[0].schedule?.cycle).toBe('weekly')
    expect(workspace.tasks[0].schedule?.weekday).toBe(3)
  })

  it('ui：toast 入队并自动消失', () => {
    vi.useFakeTimers()
    const ui = useUiStore()
    ui.toast('hello', 'success')
    expect(ui.toasts).toHaveLength(1)
    expect(ui.toasts[0]?.type).toBe('success')
    vi.advanceTimersByTime(3600)
    expect(ui.toasts).toHaveLength(0)
    vi.useRealTimers()
  })

  it('ui：命令面板与引导状态', () => {
    const ui = useUiStore()
    expect(ui.paletteOpen).toBe(false)
    ui.openPalette()
    expect(ui.paletteOpen).toBe(true)
    ui.closePalette()
    expect(ui.paletteOpen).toBe(false)

    ui.completeOnboarding()
    expect(ui.showOnboarding).toBe(false)
    expect(localStorage.getItem('baiz.onboarded')).toBe('1')

    ui.setPendingPrompt('示例')
    expect(ui.pendingPrompt).toBe('示例')
  })

  it('workingTree：种子/选择/变更标记/upsert', () => {
    const working = useWorkingTreeStore()
    working.seedDemo()
    expect(Object.keys(working.files).length).toBeGreaterThan(0)
    expect(working.active).toBeNull()

    const firstPath = working.list[0].path
    working.selectFile(firstPath)
    expect(working.active?.path).toBe(firstPath)
    expect(working.files[firstPath]?.viewed).toBe(true)

    working.noteChange(firstPath)
    expect(working.files[firstPath]?.viewed).toBe(false)

    working.upsert('a/b.ts', '1\n', '1\n2\n')
    expect(working.files['a/b.ts']?.current).toContain('2')

    working.closeViewer()
    expect(working.activePath).toBe('')
  })

  it('workingTree：接受/回滚变更', () => {
    const working = useWorkingTreeStore()
    working.seedDemo()
    const path = working.list[0].path
    working.revertChanges(path)
    expect(working.files[path]?.current).toBe(working.files[path]?.original)
    working.applyChanges(path)
    expect(working.files[path]?.original).toBe(working.files[path]?.current)
  })

  it('memory：种子与逐条删除', () => {
    const memory = useMemoryStore()
    memory.seedDemo()
    expect(memory.facts.length).toBeGreaterThan(0)
    const id = memory.facts[0]?.id
    memory.removeFact(id!)
    expect(memory.facts.some((fact) => fact.id === id)).toBe(false)
  })
})
