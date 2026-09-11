// MSG-2998 修③（DEBT-619 文件预览 web 面）红证：
// 编码兜底（UTF-8/UTF-16LE-BOM/GBK）／二进制示「不可预览」／大件截断明示／
// 凭据件遮罩二次确认方示／目录树点件 → 预览交互走查（loader 注入面）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMockBridge } from '../src/bridge/mock'
import { resetBridgeForTests } from '../src/bridge'
import { useFilesStore } from '../src/stores/files'
import FilesPanel from '../src/components/ExtensionPanels/FilesPanel.vue'
import FilePreview from '../src/components/ExtensionPanels/files/FilePreview.vue'
import {
  PREVIEW_MAX_BYTES,
  decodePreview,
  isCredentialFile,
} from '../src/utils/filePreview'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** UTF-16LE（含 BOM）字节构造 */
function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2)
  out[0] = 0xff
  out[1] = 0xfe
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    out[2 + i * 2] = code & 0xff
    out[3 + i * 2] = code >> 8
  }
  return out
}

describe('MSG-2998 修③ 预览解码兜底', () => {
  it('UTF-8 文本：直解＋编码标签', () => {
    const decoded = decodePreview(utf8('fn main() { println!("你好"); }'))
    expect(decoded.kind).toBe('text')
    expect(decoded.text).toContain('你好')
    expect(decoded.encoding).toBe('UTF-8')
    expect(decoded.truncated).toBe(false)
  })

  it('UTF-16LE（BOM）：BOM 嗅探兜底', () => {
    const decoded = decodePreview(utf16le('编码兜底测试'))
    expect(decoded.kind).toBe('text')
    expect(decoded.text).toBe('编码兜底测试')
    expect(decoded.encoding).toContain('UTF-16LE')
  })

  it('GBK 字节：UTF-8 严格失败后 GBK 兜底（中文旧档）', () => {
    // '中文' 的 GBK 字节：D6 D0 CE C4
    const decoded = decodePreview(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]))
    expect(decoded.kind).toBe('text')
    expect(decoded.text).toBe('中文')
    expect(decoded.encoding).toBe('GBK')
  })

  it('二进制（含 NUL 字节）→ binary（不可预览）', () => {
    const decoded = decodePreview(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]))
    expect(decoded.kind).toBe('binary')
    expect(decoded.text).toBe('')
  })

  it('空文件 → empty', () => {
    const decoded = decodePreview(new Uint8Array(0))
    expect(decoded.kind).toBe('empty')
    expect(decoded.totalBytes).toBe(0)
  })

  it('大件截断：超限只解前段并置 truncated（界面明示依据）', () => {
    const big = new Uint8Array(PREVIEW_MAX_BYTES + 1024)
    big.fill(0x61) // 'a'
    const decoded = decodePreview(big)
    expect(decoded.kind).toBe('text')
    expect(decoded.truncated).toBe(true)
    expect(decoded.shownBytes).toBe(PREVIEW_MAX_BYTES)
    expect(decoded.totalBytes).toBe(PREVIEW_MAX_BYTES + 1024)
  })
})

describe('MSG-2998 修③ 凭据件判定（安全钉）', () => {
  it('凭据敏感件命中：.env / 密钥 / 私钥 / 凭据名', () => {
    expect(isCredentialFile('/w/.env')).toBe(true)
    expect(isCredentialFile('C:/w/.env.local')).toBe(true)
    expect(isCredentialFile('/w/certs/server.pem')).toBe(true)
    expect(isCredentialFile('/home/u/.ssh/id_rsa')).toBe(true)
    expect(isCredentialFile('/w/credentials.json')).toBe(true)
    expect(isCredentialFile('/u/.closer/daemon.token')).toBe(true)
  })

  it('普通文件不命中（勿误遮）', () => {
    expect(isCredentialFile('/w/README.md')).toBe(false)
    expect(isCredentialFile('/w/src/main.rs')).toBe(false)
    expect(isCredentialFile('/w/envoy.yaml')).toBe(false)
  })
})

describe('MSG-2998 修③ 预览交互走查', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetBridgeForTests(createMockBridge())
  })

  it('目录树点件 → 预览抽屉面打开（loader 注入：内容＋语法标签）', async () => {
    const files = useFilesStore()
    files.setPreviewLoader(async (path) => {
      if (path.endsWith('Cargo.toml')) return utf8('[package]\nname = "demo"\n')
      return null
    })
    await files.authorizeDir()

    const wrapper = mount(FilesPanel, { global: { plugins: [i18n] } })
    await wrapper.find('.authorized-dir-name').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 50))

    const fileBtn = wrapper
      .findAll('.authorized-file-btn')
      .find((btn) => btn.text().includes('Cargo.toml'))
    expect(fileBtn, '授权目录内文件条目应为可点按钮').toBeTruthy()
    await fileBtn!.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 50))

    const preview = wrapper.find('.file-preview')
    expect(preview.exists()).toBe(true)
    expect(preview.find('.preview-name').text()).toContain('Cargo.toml')
    expect(preview.find('.preview-encoding').text()).toBe('UTF-8')
    expect(preview.find('.preview-code').text()).toContain('name = "demo"')

    // 关闭 → 回文件树面
    await preview.find('.preview-close').trigger('click')
    expect(wrapper.find('.file-preview').exists()).toBe(false)
  })

  it('凭据件（.env）：默认遮罩（内容不现）→ 二次确认后显示', async () => {
    const bytes = utf8('API_KEY=test-not-a-real-key\n')
    const wrapper = mount(FilePreview, {
      props: { path: '/w/.env', name: '.env', loader: async () => bytes },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))

    // 遮罩现形：标题＋确认钮；内容不渲染
    expect(wrapper.find('.preview-mask').exists()).toBe(true)
    expect(wrapper.find('.preview-mask').text()).toContain('凭据')
    expect(wrapper.find('.preview-code').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('test-not-a-real-key')

    await wrapper.find('.mask-reveal').trigger('click')
    expect(wrapper.find('.preview-mask').exists()).toBe(false)
    expect(wrapper.find('.preview-code').text()).toContain('API_KEY=test-not-a-real-key')
  })

  it('二进制件：示「不可预览」（不吐乱码）', async () => {
    const wrapper = mount(FilePreview, {
      props: {
        path: '/w/logo.png',
        name: 'logo.png',
        loader: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
      },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(wrapper.find('.preview-status').text()).toContain('二进制')
    expect(wrapper.find('.preview-code').exists()).toBe(false)
  })

  it('大件：截断明示条现形', async () => {
    const big = new Uint8Array(PREVIEW_MAX_BYTES + 2048)
    big.fill(0x62)
    const wrapper = mount(FilePreview, {
      props: { path: '/w/big.txt', name: 'big.txt', loader: async () => big },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(wrapper.find('.preview-truncated').exists()).toBe(true)
  })

  it('接口未接入（loader 缺省）：诚实降级（勿装懂）', async () => {
    const wrapper = mount(FilePreview, {
      props: { path: '/w/a.txt', name: 'a.txt' },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(wrapper.find('.preview-status').text()).toContain('未接入')
  })
})
