// 刀 D2（2026-09-29）红证：**技能面接线（web 侧·死件转活）**。
//
// 病灶：`stores/tools.ts` 的 `KNOWN_SKILLS` 是四条**写死假技能**
// （coding-discipline／security／evolution／memory——磁盘上根本不存在）
// ＋ `enabledSkills` 假开关（点击无实效）⇒ 测试员在本地技能目录加的
// 真技能（如 `ui-designer`）在界面上**看不到**。
//
// 本件钉死目标行为（**改前必红·改后必绿**）：
// ①`loadSkills()` 调 daemon `skills.list` ⇒ 真技能进 store（含 description／source／path）
// ②界面逐条列出真技能**目录名**（含 ui-designer），且**不出现**假技能名
// ③拉取失败 ⇒ 空列表＋可见重试提示；**不得回落假清单**（假技能名不得上屏）
// ④重试成功 ⇒ 列表出现（可重试）
// ⑤daemon 未就绪（-32601）⇒ 明说未就绪，**不假装成功**
// ⑥假开关已删（技能启停语义未开：禁假开关）＋空描述显「（无描述）」
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { RpcError } from '../src/client/rpc'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { useToolStore } from '../src/stores/tools'
import ExtensionsView from '../src/components/working/ExtensionsView.vue'
import zhCN from '../src/locales/zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

// 夹具＝磁盘真技能形状（测试员加的 ui-designer 即此形态）
const SKILL_DESIGNER = {
  name: 'ui-designer',
  description: '界面设计规范与审查',
  path: 'C:/demo/.claude/skills/ui-designer',
  source: 'global',
}
const SKILL_NO_DESC = {
  name: 'rust-expert',
  description: '',
  path: 'C:/demo/workspace/.claude/skills/rust-expert',
  source: 'workspace',
}

/** 旧写死假技能名（磁盘不存在）——任何一个上屏即回退假清单，红 */
const FAKE_SKILL_NAMES = ['coding-discipline', 'security', 'evolution', 'memory']

describe('刀D2 · 技能面接线（skills.list 真链·死件转活）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
  })

  it('⓪store 初值：skills 为空（四条写死假技能已删）', () => {
    const tools = useToolStore()
    expect(tools.skills).toEqual([])
  })

  it('①loadSkills() 调 skills.list ⇒ 真技能进 store（含描述／来源／路径）', async () => {
    const spy = vi
      .spyOn(getClientSetup().client, 'skillsList')
      .mockResolvedValue([SKILL_DESIGNER, SKILL_NO_DESC])

    const tools = useToolStore()
    await tools.loadSkills()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(tools.status).toBe('ready')
    expect(tools.skills.map((s) => s.name)).toEqual(['ui-designer', 'rust-expert'])
    expect(tools.skills[0]).toMatchObject({
      name: 'ui-designer',
      description: '界面设计规范与审查',
      source: 'global',
    })
  })

  it('②界面列出真技能目录名（ui-designer）且不出现假技能名', async () => {
    vi.spyOn(getClientSetup().client, 'skillsList').mockResolvedValue([SKILL_DESIGNER])

    const wrapper = mount(ExtensionsView, { global: { plugins: [i18n] } })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('ui-designer')
    expect(text).toContain(SKILL_DESIGNER.description)
    for (const fake of FAKE_SKILL_NAMES) {
      expect(text).not.toContain(fake)
    }
  })

  it('③拉取失败 ⇒ 空列表＋可见重试提示；不得回落假清单', async () => {
    vi.spyOn(getClientSetup().client, 'skillsList').mockRejectedValue(
      new RpcError({ code: -32603, message: 'boom' }),
    )

    const tools = useToolStore()
    await tools.loadSkills()
    expect(tools.skills).toEqual([])
    expect(tools.status).toBe('error')

    const wrapper = mount(ExtensionsView, { global: { plugins: [i18n] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain(zhCN.skills.loadFailed)
    expect(text).toContain('boom')
    // 假清单不得回落
    for (const fake of FAKE_SKILL_NAMES) {
      expect(text).not.toContain(fake)
    }
  })

  it('④失败可重试：重试成功 ⇒ 列表出现', async () => {
    const spy = vi
      .spyOn(getClientSetup().client, 'skillsList')
      .mockRejectedValueOnce(new RpcError({ code: -32603, message: 'boom' }))
      .mockResolvedValue([SKILL_DESIGNER])

    const wrapper = mount(ExtensionsView, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain(zhCN.skills.loadFailed)

    await wrapper.find('.skills-panel button').trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('ui-designer')
  })

  it('⑤-32601 ⇒ 明说服务端未就绪（不假装成功）', async () => {
    vi.spyOn(getClientSetup().client, 'skillsList').mockRejectedValue(
      new RpcError({ code: -32601, message: 'RPC -32601: method not found' }),
    )

    const tools = useToolStore()
    await tools.loadSkills()

    expect(tools.status).toBe('notReady')
    expect(tools.skills).toEqual([])

    const wrapper = mount(ExtensionsView, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain(zhCN.skills.notReady)
  })

  it('⑥假开关已删（启停语义未开）＋空描述显「（无描述）」', async () => {
    vi.spyOn(getClientSetup().client, 'skillsList').mockResolvedValue([SKILL_NO_DESC])

    const tools = useToolStore()
    expect('enabledSkills' in tools.$state).toBe(false)
    expect((tools as unknown as Record<string, unknown>).toggleSkill).toBeUndefined()

    const wrapper = mount(ExtensionsView, { global: { plugins: [i18n] } })
    await flushPromises()
    const panel = wrapper.find('.skills-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain(zhCN.skills.noDescription)
    // 禁假开关：技能区内不得出现任何启停开关
    expect(panel.find('.ext-toggle').exists()).toBe(false)
    expect(panel.find('button.skill-toggle').exists()).toBe(false)
  })
})
