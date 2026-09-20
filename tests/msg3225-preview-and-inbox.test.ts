// MSG-3225 红证（前端面）：
// ① 文件预览「预览读取失败」六字裸词 ⇒ **人话＋可行动指引＋服务端原文**
//    （真机：daemon 回了 439 B 错误响应，前端静默吞成 null ⇒ 用户无从下手）；
// ② 待办收件箱 51 条幽灵项 ⇒ 按 daemon **权威挂起清单**收口
//    （收件箱真源是 `messages.list('__inbox__')` 的消息，不是 approvals.pending；
//     **只标终态、不删档**，且对账起点之后的卡不动）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import FilePreview from '../src/components/ExtensionPanels/files/FilePreview.vue'
import {
  PreviewLoadError,
  classifyPreviewFailure,
  createRpcPreviewLoader,
  previewFailureKey,
} from '../src/utils/filePreview'
import { createClient } from '../src/client'
import { resetClientForTests } from '../src/client/singleton'
import { INBOX_CONVERSATION_ID } from '../src/client/types'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import type { RpcTransport } from '../src/client/transport'
import type { ChatMessage } from '../src/models'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 真机原文形态（daemon `preview.rs:46` 越界措辞） */
const OUTSIDE_RAW =
  'RPC -32602: file.preview: 路径越界（不在授权目录内）: 路径非法: 路径不在工作区内: F:\\Projects\\BaizAgent-outputs\\截图\\Claude大屏安装包.md'

function fakeTransport(result: unknown): RpcTransport {
  return {
    kind: 'mock',
    async connect() {},
    async request() {
      return result
    },
    onEvent() {
      return () => {}
    },
    close() {},
  }
}

function approvalMsg(requestId: string, createdAt: number): ChatMessage {
  return {
    id: `m-${requestId}`,
    conversationId: INBOX_CONVERSATION_ID,
    kind: 'approval',
    text: '',
    createdAt,
    meta: { requestId, toolName: 'write_file', action: 'write_file', inbox: true },
  }
}

describe('MSG-3225 ① 预览败面人话化', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('服务端越界原文 ⇒ 归类 outside（键位指向「授权目录」指引）', () => {
    expect(classifyPreviewFailure(OUTSIDE_RAW)).toBe('outside')
    expect(previewFailureKey(OUTSIDE_RAW)).toBe('files.previewFailOutside')
    expect(classifyPreviewFailure('file.preview: 文件不可读: Access is denied. (os error 5)')).toBe(
      'unreadable',
    )
    expect(classifyPreviewFailure('file.preview: 文件打开失败: No such file or directory')).toBe(
      'missing',
    )
    expect(classifyPreviewFailure('whatever')).toBe('unknown')
  })

  it('loader 败面**上抛原文**（不再静默吞成 null）', async () => {
    const loader = createRpcPreviewLoader(async () => {
      throw new Error(OUTSIDE_RAW)
    })
    const err = await loader('F:\\Projects\\BaizAgent-outputs\\截图\\Claude大屏安装包.md').catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(PreviewLoadError)
    expect((err as PreviewLoadError).kind).toBe('outside')
    // 原文零改写（界面可复述给老板/参谋窗）
    expect((err as PreviewLoadError).raw).toContain('路径越界（不在授权目录内）')
  })

  it('界面显「授权目录」指引＋服务端原文（不再是六字裸词）', async () => {
    const loader = createRpcPreviewLoader(async () => {
      throw new Error(OUTSIDE_RAW)
    })
    const wrapper = mount(FilePreview, {
      props: {
        path: 'F:\\Projects\\BaizAgent-outputs\\截图\\Claude大屏安装包.md',
        name: 'Claude大屏安装包.md',
        loader,
      },
      global: { plugins: [i18n] },
    })
    await flushPromises()
    const text = wrapper.find('.preview-status.error').text()
    expect(text).toContain('不在服务端授权目录内')
    expect(text).toContain('authorized_roots') // 可行动指引
    expect(text).toContain('路径越界（不在授权目录内）') // 服务端原文
    expect(text).not.toBe(zhCN.files.previewFailed)
  })
})

