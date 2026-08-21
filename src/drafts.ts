// 输入草稿：IndexedDB drafts 表，会话级持久化。
import { db } from './db'

export async function saveDraft(conversationId: string, text: string): Promise<void> {
  await db.drafts.put({ conversationId, text, updatedAt: Date.now() })
}

export async function loadDraft(conversationId: string): Promise<string> {
  const row = await db.drafts.get(conversationId)
  return row?.text ?? ''
}

export async function clearDraft(conversationId: string): Promise<void> {
  await db.drafts.delete(conversationId)
}
