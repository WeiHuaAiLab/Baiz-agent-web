// **R2 波一 · web 面两件** 红证（T11＝DEBT-872／T3＝DEBT-875）
//
// 判据总纲：**每条都写明"改前会怎样"**——只断言"改后是什么"的话，一支恒绿的空测试也能过。
//
// T11（≈8M 附件：无提示、无动态）
//   ① 明确提示：单件上限／当前体积／可否发送（`AttachmentRow` 的 `.attachment-limit`）
//   ② 进行态：读取在途即显「正在读取附件… N/M」（`files.attachProcessing`）
//   ③ 超限人话：说清限值与该怎么做；**超限件不读内容**（改前 8M 图照读 ⇒ 约 10.7M base64 常驻）
//      且**发送被拦**（改前一路照发）
// T3（配置与登录校验）
//   (a) 登录表单：空／明显非法 **前端拦下并给人话**、**零 RPC 触达**（改前照发后端）
//   (b) 配置重开即空：**有令牌而 uid 暂空**时照读（改前被误判为未登录面 ⇒ 显「未配置」＋空表单）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import LoginView from '../src/components/LoginView.vue'
import AttachmentRow from '../src/components/chat/AttachmentRow.vue'
import ChatInput from '../src/components/chat/ChatInput.vue'
import KbCard from '../src/components/settings/KbCard.vue'
import { router } from '../src/router'
import { useAuthStore } from '../src/stores/auth'
import { useFilesStore } from '../src/stores/files'
import { useKbStore } from '../src/stores/kb'
import { useMessageStore } from '../src/stores/message'
import { useUiStore } from '../src/stores/ui'
import { getClientSetup, resetClientForTests } from '../src/client/singleton'
import { isObviouslyInvalidAccount, validateLoginInput } from '../src/utils/authFailure'
import {
  MAX_ATTACHMENT_BYTES,
  attachmentLimitText,
  isAttachmentOverLimit,
} from '../src/utils/attachment'
import zhCN from '../src/locales/zh-CN'

/** 登录 RPC 替身：`auth.login` 走 `createDefaultClient()`（**新建** client，非单例）⇒ 只能模块面替身 */
const { authLoginSpy } = vi.hoisted(() => ({ authLoginSpy: vi.fn() }))
vi.mock('../src/client/factory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/factory')>()
  return {
    ...actual,
    createDefaultClient: () => ({
      connect: async () => undefined,
      authLogin: authLoginSpy,
    }),
  }
})

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

/** 超限件替身：只给 `attachFromFiles` 真正会读的三字段——**故意不给 `text()`/FileReader 面**，
 *  以此证明"超限件一步都不读"（若代码仍去读，本替身会直接抛 TypeError ⇒ 红） */
function oversizeStub(size: number, name = 'big.png', type = 'image/png') {
  return { name, type, size } as unknown as File
}

/** 正常文本件替身。
 *
 *  **为何不用真 `new File(...)`**：本仓 jsdom 的 `File.prototype.text` **不存在**
 *  （探针实测 `typeof file.text === 'undefined'`），而 `attachFromFiles` 里
 *  `await file.text().catch(...)` 的 `.catch` 挂在**调用结果**上——`file.text()` 是**同步抛错**
 *  ⇒ `.catch` 根本轮不到，异常直接落进外层 `catch` ⇒ 该件被记为"读取失败"、不入列
 *  （＝与产品逻辑无关的**环境噪声**；浏览器 Blob.text 是基线能力）。
 *  故替身补齐 store 真正会用的面：`name`／`type`／`size`／`text()`。 */
function fileStub(name: string, body: string, type = 'text/plain') {
  return {
    name,
    type,
    size: new TextEncoder().encode(body).length,
    text: async () => body,
  } as unknown as File
}

/** 本文件**全程共用同一个 pinia 实例**：`mount` 若另传 `createPinia()`，组件看到的是
 *  **另一个空 store**——前置填充（附件／令牌）全部落空，断言即假红/假绿。 */
let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  resetClientForTests()
  vi.clearAllMocks()
  localStorage.clear()
})

