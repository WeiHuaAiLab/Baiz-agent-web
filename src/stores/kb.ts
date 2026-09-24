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

/**
 * **MSG-3575 · A1 前端面**：KB **按账号缓存**（**内存**缓存·零落盘·**登出即清**）。
 *
 * 硬口径：①**未登录面不显示**他人/全局 KB（`load()` 直接落"未配置"且**不发读 RPC**）；
 * ②**切换账号须重取**——换账号先**清掉上一账号的显示值**，再按本账号缓存/服务端填充；
 * ③**零新增凭据落盘**：缓存只存 `base_url`／`configured`／`source`／`key_fp`（**无明文 key**），
 * 且只活在进程内（登出即清、重载即空）。
 */
export interface KbSnapshot {
  baseUrl: string
  configured: boolean
  source: string
  keyFp: string
}

const accountKbCache = new Map<string, KbSnapshot>()

/** 登出／换账号清场（auth store 调用；模块级函数 ⇒ 免 store 循环依赖） */
export function clearKbAccountCache(): void {
  accountKbCache.clear()
}

/** 诊断/测试用：缓存条目数（**不含内容**——零凭据外泄面） */
export function kbAccountCacheSize(): number {
  return accountKbCache.size
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
    /** **MSG-3575 A1**：当前显示值**属于哪个账号**（空＝未登录面）——换账号据此清场 */
    account: '' as string,
    /**
     * **T3／DEBT-875(b)**：显示面**读不到的原因**（`''`＝未发生或读回成功）。
     *
     * 存在的理由：`status === 'unconfigured'` 有**两种语义**——「读回成功、确实没配过」
     * 与「**没有身份、根本没读**」。两者在界面上必须分开说（T3(b) 要的正是这个区分），
     * 而判据**只此一处**（本 store 的 `load()` 早退支）——组件读本字段即可，
     * **不得**在组件里重抄一遍条件（抄了必漂；本件首跑即栽在这上面）。
     */
    unreadReason: '' as '' | 'unauthenticated',
  }),
  getters: {
    loading: (state) => state.status === 'loading',
    saving: (state) => state.status === 'saving',
    notReady: (state) => state.status === 'notReady',
    /** 可保存：非保存中、非未就绪、base_url 合法 */
    canSave: (state) => state.status !== 'saving' && state.status !== 'notReady',
  },
  actions: {
    /** **MSG-3575 A1**：换账号/登出 ⇒ **清显示面**（值清空＋落"未配置"）。
     *  缓存由 `clearKbAccountCache()` 单管；本动作**不动数据面**（不写不删任何配置）。 */
    resetAccountFace() {
      this.account = ''
      // 中性复位（不预设原因）：紧随其后的 `load()` 才是原因的唯一权威（KbCard onMounted 必调）
      this.unreadReason = ''
      this.baseUrl = ''
      this.configured = false
      this.source = ''
      this.keyFp = ''
      this.savedBaseUrl = ''
      this.error = ''
      this.errorKey = ''
      this.status = 'unconfigured'
    },
    /** 读配置（**零明文回显**）：-32601 ⇒ notReady；其余失败 ⇒ error（可重试） */
    async load() {
      const auth = useAuthStore()
      const account = (auth.userId ?? '').trim()
      const token = auth.sessionToken
      // **A1①**：**无令牌且无身份** ＝ 真·未登录面 ⇒ **不显示**他人/全局 KB，且**不发读 RPC**
      // （写径不受影响——「连接知识库」独立页仍可配：干净机开箱路径 MSG-3340 不破）。
      //
      // **T3／DEBT-875(b)**：改前此处**只判 `!account`（uid）**，把「**有令牌但 uid 暂空**」
      // 一并误判成未登录面 ⇒ 清空显示值并落 `unconfigured` ＝ 用户**明明登录着**、
      // 服务端配置也在，界面却写「未配置」＋空表单 ⇒ 观感即"**配置重开即空**"。
      // 何时会 uid 暂空：daemon 的 `auth.login` 响应缺 `user_id` 时 `stores/auth.ts:160` 落空串，
      // 而补 uid 的 `ensureIdentityUserId()` **只在 ChatPanel／ScheduledView 调用**
      // （`ChatPanel.vue:28`／`ScheduledView.vue:189`）——**设置页与 /kb-setup 之前没人补**
      // ⇒ 进程重启后直奔设置页即命中本径（web 形态尤甚：token 只在 sessionStorage）。
      // 判据改为「**两样都没有**」：有令牌即**有权读**，读接口本就以 token 定 owner
      // （见下方 `weknoraGetConfig(token ? { token } : {})`）。
      if (!account && !token) {
        // T3(b)：落**原因**（不是"没配过"，是"没身份、没读"）——界面据此改文案
        this.unreadReason = 'unauthenticated'
        this.account = ''
        this.baseUrl = ''
        this.configured = false
        this.source = ''
        this.keyFp = ''
        this.savedBaseUrl = ''
        this.error = ''
        this.errorKey = ''
        this.status = 'unconfigured'
        return
      }
      // T3(b)：能走到这里 = **真读了**（有令牌或有身份）⇒ 清掉"没读"的原因，
      // 免得上一次未登录面的文案残留到本次读回结果上
      this.unreadReason = ''
      // **A1②**：换账号 ⇒ **先清上一账号的显示值**（旧账号的值绝不残留上屏），
      // 同账号 ⇒ 先按**本账号缓存**即时填充（再走服务端刷新）
      if (this.account !== account) {
        this.account = account
        this.baseUrl = ''
        this.configured = false
        this.source = ''
        this.keyFp = ''
        this.savedBaseUrl = ''
      } else {
        const cached = accountKbCache.get(account)
        if (cached) {
          this.baseUrl = cached.baseUrl
          this.configured = cached.configured
          this.source = cached.source
          this.keyFp = cached.keyFp
        }
      }
      this.status = 'loading'
      this.error = ''
      this.errorKey = ''
      try {
        const config = await getClient().weknoraGetConfig(token ? { token } : {})
        // 响应回来时若**已换账号** ⇒ 丢弃本次结果（禁旧响应盖新账号面）
        if (this.account !== account) return
        const snapshot: KbSnapshot = {
          baseUrl: normalizeKbBaseUrl(config?.base_url ?? ''),
          configured: config?.configured === true || config?.key_set === true,
          source: config?.source ?? '',
          keyFp: config?.key_fp ?? '',
        }
        // **T3(b) 配套**：account 为空（有令牌、uid 暂空）时**不得入缓存**——键 '' 会被下一个
        // 同样 uid 暂空的账号读到 ⇒ 跨账号串值。显示值本次已由响应直接填充，无须缓存。
        if (account) accountKbCache.set(account, snapshot)
        this.baseUrl = snapshot.baseUrl
        this.configured = snapshot.configured
        this.source = snapshot.source
        this.keyFp = snapshot.keyFp
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
        // **A1**：写成功后同步本账号缓存（下次读即时正确）
        if (this.account) {
          accountKbCache.set(this.account, {
            baseUrl: this.baseUrl,
            configured: true,
            source: this.source,
            keyFp: this.keyFp,
          })
        }
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
