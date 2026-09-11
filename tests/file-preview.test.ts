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

describe('MSG-3001 R1 截断编码链（阻断件·相位扫描探针）', () => {
  it("大件 UTF-8 中文截断劈多字节——不得误标 GBK/乱码（'中'×90000 探针·修前必败）", () => {
    const bytes = utf8('中'.repeat(90000)) // 270000B·截 262144（262144%3=1 恰劈多字节）
    expect(bytes.length).toBe(270000)
    const decoded = decodePreview(bytes)
    expect(decoded.kind).toBe('text')
    expect(decoded.truncated).toBe(true)
    // 修前：严格 UTF-8 败 → GBK 严格（在宽松前）恰可解 → 误标 GBK + 整屏 mojibake
    expect(decoded.encoding).toBe('UTF-8')
    expect(decoded.text.startsWith('中')).toBe(true)
    expect(decoded.text.includes('涓')).toBe(false) // mojibake 特征字（修前现形）
  })

  it('相位扫描：多个截断相位俱得 UTF-8（勿以单相位侥幸）', () => {
    // 三相位：余 0/1/2 字节——各造 262144+k 字节的 '中' 流
    for (const pad of [0, 1, 2]) {
      const bytes = utf8('中'.repeat(87382) + 'a'.repeat(pad)) // 262146+pad ≥ 上限
      const decoded = decodePreview(bytes)
      expect(decoded.encoding, `pad=${pad}`).toBe('UTF-8')
      expect(decoded.text.startsWith('中'), `pad=${pad}`).toBe(true)
    }
  })

  it('镜像：真 GBK 件截断劈双字节——GBK 回退边界（不得全 U+FFFD）', () => {
    // 前置 1 个 ASCII 字节 → 双字节 GBK 字符起始于奇数位 → 262144 边界恰劈开
    const bytes = new Uint8Array(PREVIEW_MAX_BYTES + 2)
    bytes[0] = 0x61 // 'a'
    for (let i = 1; i < bytes.length; i += 1) bytes[i] = (i - 1) % 2 === 0 ? 0xd6 : 0xd0
    const decoded = decodePreview(bytes)
    expect(decoded.kind).toBe('text')
    expect(decoded.encoding).toBe('GBK')
    expect(decoded.text.startsWith('a中')).toBe(true)
    expect(decoded.text.includes('�')).toBe(false) // 修前：宽松 UTF-8 全替换符
  })

  it('小件探针不回归：UTF-8/GBK 小件仍判准（回归钉）', () => {
    expect(decodePreview(utf8('你好')).encoding).toBe('UTF-8')
    expect(decodePreview(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])).encoding).toBe('GBK')
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

  // MSG-3001 ③ 补族（试刀窗补遗 P1 谱）——旧表漏防族
  it('补族命中：.git-credentials/.pypirc/.envrc/.docker/config.json/.kube/config/terraform.tfstate', () => {
    expect(isCredentialFile('/w/.git-credentials')).toBe(true)
    expect(isCredentialFile('/home/u/.pypirc')).toBe(true)
    expect(isCredentialFile('/w/.envrc')).toBe(true)
    expect(isCredentialFile('/home/u/.docker/config.json')).toBe(true)
    expect(isCredentialFile('/home/u/.kube/config')).toBe(true)
    expect(isCredentialFile('/w/infra/terraform.tfstate')).toBe(true)
  })

  it('公钥移出遮罩：id_rsa.pub 族不遮（私钥仍遮）', () => {
    expect(isCredentialFile('/home/u/.ssh/id_rsa.pub')).toBe(false)
    expect(isCredentialFile('/home/u/.ssh/id_ed25519.pub')).toBe(false)
    // 私钥正例不回归
    expect(isCredentialFile('/home/u/.ssh/id_rsa')).toBe(true)
    expect(isCredentialFile('/home/u/.ssh/id_ed25519')).toBe(true)
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
    expect(wrapper.find('.preview-status').text()).toContain('暂不支持')
  })

  // MSG-3001 ④ 内部过程语出厂面清：降级文案须用户向——过程语（俟/另令/堂/勘）零现
  it('④ 降级文案出厂面清：无内部过程语', async () => {
    const wrapper = mount(FilePreview, {
      props: { path: '/w/a.txt', name: 'a.txt' },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    const text = wrapper.find('.preview-status').text()
    expect(text).not.toMatch(/俟|另令|呈堂|候裁|勘|堂|役/)
  })

  it('快速切件：过期回包不得覆盖新件（代际守卫——乱序竞态）', async () => {
    let releaseSlow: ((value: Uint8Array | null) => void) | undefined
    const slow = new Promise<Uint8Array | null>((resolve) => {
      releaseSlow = resolve
    })
    const wrapper = mount(FilePreview, {
      props: {
        path: '/w/slow.txt',
        name: 'slow.txt',
        loader: (path) =>
          path.endsWith('slow.txt') ? slow : Promise.resolve(utf8('新件内容')),
      },
      global: { plugins: [i18n] },
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    // 切到另一件（新请求先返回）
    await wrapper.setProps({ path: '/w/fast.txt', name: 'fast.txt' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(wrapper.find('.preview-code').text()).toContain('新件内容')
    // 旧件回包晚到——不得覆盖
    releaseSlow?.(utf8('旧件内容'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(wrapper.find('.preview-code').text()).toContain('新件内容')
    expect(wrapper.text()).not.toContain('旧件内容')
  })
})
