import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMockBridge } from '../src/bridge/mock'
import { resetBridgeForTests } from '../src/bridge'
import { useFilesStore } from '../src/stores/files'
import FilesPanel from '../src/components/FilesPanel.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

describe('FilesPanel 授权目录', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetBridgeForTests(createMockBridge())
  })

  it('授权目录展示"已授权"徽标，展开后可读取其中文件', async () => {
    const files = useFilesStore()
    await files.authorizeDir()

    const wrapper = mount(FilesPanel, { global: { plugins: [i18n] } })
    expect(wrapper.find('.authorized-head').text()).toBe('已授权目录')
    expect(wrapper.find('.authorized-dir-name').text()).toContain('demo-workspace')
    expect(wrapper.find('.authorized-badge').text()).toBe('已授权')

    // 未展开前不显示文件清单
    expect(wrapper.find('.authorized-files').exists()).toBe(false)

    await wrapper.find('.authorized-dir-name').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(wrapper.find('.authorized-files').exists()).toBe(true)
    expect(wrapper.text()).toContain('Cargo.toml')
    expect(wrapper.text()).toContain('src')
    expect(wrapper.text()).toContain('README.md')
  })
})
