// 路径列表 → 目录树（utils/tree.ts）：右侧文件树渲染的纯函数。
import { describe, expect, it } from 'vitest'
import { buildTree } from '../src/utils/tree'
import type { WorkingFile } from '../src/stores/workingTree'

function file(path: string): WorkingFile {
  return { path, original: '', current: '', viewed: false }
}

describe('buildTree：文件路径 → 目录树', () => {
  it('空输入返回空树', () => {
    expect(buildTree([])).toEqual([])
  })

  it('根目录下的单文件直接作为根节点', () => {
    const tree = buildTree([file('README.md')])
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({ name: 'README.md', path: 'README.md', type: 'file' })
    expect(tree[0]?.children).toEqual([])
    expect(tree[0]?.file?.path).toBe('README.md')
  })

  it('多级路径构建目录层级，同目录文件共享父节点', () => {
    const tree = buildTree([
      file('src/components/ChatView.vue'),
      file('src/components/chat/ChatInput.vue'),
      file('src/models.ts'),
      file('src/stores/message.ts'),
    ])

    // 顶层：src
    expect(tree).toHaveLength(1)
    const src = tree[0]
    expect(src).toMatchObject({ name: 'src', path: 'src', type: 'dir' })

    // 二级：components / models.ts / stores
    const names = src!.children.map((node) => node.name)
    expect(names).toEqual(['components', 'models.ts', 'stores'])

    // 目录节点不挂 file，文件节点挂 file
    const components = src!.children[0]
    expect(components?.type).toBe('dir')
    expect(components?.file).toBeUndefined()
    // 先处理的 ChatView.vue 排在前面，chat 目录随后
    expect(components!.children[0]?.name).toBe('ChatView.vue')
    const chatDir = components!.children[1]
    expect(chatDir?.name).toBe('chat')
    // ChatView.vue 在 components 直接子级，chat 目录下只有 ChatInput.vue
    expect(chatDir?.children.map((node) => node.name)).toEqual(['ChatInput.vue'])
    expect(chatDir?.children[0]?.file?.path).toBe('src/components/chat/ChatInput.vue')

    // 文件节点挂在正确的叶子
    const models = src!.children[1]
    expect(models?.type).toBe('file')
    expect(models?.file?.path).toBe('src/models.ts')
  })

  it('相同文件路径重复时不重复建节点，仅更新 file 引用', () => {
    const a = file('src/a.ts')
    const b = file('src/a.ts')
    const tree = buildTree([a, b])
    expect(tree).toHaveLength(1)
    expect(tree[0]?.children).toHaveLength(1)
    expect(tree[0]?.children[0]?.file).toBe(b)
  })

  it('保留输入顺序（后续真实使用会先排序再构建）', () => {
    const tree = buildTree([file('z.md'), file('a.md')])
    expect(tree.map((node) => node.name)).toEqual(['z.md', 'a.md'])
  })
})
