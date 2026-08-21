// 路径列表 → 目录树（用于右侧文件树渲染）。
import type { WorkingFile } from '../stores/workingTree'

export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  file?: WorkingFile
  children: TreeNode[]
}

export function buildTree(files: WorkingFile[]): TreeNode[] {
  const roots: TreeNode[] = []
  const map = new Map<string, TreeNode>()
  for (const file of files) {
    const parts = file.path.split('/')
    let parent = roots
    let currentPath = ''
    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      let node = map.get(currentPath)
      const isFile = index === parts.length - 1
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'dir',
          file: isFile ? file : undefined,
          children: [],
        }
        map.set(currentPath, node)
        parent.push(node)
      } else if (isFile) {
        node.file = file
      }
      parent = node.children
    })
  }
  return roots
}
