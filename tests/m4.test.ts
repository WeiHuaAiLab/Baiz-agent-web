import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { clearDraft, loadDraft, saveDraft } from '../src/drafts'
import { useSessionStore } from '../src/stores/session'
import { useSettingsStore } from '../src/stores/settings'

describe('M4 草稿与连接状态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('草稿存取与清除', async () => {
    await saveDraft('c-1', '草稿内容')
    expect(await loadDraft('c-1')).toBe('草稿内容')
    await clearDraft('c-1')
    expect(await loadDraft('c-1')).toBe('')
  })

  it('连接状态切换', () => {
    const settings = useSettingsStore()
    settings.setConnection('connected')
    expect(settings.connection).toBe('connected')
    settings.setConnection('reconnecting')
    expect(settings.connection).toBe('reconnecting')
  })

  it('会话置顶后排序优先，取消置顶恢复', async () => {
    const session = useSessionStore()
    await session.create('A')
    await new Promise((resolve) => setTimeout(resolve, 5))
    await session.create('B')
    expect(session.conversations.map((c) => c.title)).toEqual(['B', 'A'])

    await session.togglePin(session.conversations[1].id)
    expect(session.conversations[0].title).toBe('A')
    await session.load()
    expect(session.conversations[0].title).toBe('A')

    await session.togglePin(session.conversations[0].id)
    expect(session.conversations[0].title).toBe('B')
  })

  it('删除会话同时清理草稿（无孤儿数据）', async () => {
    const session = useSessionStore()
    await session.create('待删')
    const id = session.activeId
    await saveDraft(id, '草稿内容')
    await session.remove(id)
    expect(await loadDraft(id)).toBe('')
  })
})
