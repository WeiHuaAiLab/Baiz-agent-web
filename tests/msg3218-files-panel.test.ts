// MSG-3218（施工11号组）红证：文件面板「授权目录显示不对＋文件打不开」落码修复。
//
// 改前红（真机 201515 现象的单元面再现）：
//   ① 授权目录**单层平铺**——`isDir` 项渲染成不可点开的 `▸ name` ⇒ 子目录里的
//      MD／视频**永不可达**；
//   ② 列目录失败被 `catch { return [] }` 吞成**空表**（tauri.ts / web.ts / store 三处）
//      ⇒ 界面只剩「暂无文件」，零提示；
// 改后绿：目录逐层可展开＋失败给人话提示（含壳侧原文）＋二进制给复制路径兜底。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { resetBridgeForTests } from '../src/bridge'
import type { Bridge, CapabilityName, FileEntry } from '../src/bridge'
import { useFilesStore } from '../src/stores/files'
import FilesPanel from '../src/components/ExtensionPanels/FilesPanel.vue'
import FilePreview from '../src/components/ExtensionPanels/files/FilePreview.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

const ROOT = 'C:/ws/demo'
const DOCS = `${ROOT}/docs`
const MEDIA = `${ROOT}/media`

/** 假盘面：顶层 3 条（2 目录＋1 文件），子层另有 MD／视频——正是真机"里面还有 MD、视频"的形 */
const FAKE_FS: Record<string, FileEntry[]> = {
  [ROOT]: [
    { name: 'docs', path: DOCS, isDir: true },
    { name: 'media', path: MEDIA, isDir: true },
    { name: 'README.md', path: `${ROOT}/README.md`, isDir: false },
  ],
  [DOCS]: [{ name: 'notes.md', path: `${DOCS}/notes.md`, isDir: false }],
  [MEDIA]: [{ name: 'demo.mp4', path: `${MEDIA}/demo.mp4`, isDir: false }],
}

interface FakeOptions {
  failPaths?: string[]
  copied?: string[]
}

