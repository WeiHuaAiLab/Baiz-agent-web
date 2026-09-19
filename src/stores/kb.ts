// DEBT-743（MSG-3168）知识库（WeKnora）连接配置 store —— **契约先行**。
//
// 口径源：MSG-3165 §三（`weknora.get_config`／`weknora.set_config`），
// daemon 侧**尚未实装**（三号组断点件）⇒ 本 store 按口径把状态机做全：
// - **服务端未就绪**（-32601 方法不存在）⇒ 状态 `notReady`，界面**明说**，
//   **绝不静默成功**（契约先行期这是主态）；
// - **API key 只在保存入参里出现一次**：store 不落、不回显；读接口只认
//   `configured`／`key_set`／`key_fp`（零明文）；
// - **生产径禁 mock 兜底**（DEBT-738 教训）：mock 只在测试里由 `vi.spyOn` 注入。
import { defineStore } from 'pinia'
import { getClient } from '../client/singleton'
import { useAuthStore } from './auth'
import { mapRpcError } from '../utils/errors'

export type KbStatus =
  /** 未读取（default） */
  | 'idle'
  /** 读取中（loading） */
  | 'loading'
  /** 已配置（读回：base_url ＋ 已配置态） */
  | 'ready'
  /** 未配置（empty：空表单引导） */
  | 'unconfigured'
  /** 保存中（按钮禁用） */
  | 'saving'
  /** 保存成功（success：明确反馈） */
  | 'saved'
  /** 读/写失败（error：可重试） */
  | 'error'
  /** 服务端未就绪（-32601）——契约先行期主态，禁静默成功 */
  | 'notReady'
  /** 前端校验不通过（invalid） */
  | 'invalid'

/**
 * base_url 归一（与 daemon `normalize_base_url` 同口径）：
 * 去首尾空白 → 去尾斜杠 → 剥尾段 `/api/v1` → 再去尾斜杠。
 * （界面提示「只填到域名」，客户端自拼 `/api/v1`。）
 */
export function normalizeKbBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/i, '')
    .replace(/\/+$/, '')
}

/** 只接受 http(s)://host[:port][/path]（拒空、拒无协议、拒非 http(s)） */
export function isValidKbBaseUrl(raw: string): boolean {
  const value = normalizeKbBaseUrl(raw)
  if (!value) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

export const useKbStore = defineStore('kb', {
  state: () => ({
    status: 'idle' as KbStatus,
    /** 读回的 base_url（服务端归一值优先） */
    baseUrl: '',
    /** 服务端判「key 已配置」（**不回显明文**） */
    configured: false,
    /** env / file / none */
    source: '' as string,
    /** 指纹（至多前/后 4 位或 SHA 前 8）——**零明文** */
    keyFp: '' as string,
    /** 失败人话（error 态） */
    error: '',
    /** 失败键（mapRpcError） */
    errorKey: '' as string,
    /** 保存成功后的归一 base_url（success 态显示） */
    savedBaseUrl: '' as string,
  }),
  getters: {
    loading: (state) => state.status === 'loading',
    saving: (state) => state.status === 'saving',
    notReady: (state) => state.status === 'notReady',
    /** 可保存：非保存中、非未就绪、base_url 合法 */
    canSave: (state) => state.status !== 'saving' && state.status !== 'notReady',
  },
  actions: {
    /** 读配置（**零明文回显**）：-32601 ⇒ notReady；其余失败 ⇒ error（可重试） */
    async load() {
      this.status = 'loading'
      this.error = ''
      this.errorKey = ''
      const token = useAuthStore().sessionToken
      try {
        const config = await getClient().weknoraGetConfig(token ? { token } : {})
        this.baseUrl = normalizeKbBaseUrl(config?.base_url ?? '')
        this.configured = config?.configured === true || config?.key_set === true
        this.source = config?.source ?? ''
        this.keyFp = config?.key_fp ?? ''
        this.status = this.configured ? 'ready' : 'unconfigured'
      } catch (error) {
        const mapped = mapRpcError(error)
        this.errorKey = mapped.key
        if (mapped.key === 'methodNotFound') {
          // 契约先行：daemon 还没这个端点 ⇒ 明说"服务端未就绪"，不假装成功
          this.status = 'notReady'
          this.error = ''
          return
        }
        this.status = 'error'
        this.error = mapped.detail
      }
    },
    /**
     * 写配置：`api_key` **只在本次入参出现**（store 不存）；
     * 成功 ⇒ success（显归一后的 base_url）；-32601 ⇒ notReady；失败 ⇒ error（可重试）。
     */
    async save(baseUrlRaw: string, apiKey: string) {
      const baseUrl = normalizeKbBaseUrl(baseUrlRaw)
      if (!isValidKbBaseUrl(baseUrl)) {
        this.status = 'invalid'
        this.errorKey = 'invalidUrl'
        this.error = baseUrlRaw
        return
      }
      if (!apiKey.trim()) {
        this.status = 'invalid'
        this.errorKey = 'emptyKey'
        this.error = ''
        return
      }
      const token = useAuthStore().sessionToken
      this.status = 'saving'
      this.error = ''
      this.errorKey = ''
      try {
        const result = await getClient().weknoraSetConfig({
          base_url: baseUrl,
          api_key: apiKey,
          ...(token ? { token } : {}),
        })
        this.baseUrl = normalizeKbBaseUrl(result?.normalized_base_url || baseUrl)
        this.savedBaseUrl = this.baseUrl
        this.configured = true
        this.source = 'file'
        this.status = 'saved'
      } catch (error) {
        const mapped = mapRpcError(error)
        this.errorKey = mapped.key
        if (mapped.key === 'methodNotFound') {
          this.status = 'notReady'
          this.error = ''
          return
        }
        this.status = 'error'
        this.error = mapped.detail
      }
    },
  },
})
