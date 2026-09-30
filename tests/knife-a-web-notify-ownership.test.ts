// 补刀A-web（1.0.42）：`daemon.notify` **按归属过滤**——消费 `conversation_id`。
//
// 口径（令载三条）：
//   (a) 归属＝当前会话 ⇒ **照旧弹**（`ui.toast`）
//   (b) 归属≠当前会话 ⇒ **不弹**（本条即本刀新增面）
//   (c) **向后兼容**：**无 `conversation_id` 之旧形 ⇒ 照旧弹**（不得因缺字段丢通知）
//
// 判据单源：当前会话 id ＝ `useSessionStore().activeId`（与 `src/client/eventRouter.ts:42` 同源）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMessageStore } from '../src/stores/message'
import { useUiStore } from '../src/stores/ui'
import { useSessionStore } from '../src/stores/session'

describe('补刀A-web：daemon.notify 按归属过滤', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('(a) 归属＝当前会话 ⇒ 照旧弹', () => {
    const session = useSessionStore()
    const ui = useUiStore()
    const messages = useMessageStore()
    session.activeId = 'conv-A'
    messages.onNotify({ level: 'warning', message: 'notify-a', conversation_id: 'conv-A' })
    expect(ui.toasts.map((t) => t.message)).toContain('notify-a')
  })

  it('(b) 归属≠当前会话 ⇒ 不弹（本刀新增面）', () => {
    const session = useSessionStore()
    const ui = useUiStore()
    const messages = useMessageStore()
    session.activeId = 'conv-A'
    messages.onNotify({ level: 'warning', message: 'notify-b', conversation_id: 'conv-B' })
    expect(ui.toasts.map((t) => t.message)).not.toContain('notify-b')
    expect(ui.toasts.length).toBe(0)
  })

  it('(c) 旧形（无 conversation_id）⇒ 照旧弹（向后兼容）', () => {
    const session = useSessionStore()
    const ui = useUiStore()
    const messages = useMessageStore()
    session.activeId = 'conv-A'
    messages.onNotify({ level: 'info', message: 'notify-legacy' })
    expect(ui.toasts.map((t) => t.message)).toContain('notify-legacy')
  })
})
