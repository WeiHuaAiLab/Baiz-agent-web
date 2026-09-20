// MSG-3231 ① 红证：预览接头——`file.preview` 必须带上**面板已授权目录**
// （authorized_roots），与 daemon（MSG-3228：与配置面取并集后逐项 canonicalize）对卯。
//
// 改前红：`previewRead` 只带 path/max_bytes/workspace ⇒ 面板里"已授权"的目录
// 对 daemon 仍不可见（越界预览被拒的直接成因）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createClient, setAuthorizedRootsProvider } from '../src/client'
import type { RpcTransport } from '../src/client/transport'
import { useFilesStore } from '../src/stores/files'

interface Captured {
  method: string
  params: Record<string, unknown>
}

function makeTransport(captured: Captured[]): RpcTransport {
  return {
    kind: 'mock',
    async connect() {
      /* noop */
    },
    async request(req: { method: string; params?: unknown }) {
      captured.push({ method: req.method, params: (req.params ?? {}) as Record<string, unknown> })
      return { bytes_b64: '', size: 0, truncated: false, binary: false }
    },
    onEvent() {
      return () => {}
    },
    close() {
      /* noop */
    },
  } as unknown as RpcTransport
}

/** daemon 口径镜像（MSG-3228）：授权根＝配置面 ∪ 帧内 authorized_roots，逐项前缀判定 */
function daemonAllows(target: string, configRoots: string[], frameRoots: string[]): boolean {
  const roots = [...configRoots, ...frameRoots]
  return roots.some((root) => target === root || target.startsWith(`${root}/`) || target.startsWith(`${root}\\`))
}

describe('MSG-3231 ① 预览接头：authorized_roots', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setAuthorizedRootsProvider(null)
  })

  it('T1 请求体含 authorized_roots（改前红：字段缺）', async () => {
    const captured: Captured[] = []
    const client = createClient(makeTransport(captured))
    setAuthorizedRootsProvider(() => ['C:/ws/demo', 'D:/proj'])

    await client.previewRead({ path: 'C:/ws/demo/notes.md', max_bytes: 1024 })

    expect(captured[0].method).toBe('file.preview')
    expect(captured[0].params.authorized_roots).toEqual(['C:/ws/demo', 'D:/proj'])
    // 旧字段零变（勿动 workspace 口径）
    expect(captured[0].params.path).toBe('C:/ws/demo/notes.md')
    expect(captured[0].params.max_bytes).toBe(1024)
  })

  it('T2 与面板已授权目录**逐项一致**（pickedDirs 真实路径键）', async () => {
    const files = useFilesStore()
    files.pickedDirs['C:/ws/a'] = { name: 'a', path: 'C:/ws/a' }
    files.pickedDirs['C:/ws/b'] = { name: 'b', path: 'C:/ws/b' }
    // 引导层（main.ts）注入口径
    setAuthorizedRootsProvider(() => Object.keys(files.pickedDirs))
    const captured: Captured[] = []
    const client = createClient(makeTransport(captured))

    await client.previewRead({ path: 'C:/ws/b/x.md' })
    expect(captured[0].params.authorized_roots).toEqual(['C:/ws/a', 'C:/ws/b'])

    // 面板再授权一个 ⇒ 下一次请求即带上（实时一致，非快照）
    files.pickedDirs['C:/ws/c'] = { name: 'c', path: 'C:/ws/c' }
    await client.previewRead({ path: 'C:/ws/c/y.md' })
    expect(captured[1].params.authorized_roots).toEqual(['C:/ws/a', 'C:/ws/b', 'C:/ws/c'])
  })

  it('T3 未授权路径仍被拒（与 daemon 侧口径对卯）；且前端不放大范围', async () => {
    const files = useFilesStore()
    files.pickedDirs['C:/ws/a'] = { name: 'a', path: 'C:/ws/a' }
    setAuthorizedRootsProvider(() => Object.keys(files.pickedDirs))
    const captured: Captured[] = []
    const client = createClient(makeTransport(captured))

    await client.previewRead({ path: 'C:/ws/a/ok.md' })
    const roots = captured[0].params.authorized_roots as string[]

    // 前端只上报"用户已授权"的目录——未授权前缀不在请求内（不放宽）
    expect(roots).toEqual(['C:/ws/a'])
    expect(roots).not.toContain('C:/secret')

    // daemon 口径镜像：授权根内 ⇒ 放行；根外（含以授权根名为前缀的旁路）⇒ 拒
    expect(daemonAllows('C:/ws/a/ok.md', [], roots)).toBe(true)
    expect(daemonAllows('C:/secret/bad.md', [], roots)).toBe(false)
    expect(daemonAllows('C:/ws/ab/bad.md', [], roots)).toBe(false)
  })

  it('T4 未注入提供者 ⇒ 不下发该字段（旧行为零变）', async () => {
    const captured: Captured[] = []
    const client = createClient(makeTransport(captured))
    await client.previewRead({ path: 'C:/ws/a/x.md' })
    expect('authorized_roots' in captured[0].params).toBe(false)
  })
})
