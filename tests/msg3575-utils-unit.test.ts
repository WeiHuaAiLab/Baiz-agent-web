// **MSG-3575 · 前端窗**：本刀新件**单测**（改前尖无这些 API，故单列一件；
// 组件级「红/绿双跑」见 `tests/msg3575-preset-noise-kb.test.ts`）。
//
// 面：① P5 分型与人话键（只认分型词；会话失效/模型超时**不误伤**）② 同类重复合并（连续才合）
//     ③ 预设项判据与分拣；④ KB 按账号缓存（**只计数**——零内容、零凭据外泄面）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  classifyRuntimeFailure,
  compactRuntimeFailures,
  runtimeFailureI18nKey,
} from '../src/utils/failureText'
import { PRESET_ID_PREFIX, isPresetId, splitPresetItems } from '../src/utils/presetItems'
import { clearKbAccountCache, kbAccountCacheSize, useKbStore } from '../src/stores/kb'
import { useAuthStore } from '../src/stores/auth'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { vi } from 'vitest'

describe('MSG-3575 新件单测（P5 分型/合并 · 预设项分拣 · KB 账号缓存）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetClientForTests()
    localStorage.clear()
    clearKbAccountCache()
  })

  it('① P5 分型与人话键：只认分型词；会话失效与模型超时**不归本件**', () => {
    expect(classifyRuntimeFailure('web_fetch 失败：超时 https://hn.algolia.com/api')).toBe('netFetch')
    expect(classifyRuntimeFailure('kb_list 失败：知识库连接被拒')).toBe('kb')
    expect(classifyRuntimeFailure('weknora.get_config 失败')).toBe('kb')
    expect(classifyRuntimeFailure('会话已失效或服务端重启——请重新登录')).toBeNull()
    expect(classifyRuntimeFailure('模型调用超时（timeout）')).toBeNull()
    expect(classifyRuntimeFailure('')).toBeNull()
    expect(runtimeFailureI18nKey('知识库暂不可用')).toBe('kbUnavailable')
    expect(runtimeFailureI18nKey('普通失败')).toBeNull()
  })

  it('② 同类重复合并：**连续同类**才合并（异类断组·非本件分型逐条照原）', () => {
    const items = ['web_fetch A', 'web_fetch B', '普通错误', 'kb_list C', 'kb_list D']
    const compacted = compactRuntimeFailures(items, (text) => classifyRuntimeFailure(text))
    expect(compacted.map((entry) => entry.repeat)).toEqual([2, 1, 2])
    expect(compacted.map((entry) => entry.item)).toEqual([
      'web_fetch A',
      '普通错误',
      'kb_list C',
    ])
    expect(compactRuntimeFailures([], () => null)).toEqual([])
  })

  it('③ 预设项判据与分拣：`preset-` 前缀（大小写/空白归一）；非预置项一字不改', () => {
    expect(PRESET_ID_PREFIX).toBe('preset-')
    expect(isPresetId('PRESET-9')).toBe(true)
    expect(isPresetId(' preset-9 ')).toBe(true)
    expect(isPresetId('t-1')).toBe(false)
    expect(isPresetId(undefined)).toBe(false)
    const split = splitPresetItems([{ id: 'preset-1' }, { id: 'x-1' }, { id: 'preset-2' }])
    expect(split.visible).toEqual([{ id: 'x-1' }])
    expect(split.presets).toEqual([{ id: 'preset-1' }, { id: 'preset-2' }])
  })

  it('④ KB 按账号缓存：读成功落缓存（只计数）；登出即清', async () => {
    const auth = useAuthStore()
    const kb = useKbStore()
    const client = getClientSetup().client
    vi.spyOn(client, 'weknoraGetConfig').mockResolvedValue({
      base_url: 'https://kb-a.example.test',
      configured: true,
      source: 'file',
      key_fp: 'ab12',
    } as never)
    auth.userId = 'acct-a-3575'
    await kb.load()
    expect(kbAccountCacheSize(), '读成功 ⇒ 本账号缓存 1 条').toBe(1)
    expect(kb.configured).toBe(true)
    await auth.logout()
    expect(kbAccountCacheSize(), '登出即清').toBe(0)
    expect(kb.baseUrl).toBe('')
  })
})
