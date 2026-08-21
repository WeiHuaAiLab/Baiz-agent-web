import type { Bridge, CapabilityName, FileEntry } from './types'

// Mock 桥接：演示与测试用假文件系统/剪贴板。
export function createMockBridge(): Bridge {
  const capabilities = new Set<CapabilityName>([
    'fs.read',
    'fs.pick',
    'fs.pickDir',
    'fs.drives',
    'fs.createDir',
    'clipboard',
    'notification',
    'dialog',
    'window.control',
    'open.external',
  ])
  const files: FileEntry[] = [{ name: 'demo.md', path: '/demo/demo.md', isDir: false }]
  const createdDirs = new Map<string, string[]>()

  return {
    runtime: 'web',
    capabilities,
    has: (name) => capabilities.has(name),
    fs: {
      async readTextFile() {
        return '# mock file\n\n骨架演示：本机文件读取将在 Tauri 形态生效。\n'
      },
      async listDir() {
        return files
      },
      async pickAndReadText() {
        return {
          name: 'demo.md',
          content:
            '# 演示文件\n\n这是通过 bridge.pickAndReadText 读入的 mock 内容。\n\n| 列A | 列B |\n|---|---|\n| 1 | 2 |\n',
        }
      },
      async pickDirectory() {
        return { name: 'demo-workspace', path: 'C:/projects/demo-workspace' }
      },
      async listPickedDirectory(key: string) {
        if (createdDirs.has(key)) return []
        return [
          { name: 'Cargo.toml', path: `${key}/Cargo.toml`, isDir: false },
          { name: 'src', path: `${key}/src`, isDir: true },
          { name: 'README.md', path: `${key}/README.md`, isDir: false },
        ]
      },
      async listDrives() {
        return ['C:\\', 'D:\\']
      },
      async createDir(parent: string, name: string) {
        const sep = parent.endsWith('\\') || parent.endsWith('/') ? '' : '\\'
        const path = `${parent}${sep}${name}`
        createdDirs.set(path, [])
        return path
      },
    },
    clipboard: {
      async readText() {
        return ''
      },
      async writeText() {},
    },
    notification: {
      async show() {},
    },
    dialog: {
      async openFile() {
        return '/demo/demo.md'
      },
    },
    windowControl: {
      async minimize() {},
      async setAlwaysOnTop() {},
    },
    openExternal: {
      async open() {},
    },
  }
}
