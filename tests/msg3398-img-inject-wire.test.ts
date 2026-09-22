// MSG-3398 防回退红证：**图片注入送链**（`image_data_url`）与 **8MB web 护栏**。
//
// 由来（MSG-3394 只读核）：主检出 `F:\Projects\Baiz-agent-web`（支 `feature-updater-ui`）里
// 那两处**只是未提交的 2/3**；而 **1.0.20 线（基点 `3238264`）两件俱已在位**——
//   甲：`src/bridge/web.ts:95-101`（>8MiB 拒＋人话）
//   乙：`src/stores/message.ts:299`（`firstImage` 抽）＋`:314-316`（`image_data_url` 透传）
// ⇒ 本令在该基线上**无产品码可改**（反-伪修复闸：现状非 bug ⇒ 不许硬改）；本文件把
//   这两条**钉成可机判**，供后续任一刀误删时当场变红。
//
// 与 MSG-3362（U-1）的关系（**冲突核查结论＝不冲突·互补**）：
//   daemon `crates/daemon/src/attach_guard.rs:16` 逐字「`kind=image`：摘要源＝声明 `dataUrl`；
//   若本轮另带上送 `image_data_url`，则 …」⇒ 二者是**同一条路的"声明面＋载荷面"**：
//   `attachments[].dataUrl`（含 sha256 对卯）声明，`image_data_url` 是实际上送载荷；
//   daemon 双校验（`:245-246` 算声明 sha；`:254-258` 若上送则比对，不一致即拒）。
//   前端两字段**同源**（同一 `attachments` 数组）⇒ 不存在"两边各改一份"。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMessageStore } from '../src/stores/message'
import { getClient } from '../src/client/singleton'
import { createWebBridge } from '../src/bridge/web'

vi.mock('../src/client/singleton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/singleton')>()
  return { ...actual, getClient: vi.fn(actual.getClient) }
})

type Sent = {
  message?: string
  image_data_url?: string
  attachments?: Array<{ name?: string; kind?: string; dataUrl?: string; sha256?: string }>
}

function captureSend(): Sent[] {
  const sent: Sent[] = []
  vi.mocked(getClient).mockImplementation(
    () =>
      ({
        chatSend: async (params: Sent) => {
          sent.push(params)
          return { task_id: 't-1', status: 'ok', model: 'deepseek-v4-pro' }
        },
      }) as never,
  )
  return sent
}

const img = (name: string, dataUrl: string) => ({
  id: `att-${name}`,
  kind: 'image' as const,
  name,
  mimeType: 'image/png',
  size: dataUrl.length,
  dataUrl,
})

describe('MSG-3398 乙 · 图片注入送链（image_data_url）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('★带图 ⇒ chat.send 载荷含 image_data_url（＝该图 dataUrl）', async () => {
    const sent = captureSend()
    const messages = useMessageStore()
    await messages.sendUserMessage('c-1', '看这张图', undefined, [
      img('dot.png', 'data:image/png;base64,AAAA'),
    ])
    expect(sent).toHaveLength(1)
    expect(sent[0]?.image_data_url).toBe('data:image/png;base64,AAAA')
  })

  it('★同源对卯：结构化 attachments[].dataUrl 与 image_data_url **同值**（MSG-3362 口径）', async () => {
    const sent = captureSend()
    const messages = useMessageStore()
    await messages.sendUserMessage('c-1', '图', undefined, [
      img('dot.png', 'data:image/png;base64,BBBB'),
    ])
    expect(sent[0]?.attachments?.[0]?.dataUrl).toBe('data:image/png;base64,BBBB')
    expect(sent[0]?.image_data_url).toBe(sent[0]?.attachments?.[0]?.dataUrl)
  })

  it('★无图 ⇒ **不得**出现 image_data_url 键（拒"无条件塞空串/乱挂"）', async () => {
    const sent = captureSend()
    const messages = useMessageStore()
    await messages.sendUserMessage('c-1', '纯文本', undefined, [
      {
        id: 'att-txt',
        kind: 'file' as const,
        name: 'a.txt',
        mimeType: 'text/plain',
        size: 3,
        content: 'abc',
      },
    ])
    expect('image_data_url' in (sent[0] ?? {})).toBe(false)
  })

  it('多图 ⇒ 取**第一张**（daemon 侧 `last` 判定在 daemon；前端取首图口径）', async () => {
    const sent = captureSend()
    const messages = useMessageStore()
    await messages.sendUserMessage('c-1', '两张', undefined, [
      img('a.png', 'data:image/png;base64,1111'),
      img('b.png', 'data:image/png;base64,2222'),
    ])
    expect(sent[0]?.image_data_url).toBe('data:image/png;base64,1111')
  })
})

describe('MSG-3398 甲 · web 形态 8MB 护栏', () => {
  /** 捕获 pickAttachment 内部创建的 <input type=file>，以便直送 onchange */
  function captureInput(): HTMLInputElement[] {
    const inputs: HTMLInputElement[] = []
    const orig = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = orig(tag)
      if (tag === 'input') inputs.push(el as HTMLInputElement)
      return el
    }) as typeof document.createElement)
    return inputs
  }

  async function drive(file: File, alertSpy: ReturnType<typeof vi.fn>) {
    const inputs = captureInput()
    const bridge = createWebBridge()
    const pending = bridge.fs.pickAttachment()
    const input = inputs[0]!
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.onchange?.(new Event('change'))
    return { result: await pending, alertSpy }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('★>8MiB ⇒ 返回 null ＋ 人话提示（不静默截）', async () => {
    const alertSpy = vi.fn()
    vi.stubGlobal('alert', alertSpy)
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.bin', {
      type: 'application/octet-stream',
    })
    const { result } = await drive(big, alertSpy)
    expect(result).toBeNull()
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(String(alertSpy.mock.calls[0]?.[0])).toContain('附件过大')
  })

  it('≤8MiB 图片 ⇒ 正常返回（含 dataUrl，供送链用）', async () => {
    const alertSpy = vi.fn()
    vi.stubGlobal('alert', alertSpy)
    const small = new File([new Uint8Array([1, 2, 3])], 'dot.png', { type: 'image/png' })
    const { result } = await drive(small, alertSpy)
    expect(result).not.toBeNull()
    expect((result as { kind?: string })?.kind).toBe('image')
    expect(String((result as { dataUrl?: string })?.dataUrl)).toMatch(/^data:image\/png/)
    expect(alertSpy).not.toHaveBeenCalled()
  })
})
