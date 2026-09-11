// MSG-3014 包131（文件预览接真）红证：loader 接真联通（mock RPC→预览上屏）／
// daemon 截断标记面／daemon 二进制标记面（标记权威直采）／凭据遮罩径必经
// （接线勿绕）／败面诚实降级。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import FilePreview from '../src/components/ExtensionPanels/files/FilePreview.vue'
import {
  PREVIEW_MAX_BYTES,
  createRpcPreviewLoader,
} from '../src/utils/filePreview'
import type { PreviewRpcResponse } from '../src/utils/filePreview'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function resp(partial: Partial<PreviewRpcResponse>): PreviewRpcResponse {
  return { bytes_b64: '', size: 0, truncated: false, binary: false, ...partial }
}

describe('MSG-3014 预览 RPC 接真', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loader 接真联通：mock RPC → 载荷对卯 → 预览上屏（编码判定在前端）', async () => {
    const calls: Array<{ path: string; maxBytes: number }> = []
    const loader = createRpcPreviewLoader(async (path, maxBytes) => {
      calls.push({ path, maxBytes })
      return resp({ bytes_b64: b64('你好，预览'), size: 15 })
    })
    const out = await loader('/w/hello.txt')
    expect(out).not.toBeNull()
    const payload = out as Exclude<typeof out, Uint8Array | null>
    expect(payload.bytes).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(payload.bytes)).toBe('你好，预览')
    expect(payload.totalBytes).toBe(15)
    expect(calls[0]).toEqual({ path: '/w/hello.txt', maxBytes: PREVIEW_MAX_BYTES })

    // 上屏联通：载荷面 loader 挂 FilePreview → 文本渲染
    const wrapper = mount(FilePreview, {
      props: { path: '/w/hello.txt', name: 'hello.txt', loader },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(wrapper.find('.preview-code').text()).toContain('你好，预览')
    expect(wrapper.find('.preview-encoding').text()).toBe('UTF-8')
  })

  it('daemon 截断标记面：服务端已截断 → 界面明示（真值 size 由标记透传）', async () => {
    const loader = createRpcPreviewLoader(async () =>
      resp({ bytes_b64: b64('A'.repeat(1024)), size: 4096, truncated: true }),
    )
    const wrapper = mount(FilePreview, {
      props: { path: '/w/big.txt', name: 'big.txt', loader },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    // 截断明示条现形（「已示 X/共 Y」——真值来自 daemon size 标记）
    expect(wrapper.find('.preview-truncated').exists()).toBe(true)
    expect(wrapper.find('.preview-size').text()).toContain('4.0 KB')
  })

  it('daemon 二进制标记面：标记权威直采（web sniff 未及亦示「不可预览」）', async () => {
    // bytes 无 NUL（web sniff 判文本）但 daemon 标记 binary=true → 应示不可预览
    const loader = createRpcPreviewLoader(async () =>
      resp({ bytes_b64: b64('看似纯文本但服务端判二进制的件'), size: 48, binary: true }),
    )
    const wrapper = mount(FilePreview, {
      props: { path: '/w/weird.dat', name: 'weird.dat', loader },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(wrapper.find('.preview-code').exists()).toBe(false)
    expect(wrapper.text()).toContain('不可预览')
  })

  it('凭据遮罩径必经：RPC 接线不绕遮罩（.env 默认遮罩→确认方示）', async () => {
    const loader = createRpcPreviewLoader(async () =>
      resp({ bytes_b64: b64('API_KEY=test-not-a-real-key\n'), size: 26 }),
    )
    const wrapper = mount(FilePreview, {
      props: { path: '/w/.env', name: '.env', loader },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(wrapper.find('.preview-mask').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('test-not-a-real-key')
    await wrapper.find('.mask-reveal').trigger('click')
    expect(wrapper.find('.preview-code').text()).toContain('API_KEY=test-not-a-real-key')
  })

  it('败面诚实降级：RPC null／抛错 → loader null → 界面降级文案', async () => {
    const nullLoader = createRpcPreviewLoader(async () => null)
    expect(await nullLoader('/w/x.txt')).toBeNull()
    const throwLoader = createRpcPreviewLoader(async () => {
      throw new Error('boom')
    })
    expect(await throwLoader('/w/x.txt')).toBeNull()
    const badB64 = createRpcPreviewLoader(async () => resp({ bytes_b64: '!!!not-base64!!!' }))
    expect(await badB64('/w/x.txt')).toBeNull()

    const wrapper = mount(FilePreview, {
      props: { path: '/w/x.txt', name: 'x.txt', loader: nullLoader },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(wrapper.find('.preview-status.error').exists()).toBe(true)
  })
})