// ───────────────────────── T11 ─────────────────────────
describe('T11-③ 超限件：不读内容 ＋ 人话 ＋ 标记不可发送', () => {
  it('8M+ 件 ⇒ 标记 overLimit、零内容、零 dataUrl，并给人话（含限值）', async () => {
    const files = useFilesStore()
    const ui = useUiStore()
    // 改前：本行会去 `FileReader.readAsDataURL`——替身无此面 ⇒ TypeError ⇒ 静默 catch 掉，
    // 且**无任何 overLimit 标记、无任何提示**（＝DEBT-872 的"无提示无动态"）
    await files.attachFromFiles([oversizeStub(9 * 1024 * 1024)])

    const item = files.attachments[0]
    expect(item.overLimit, '超限件必须带 overLimit 标记（界面据此显"不可发送"）').toBe(true)
    expect(item.dataUrl, '超限件不得留 dataUrl（8M 图 base64 ≈ 10.7M 常驻内存）').toBeUndefined()
    expect(item.content, '超限件不得留 content').toBeUndefined()
    expect(item.size, '元信息仍须落列（界面要显示体积）').toBe(9 * 1024 * 1024)

    const toast = ui.toasts.map((item) => item.message).join('|')
    expect(toast, '须给超限人话').toContain('超过单件上限')
    expect(toast, '人话须含限值').toContain(attachmentLimitText())
    expect(toast, '人话须说"该怎么做"').toContain('请换更小的文件')
  })

  it('上限判据：边界放行、越界才拦（与 web 护栏 `>` 同口径）', () => {
    expect(isAttachmentOverLimit(MAX_ATTACHMENT_BYTES), '等于上限 ⇒ 放行').toBe(false)
    expect(isAttachmentOverLimit(MAX_ATTACHMENT_BYTES + 1), '越界 1 字节 ⇒ 拦').toBe(true)
    expect(isAttachmentOverLimit(8 * 1024 * 1024 - 1)).toBe(false)
  })

  it('未超限件 ⇒ 照旧读入（零回归：不误伤正常附件）', async () => {
    const files = useFilesStore()
    const ui = useUiStore()
    await files.attachFromFiles([fileStub('a.txt', 'hello')])
    expect(files.attachments[0].overLimit).toBeUndefined()
    expect(files.attachments[0].content).toBe('hello')
    expect(files.attachmentsSendable, '正常件须可发送').toBe(true)
    expect(ui.toasts, '正常件不得报警').toEqual([])
  })
})

describe('T11-② 进行态：读取在途即可见（改前零反馈＝静默卡住）', () => {
  it('读取未毕 ⇒ attachProcessing 为真且计数可见；读毕自动复位', async () => {
    const files = useFilesStore()
    let release: (v: string) => void = () => {}
    const gate = new Promise<string>((resolve) => {
      release = resolve
    })
    const slow = {
      name: 'slow.txt',
      type: 'text/plain',
      size: 10,
      text: () => gate,
    } as unknown as File

    const pending = files.attachFromFiles([slow])
    // 改前：store **无 attachProcessing 这种状态**，此处恒 false ⇒ 界面只能静止
    expect(files.attachProcessing, '读取在途 ⇒ 必有进行态').toBe(true)
    expect(files.attachReadingTotal, '本批总数须可见（"处理中 N/M"的 M）').toBe(1)
    expect(files.attachReading, '尚未读毕 ⇒ 已完成数为 0').toBe(0)

    release('hi')
    await pending
    expect(files.attachProcessing, '读毕须复位（不得永久挂"处理中"）').toBe(false)
    expect(files.attachments[0].content).toBe('hi')
  })

  it('多件批处理：计数逐件推进到 N/N', async () => {
    const files = useFilesStore()
    const pending = files.attachFromFiles([
      fileStub('a.txt', 'a'),
      fileStub('b.txt', 'b'),
    ])
    expect(files.attachReadingTotal).toBe(2)
    await pending
    expect(files.attachments).toHaveLength(2)
    expect(files.attachProcessing).toBe(false)
  })
})

