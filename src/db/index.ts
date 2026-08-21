import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { ChatMessage, Conversation } from '../models'

export interface DraftRow {
  conversationId: string
  text: string
  updatedAt: number
}

class BaizDatabase extends Dexie {
  conversations!: Table<Conversation, string>
  messages!: Table<ChatMessage, string>
  drafts!: Table<DraftRow, string>

  constructor() {
    super('baiz')
    this.version(1).stores({
      conversations: 'id, title, createdAt, updatedAt',
      messages: 'id, conversationId, createdAt',
    })
    this.version(2).stores({
      conversations: 'id, title, createdAt, updatedAt',
      messages: 'id, conversationId, createdAt',
      drafts: 'conversationId, updatedAt',
    })
    this.version(3).stores({
      conversations: 'id, title, createdAt, updatedAt, pinnedAt',
      messages: 'id, conversationId, createdAt',
      drafts: 'conversationId, updatedAt',
    })
  }
}

export const db = new BaizDatabase()