function createFakeBridge(options: FakeOptions = {}): Bridge {
  const failPaths = new Set(options.failPaths ?? [])
  const capabilities = new Set<CapabilityName>(['fs.read', 'fs.pickDir', 'clipboard'])
  return {
    runtime: 'tauri',
    capabilities,
    has: (name) => capabilities.has(name),
    fs: {
      async readTextFile() {
        return ''
      },
      async listDir() {
        return []
      },
      async pickAndReadText() {
        return null
      },
      async pickAttachment() {
        return null
      },
      async pickDirectory() {
        return { name: 'demo', path: ROOT }
      },
      async listPickedDirectory(key: string) {
        if (failPaths.has(key)) {
          // 壳侧原文形（host.rs:67）——桥接须原样带上来，禁吞
          throw new Error(`目录读取失败: os error 2`)
        }
        return FAKE_FS[key] ?? []
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
      async writeText(text) {
        options.copied?.push(text)
      },
    },
    notification: {
      async show() {
        /* noop */
      },
    },
    dialog: {
      async openFile() {
        return null
      },
    },
    windowControl: {
      async minimize() {
        /* noop */
      },
      async setAlwaysOnTop() {
        /* noop */
      },
    },
    openExternal: {
      async open() {
        /* noop */
      },
    },
  }
}

const flush = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

function mountPanel() {
  const files = useFilesStore()
  files.pickedDirs[ROOT] = { name: 'demo', path: ROOT }
  return { files, wrapper: mount(FilesPanel, { global: { plugins: [i18n] } }) }
}

/** 展开全部目录（点击 → 取数），返回渲染出的文件按钮文案 */
async function expandAll(wrapper: ReturnType<typeof mount>): Promise<string[]> {
  if (!wrapper.find('.authorized-files').exists()) {
    await wrapper.find('.authorized-dir-name').trigger('click')
    await flush(20)
  }
  for (let round = 0; round < 4; round += 1) {
    const dirs = wrapper
      .findAll('.authorized-dir-entry')
      .filter((dir) => !dir.classes().includes('open'))
    if (dirs.length === 0) break
    for (const dir of dirs) {
      await dir.trigger('click')
    }
    await flush(20)
  }
  return wrapper.findAll('.authorized-file-btn').map((btn) => btn.text())
}

describe('MSG-3218 授权目录树（改前红）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetBridgeForTests(createFakeBridge())
  })

  it('T1 子目录可展开：点 docs → 取该层内容 → 列出 notes.md（改前不可点开）', async () => {
    const { wrapper } = mountPanel()
    await wrapper.find('.authorized-dir-name').trigger('click')
    await flush()

    const dirs = wrapper.findAll('.authorized-dir-entry')
    const docs = dirs.find((dir) => dir.text().includes('docs'))
    expect(docs, '目录项须为可交互行（button.authorized-dir-entry）').toBeTruthy()
    await docs!.trigger('click')
    await flush()

    expect(wrapper.text()).toContain('notes.md')
  })

  it('T2 列目录失败 ⇒ 人话错误可见（含壳侧原文），且不落空表（改前静默兜空）', async () => {
    resetBridgeForTests(createFakeBridge({ failPaths: [ROOT] }))
    const { files, wrapper } = mountPanel()
    await wrapper.find('.authorized-dir-name').trigger('click')
    await flush()

    const error = wrapper.find('.authorized-error')
    expect(error.exists(), '失败须有可见提示面（.authorized-error）').toBe(true)
    expect(error.text()).toContain('目录读取失败')
    expect(error.text()).toContain('重新授权')
    // 禁静默兜空：失败不得被写成"空目录"缓存
    expect(files.dirEntries[ROOT]).toBeUndefined()
    expect(files.dirErrors[ROOT]).toContain('目录读取失败')
    expect(wrapper.findAll('.authorized-file-btn')).toHaveLength(0)
  })

  it('T3 N／M 对卯（假盘面·单元面）：同层条数相等；全量可达件数改前 N>M、改后 N=M', async () => {
    const shellTopLevel = FAKE_FS[ROOT].length // N＝壳侧直读该目录条数（含目录条目）
    const { files, wrapper } = mountPanel()
    await wrapper.find('.authorized-dir-name').trigger('click')
    await flush()
    const frontTopLevel = files.dirEntries[ROOT]?.length ?? 0 // M＝前端该层 entries
    expect(frontTopLevel).toBe(shellTopLevel) // 对卯①：桥接/渲染层**零丢件**（同层）

    // 对卯②：全量可达（递归文件数）——改前只列一层 ⇒ 子层件不可达（差集非空）
    const allFiles = [FAKE_FS[ROOT], FAKE_FS[DOCS], FAKE_FS[MEDIA]]
      .flat()
      .filter((entry) => !entry.isDir)
      .map((entry) => entry.name)
    const beforeFixReachable = FAKE_FS[ROOT].filter((entry) => !entry.isDir).map((e) => e.name)
    expect(allFiles.filter((name) => !beforeFixReachable.includes(name)).sort()).toEqual([
      'demo.mp4',
      'notes.md',
    ])

    const rendered = await expandAll(wrapper)
    expect(rendered.sort()).toEqual(allFiles.sort()) // 改后可达＝全量（差集收空）
  })

  it('T4 目录优先排序（目录在前，其次按名）', async () => {
    const { files } = mountPanel()
    await files.loadAuthorizedDir(ROOT)
    expect(files.dirEntries[ROOT]?.map((entry) => entry.name)).toEqual([
      'docs',
      'media',
      'README.md',
    ])
  })
})

describe('MSG-3218 文件打开面（MD 源码预览／二进制兜底）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetBridgeForTests(createFakeBridge())
  })

  it('T5 点开子目录里的 MD ⇒ FilePreview 走既有源码预览径（loader 注入）', async () => {
    const { files, wrapper } = mountPanel()
    files.setPreviewLoader(async () => new TextEncoder().encode('# 备忘\n正文一行\n'))
    await wrapper.find('.authorized-dir-name').trigger('click')
    await flush()
    await wrapper.findAll('.authorized-dir-entry').find((d) => d.text().includes('docs'))!.trigger('click')
    await flush()
    const md = wrapper.findAll('.authorized-file-btn').find((btn) => btn.text().includes('notes.md'))
    expect(md, '子目录里的 MD 须可点开').toBeTruthy()
    await md!.trigger('click')
    await flush(40)

    expect(wrapper.find('.file-preview').exists()).toBe(true)
    expect(wrapper.find('.preview-name').text()).toContain('notes.md')
    expect(wrapper.find('.preview-code').text()).toContain('正文一行')
  })

  it('T6 视频／二进制：无系统播放器外开能力 ⇒ 给「复制文件路径」兜底出口', async () => {
    const copied: string[] = []
    resetBridgeForTests(createFakeBridge({ copied }))
    const wrapper = mount(FilePreview, {
      props: {
        path: `${MEDIA}/demo.mp4`,
        name: 'demo.mp4',
        loader: async () => new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
      },
      global: { plugins: [i18n] },
    })
    await flush(40)
    expect(wrapper.find('.preview-status').text()).toContain('二进制')

    const copyBtn = wrapper.find('.binary-copy')
    expect(copyBtn.exists(), '二进制／视频须有兜底出口（复制路径）').toBe(true)
    await copyBtn.trigger('click')
    expect(copied).toEqual([`${MEDIA}/demo.mp4`])
  })
})