describe('T11-① 附件行：上限／当前体积／可否发送 三条一处说清', () => {
  const mountRow = () => mount(AttachmentRow, { global: { plugins: [i18n, pinia] } })

  it('无附件且不在读 ⇒ 整行不渲染（零占位）', () => {
    const w = mountRow()
    expect(w.find('.attachment-block').exists()).toBe(false)
  })

  it('有附件 ⇒ 显「当前 X / 单件上限 8.0 MB」＋「可发送」', async () => {
    const files = useFilesStore()
    await files.attachFromFiles([fileStub('a.txt', 'hello')])
    const w = mountRow()
    const line = w.find('.attachment-limit')
    expect(line.exists()).toBe(true)
    expect(line.text()).toContain('当前')
    expect(line.text(), '上限须上屏').toContain(attachmentLimitText())
    expect(line.text()).toContain('可发送')
    expect(line.attributes('data-sendable')).toBe('1')
  })

  it('超限件 ⇒ data-sendable=0 ＋ 该件上写明「超限·不可发送」', async () => {
    const files = useFilesStore()
    await files.attachFromFiles([oversizeStub(9 * 1024 * 1024, 'huge.png')])
    const w = mountRow()
    expect(w.find('.attachment-limit').attributes('data-sendable'), '超限 ⇒ 不可发送').toBe('0')
    expect(w.find('.attachment-limit').text()).toContain('超限，暂不可发送')
    expect(w.find('.attachment-limit').text(), '须说"该怎么做"').toContain('请移除')
    expect(w.find('[data-att-over="1"]').exists()).toBe(true)
    expect(w.find('.att-over-hint').text()).toContain('超限')
  })

  it('进行态 ⇒ 显「正在读取附件… N/M」', () => {
    const files = useFilesStore()
    files.attachReading = 1
    files.attachReadingTotal = 3
    const w = mountRow()
    const chip = w.find('[data-att-processing="1"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('正在读取附件… 1/3')
  })
})

describe('T11 发送闸：超限件不得发出，且不得清掉用户的输入与附件', () => {
  it('超限在列 ⇒ 提交零 RPC，输入框与附件**原地保留**', async () => {
    const files = useFilesStore()
    const messages = useMessageStore()
    const send = vi.spyOn(messages, 'sendUserMessage').mockResolvedValue(undefined)
    await files.attachFromFiles([oversizeStub(9 * 1024 * 1024)])

    const w = mount(ChatInput, { global: { plugins: [i18n, router] } })
    await w.find('textarea').setValue('看这个附件')
    await w.find('form.composer').trigger('submit')
    await flushPromises()

    // 改前：sendWith 无此闸 ⇒ 8M 件**照发**（且乐观清理先把附件抹了，用户还得重选）
    expect(send, '超限 ⇒ 一条都不许发').not.toHaveBeenCalled()
    expect(files.attachments, '附件须原地保留（不得被乐观清理抹掉）').toHaveLength(1)
    expect(w.find('textarea').element.value, '草稿须原地保留').toBe('看这个附件')
    expect(
      useUiStore().toasts.map((t) => t.message).join('|'),
      '拦下须给人话',
    ).toContain('超限，暂不可发送')
  })

  it('正常附件 ⇒ 照常发出（证明闸只挡超限，不误伤）', async () => {
    const files = useFilesStore()
    const messages = useMessageStore()
    const send = vi.spyOn(messages, 'sendUserMessage').mockResolvedValue(undefined)
    await files.attachFromFiles([fileStub('ok.txt', 'ok')])

    const w = mount(ChatInput, { global: { plugins: [i18n, router] } })
    await w.find('textarea').setValue('正常一条')
    await w.find('form.composer').trigger('submit')
    await flushPromises()

    expect(send).toHaveBeenCalledTimes(1)
    expect(files.attachments, '发出后乐观清理照旧').toHaveLength(0)
  })
})

// ───────────────────────── T3(a) 登录校验 ─────────────────────────
describe('T3(a) 登录表单：空／明显非法 ⇒ 前端拦下并给人话（零 RPC）', () => {
  it('纯函数判据：明显非法逐类命中、合法放行', () => {
    for (const bad of ['', '   ', 'asdf', 'a@b', '@b.com', 'a@.com', 'a b@c.com', 'a@@b.com']) {
      expect(isObviouslyInvalidAccount(bad), `「${bad}」属明显非法`).toBe(true)
    }
    for (const good of ['you@example.com', 'boss@kb.ruiac.net', 'a.b+c@sub.domain.cn']) {
      expect(isObviouslyInvalidAccount(good), `「${good}」须放行`).toBe(false)
    }
    expect(validateLoginInput('', 'pw')).toBe('请输入账号')
    expect(validateLoginInput('   ', 'pw')).toBe('请输入账号')
    expect(validateLoginInput('asdf', 'pw')).toContain('账号格式不对')
    expect(validateLoginInput('you@example.com', '')).toBe('请输入密码')
    expect(validateLoginInput('you@example.com', '   ')).toBe('请输入密码')
    expect(validateLoginInput('you@example.com', 'pw'), '合法组合须放行').toBe('')
  })

  const mountLogin = () => mount(LoginView, { global: { plugins: [i18n, router] } })
  const submitWith = async (email: string, password: string) => {
    const w = mountLogin()
    const inputs = w.findAll('.login-field input')
    await inputs[0].setValue(email)
    await inputs[1].setValue(password)
    await w.find('form.login-form').trigger('submit')
    await flushPromises()
    return w
  }

  it('空输入提交 ⇒ 显人话、**一个 RPC 都不发**（改前：`!email` 只挡真空，且挡了也无声）', async () => {
    const w = await submitWith('', '')
    expect(w.find('.login-error').text()).toBe('请输入账号')
    expect(authLoginSpy, '前端已拦 ⇒ 不得触达后端').not.toHaveBeenCalled()
  })

  it('乱输入提交 ⇒ 显人话、零 RPC（改前：一路照发后端）', async () => {
    const w = await submitWith('luan-shu-ru', 'luan-shu-ru')
    expect(w.find('.login-error').text()).toContain('账号格式不对')
    expect(authLoginSpy).not.toHaveBeenCalled()
  })

  it('纯空白账号 ⇒ 拦下（改前空白串是 JS 真值 ⇒ 按钮可点、照发）', async () => {
    const w = await submitWith('   ', 'pw')
    expect(w.find('.login-error').text()).toBe('请输入账号')
    expect(authLoginSpy).not.toHaveBeenCalled()
  })

  it('合法输入 ⇒ **放行到后端**（证明闸不误伤：前端闸不是安全边界，后端仍须独立校验）', async () => {
    authLoginSpy.mockRejectedValueOnce(new Error('RPC -32000: boom'))
    const w = await submitWith('you@example.com', 'pw')
    expect(authLoginSpy, '合法组合须照发').toHaveBeenCalledTimes(1)
    expect(authLoginSpy.mock.calls[0][0]).toMatchObject({ email: 'you@example.com', password: 'pw' })
    expect(w.find('.login-error').exists(), '败面须上屏（禁静默）').toBe(true)
  })
})

// ───────────────────────── T3(b) 配置重开即空 ─────────────────────────
describe('T3(b) KB 配置：有令牌而 uid 暂空 ⇒ 照读（改前误判未登录面 ⇒ 显"未配置"＋空表单）', () => {
  it('令牌在、uid 空 ⇒ 发读 RPC 并**显示读回值**', async () => {
    const auth = useAuthStore()
    const kb = useKbStore()
    auth.sessionToken = 'tok-r2'
    auth.userId = '' // daemon 响应缺 user_id（stores/auth.ts:160 落空串）／uid 待补期
    const get = vi.spyOn(getClientSetup().client, 'weknoraGetConfig').mockResolvedValue({
      base_url: 'https://kb.example.test',
      configured: true,
      source: 'file',
      key_fp: 'ab12…ef34',
    } as never)

    await kb.load()

    // 改前：`if (!account) return` ⇒ 这里 0 次调用、status='unconfigured'、baseUrl=''
    expect(get, '有令牌 ⇒ 有权读，须真读').toHaveBeenCalledTimes(1)
    expect(kb.baseUrl, '读回值须上屏（这正是"配置重开即空"的正面）').toBe('https://kb.example.test')
    expect(kb.configured).toBe(true)
    expect(kb.status).toBe('ready')
    expect(kb.unreadReason, '真读了 ⇒ 不得带"读不到"的原因').toBe('')
  })

  it('A1 不破：无令牌且无身份 ⇒ 仍不发读、不显示（安全面原样）', async () => {
    const kb = useKbStore()
    const get = vi.spyOn(getClientSetup().client, 'weknoraGetConfig').mockResolvedValue({
      base_url: 'https://someone-else.example.test',
      configured: true,
    } as never)

    await kb.load()

    expect(get, '未登录面不得发读 RPC（A1①）').not.toHaveBeenCalled()
    expect(kb.baseUrl, '未登录面不得显示任何 KB 值').toBe('')
    expect(kb.status, 'A1 钉桩口径逐字不变').toBe('unconfigured')
    expect(kb.unreadReason, '须自报原因：是"没身份、没读"，不是"没配过"').toBe('unauthenticated')
  })

  it('有 uid 而**无**令牌（A8 夹具形）⇒ 照旧真读，不得被误判成"没身份"', async () => {
    const auth = useAuthStore()
    auth.sessionToken = ''
    auth.userId = 'acct-a8-shape'
    const get = vi.spyOn(getClientSetup().client, 'weknoraGetConfig').mockResolvedValue({
      base_url: '',
      configured: false,
      source: 'none',
    } as never)

    await useKbStore().load()

    expect(get, '有身份 ⇒ 有权读（A8 三态断言即建在此形上，不得误伤）').toHaveBeenCalledTimes(1)
    expect(useKbStore().unreadReason, '真读了 ⇒ 原因须空').toBe('')
  })

  it('有令牌而 uid 空 ⇒ **不写按账号缓存**（空键会串到下一个同样 uid 暂空的账号）', async () => {
    const auth = useAuthStore()
    const kb = useKbStore()
    auth.sessionToken = 'tok-r2'
    auth.userId = ''
    const get = vi.spyOn(getClientSetup().client, 'weknoraGetConfig').mockResolvedValue({
      base_url: 'https://kb-a.example.test',
      configured: true,
    } as never)
    await kb.load()

    // 换一个账号（uid 也暂空、令牌不同）⇒ 若缓存键为 ''，这里会读到上一个账号的值
    get.mockResolvedValue({ base_url: '', configured: false } as never)
    auth.sessionToken = 'tok-r2-other'
    await kb.load()
    expect(kb.baseUrl, '不得残留上一个账号的 KB').toBe('')
  })
})

describe('T3(b) 状态行三态：未登录（读不到）不得显示成「未配置」', () => {
  it('未登录面 ⇒ 显「未登录，暂无法读取配置」，**不显「未配置」**', async () => {
    const w = mount(KbCard, { global: { plugins: [i18n, pinia] } })
    await flushPromises()
    const line = w.find('.kb-state').text()
    // 改前：走 `default:` 分支 ⇒ 写「未配置」＋空表单 ⇒ 用户读作"配置被清空了"
    expect(line, '须说清是"读不到"').toContain('未登录，暂无法读取配置')
    expect(line, '不得把"读不到"说成"未配置"').not.toContain('未配置')
  })

  it('已登录且读回"确实没配过" ⇒ 仍显「未配置」（不得反过来把正常态说成读不到）', async () => {
    const auth = useAuthStore()
    auth.sessionToken = 'tok-r2'
    auth.userId = 'acct-r2'
    vi.spyOn(getClientSetup().client, 'weknoraGetConfig').mockResolvedValue({
      base_url: '',
      configured: false,
      source: 'none',
    } as never)
    const w = mount(KbCard, { global: { plugins: [i18n, pinia] } })
    await flushPromises()
    expect(w.find('.kb-state').text()).toContain('未配置')
    expect(w.find('.kb-state').text()).not.toContain('未登录')
  })
})
