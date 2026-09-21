// 会话导出：Markdown / JSON 两种格式，触发浏览器下载。
import type { ChatMessage, Conversation } from '../models'

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
}

export function exportConversation(
  conversation: Conversation,
  messages: ChatMessage[],
  format: 'md' | 'json',
): { filename: string; content: string } {
  if (format === 'json') {
    return {
      filename: `${safeName(conversation.title)}.json`,
      content: JSON.stringify(
        { title: conversation.title, createdAt: conversation.createdAt, messages },
        null,
        2,
      ),
    }
  }
  const lines = messages.map((message) => {
    const time = new Date(message.createdAt).toLocaleString()
    const header =
      message.kind === 'user'
        ? `## 用户（${time}）`
        : message.kind === 'assistant'
          ? `## 助手（${time}）`
          : `## ${message.kind}（${time}）`
    return `${header}\n\n${message.text}\n`
  })
  return {
    filename: `${safeName(conversation.title)}.md`,
    content: `# ${conversation.title}\n\n${lines.join('\n')}`,
  }
}

/** 导出默认落点（人话回显用；壳/浏览器各异，故只作"去哪儿找"的提示） */
export const EXPORT_DIR_HINT = '系统默认下载目录'

/**
 * MSG-3263 ②（ZCode UX 走查 P2-4）：导出**不得静默**——
 * 旧实现是裸 `anchor.click()`：成功无反馈、失败（环境不支持/被拦）也无从得知
 * ⇒ 用户"点了没反应"。现在**失败抛错（带可读理由）**，由调用方 toast 回显；
 * 成功返回落点提示文案，供调用方一并回显。
 */
export function downloadText(filename: string, content: string): { filename: string; hint: string } {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('当前环境不支持文件下载（无 createObjectURL）')
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    // jsdom/无下载能力的宿主：click 可能为空操作或抛错 ⇒ 抛出去让调用方显式提示
    if (typeof anchor.click !== 'function') {
      throw new Error('当前环境不支持触发下载（无 anchor.click）')
    }
    anchor.click()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error instanceof Error ? error : new Error(String(error))
  }
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { filename, hint: EXPORT_DIR_HINT }
}
