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

export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