describe('MSG-3225 ② permission.pending 返回形 + 幽灵待办收口', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('daemon 实机形＝**裸数组** ⇒ 归一到 { pending }（旧口径此处恒空）', async () => {
    const client = createClient(
      fakeTransport([{ request_id: 'r1', action: 'write_file', risk: 'file_write' }]),
    )
    expect(await client.permissionPending()).toEqual({
      pending: [{ request_id: 'r1', action: 'write_file', risk: 'file_write' }],
    })
  })

  it('空册（实机 36 B＝result:[]）⇒ { pending: [] }（不是 undefined）', async () => {
    const client = createClient(fakeTransport([]))
    expect(await client.permissionPending()).toEqual({ pending: [] })
  })

  it('mock／旧形 { pending: [...] } 仍照收（零破坏）', async () => {
    const client = createClient(fakeTransport({ pending: [{ request_id: 'r2' }] }))
    expect(await client.permissionPending()).toEqual({ pending: [{ request_id: 'r2' }] })
  })

  it('★核心：51 条幽灵（权威清单外）⇒ 全部标终态且**不再计入待办**；活卡不动', () => {
    const messages = useMessageStore()
    const past = Date.now() - 6 * 3600 * 1000
    const rows: ChatMessage[] = []
    for (let i = 0; i < 51; i += 1) rows.push(approvalMsg(`ghost-${i}`, past))
    rows.push(approvalMsg('live-1', past))
    messages.byConversation[INBOX_CONVERSATION_ID] = rows

    const inboxLive = () =>
      messages
        .list(INBOX_CONVERSATION_ID)
        .filter((item) => item.kind === 'approval' && item.meta?.approved === undefined)

    expect(inboxLive()).toHaveLength(52)
    const n = messages.expireStaleApprovals(['live-1'], Date.now())

    expect(n).toBe(51) // 清场条数（实测）
    expect(inboxLive()).toHaveLength(1) // 清场后待办条数（实测）
    expect(inboxLive()[0]?.meta?.requestId).toBe('live-1')
    // **不删档**：52 条消息俱在（可逆；只是不再计入待办）
    expect(messages.list(INBOX_CONVERSATION_ID)).toHaveLength(52)
    const ghost = messages.list(INBOX_CONVERSATION_ID).find((i) => i.meta?.requestId === 'ghost-0')
    expect(ghost?.meta?.expired).toBe(true)
    expect(ghost?.meta?.approved).toBe(false)
  })

  it('防竞态：对账起点**之后**到达的卡不动（在途帧不误杀）', () => {
    const messages = useMessageStore()
    const startedAt = Date.now()
    messages.byConversation[INBOX_CONVERSATION_ID] = [
      approvalMsg('old-1', startedAt - 1000),
      approvalMsg('fresh-1', startedAt + 5),
    ]
    const n = messages.expireStaleApprovals([], startedAt)
    expect(n).toBe(1)
    const live = messages
      .list(INBOX_CONVERSATION_ID)
      .filter((item) => item.meta?.approved === undefined)
      .map((item) => item.meta?.requestId)
    expect(live).toEqual(['fresh-1'])
  })

  it('对账接线：syncPending 成功即顺带收口（装机同路径）', async () => {
    const messages = useMessageStore()
    const approvals = useApprovalStore()
    const past = Date.now() - 6 * 3600 * 1000
    messages.byConversation[INBOX_CONVERSATION_ID] = [approvalMsg('ghost-x', past)]

    // 测试环境（DEV）走 mock 传输：`permission.pending` 回空册 ⇒ 权威清单为空
    await approvals.syncPending()
    expect(approvals.staleReconciled).toBe(1)
    expect(
      messages
        .list(INBOX_CONVERSATION_ID)
        .filter((item) => item.meta?.approved === undefined),
    ).toHaveLength(0)
  })
})
