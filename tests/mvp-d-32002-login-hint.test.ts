// **令·补24 片 D（P0-5）红证**：`-32002` 带回**登录出口**——错误帧 `data` 含 `login_hint`
// ⇒ **在该条消息处**渲染可点「去登录」入口（复用既有 `identity.notEstablished` / `identity.goLogin` 文案与 `goLogin` 径）。
//
// 本片按「**若字段存在即渲染**」实现（daemon 面另片加字段）：字段缺失 ⇒ 走既有文案，**不得报错**。
// 三条：①带 `login_hint` ⇒ 渲出可点「去登录」；②**缺失** ⇒ 仍走既有文案（负向对照）；
//       ③**拒绝语义不变**（前端不得把 `-32002` 当成功）。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { router } from '../src/router'
import { resetClientForTests } from '../src/client/singleton'
import { routeFrame } from '../src/client/eventRouter'
import { useApprovalStore } from '../src/stores/approval'
import { useMessageStore } from '../src/stores/message'
import { hasLoginHint } from '../src/utils/authFailure'
import MessageItem from '../src/components/chat/MessageItem.vue'
import StatusMessage from '../src/components/chat/message/StatusMessage.vue'
import zhCN from '../src/locales/zh-CN'
import enUS from '../src/locales/en-US'
import type { ChatMessage } from '../src/models'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
})

const SESSION_EXPIRED = 'RPC -32002: 会话已失效或服务端重启后身份不可证——请重新登录'

/** 走**真路由帧径**：daemon SSE `error` 帧 → store 落 status 消息（与装机面同一条链） */
function frameToMessage(taskId: string, conversationId: string, loginHint?: unknown): ChatMessage {
  const messages = useMessageStore()
  const approvals = useApprovalStore()
  messages.ensureRun(taskId, conversationId)
  routeFrame(
    {
      event: 'error',
      data: {
        task_id: taskId,
        message: SESSION_EXPIRED,
        ...(loginHint === undefined ? {} : { login_hint: loginHint }),
      },
    },
    messages,
    approvals,
  )
  const list = messages.list(conversationId)
  const msg = list.find((item) => item.kind === 'status')
  if (!msg) throw new Error('error 帧未落 status 消息')
  return msg
}

function mountStatus(message: ChatMessage) {
  return mount(StatusMessage, {
    props: { message },
    global: { plugins: [i18n, router] },
  })
}

function mountItem(message: ChatMessage) {
  return mount(MessageItem, {
    props: { message },
    global: { plugins: [i18n, router] },
  })
}

describe('片 D ① 带 login_hint ⇒ 该条消息处渲出可点「去登录」', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetClientForTests()
    sessionStorage.clear()
    await router.replace({ name: 'login' }).catch(() => undefined)
  })

  it('①a 帧带 login_hint ⇒ 消息 meta 置位 ＋ 人话文案 ＋ 可点入口', async () => {
    const msg = frameToMessage('t-d1', 'c-d1', 'relogin')
    expect(msg.meta?.loginHint).toBe(true)

    const wrapper = mountStatus(msg)
    expect(wrapper.find('[data-login-hint="1"]').exists()).toBe(true)
    // 文案＝既有 `identity.notEstablished`（人话：会话与定时任务归属账号，先登录）
    expect(wrapper.find('.identity-notice-text').text()).toBe(zhCN.identity.notEstablished)
    const entry = wrapper.find('.identity-login')
    expect(entry.exists()).toBe(true)
    expect(entry.text()).toBe(zhCN.identity.goLogin)
  })

  it('①b 入口**可点**且真的到登录页（走既有 goLogin 径）', async () => {
    await router.replace({ name: 'chat' }).catch(() => undefined)
    const msg = frameToMessage('t-d2', 'c-d2', 'relogin')
    const wrapper = mountItem(msg)
    const entry = wrapper.find('.identity-login')
    await entry.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('①c 经 MessageItem 分发链同显（不是只有直挂 StatusMessage 才出）', () => {
    const msg = frameToMessage('t-d3', 'c-d3', true)
    const wrapper = mountItem(msg)
    expect(wrapper.find('[data-login-hint="1"]').exists()).toBe(true)
    expect(wrapper.find('.identity-login').exists()).toBe(true)
  })
})

describe('片 D ② 缺失 login_hint ⇒ 走既有文案（负向对照·不得报错）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetClientForTests()
    sessionStorage.clear()
    await router.replace({ name: 'login' }).catch(() => undefined)
  })

  it('②a 帧无 login_hint ⇒ meta 不置位、无入口，既有文案照旧', () => {
    const msg = frameToMessage('t-d4', 'c-d4')
    expect(msg.meta?.loginHint).toBeUndefined()
    const wrapper = mountStatus(msg)
    expect(wrapper.find('[data-login-hint="1"]').exists()).toBe(false)
    expect(wrapper.find('.identity-login').exists()).toBe(false)
    // 既有面不变：仍显 daemon 原文（status.taskError ＋ errors.unknown ＋ 原文）
    expect(wrapper.find('.status-text').text()).toContain(SESSION_EXPIRED)
  })

  it('②b 空串／空白的 login_hint 视同缺失（不得因空值置位）', () => {
    for (const raw of ['', '   ']) {
      setActivePinia(createPinia())
      resetClientForTests()
      const msg = frameToMessage(`t-d5-${raw.length}`, `c-d5-${raw.length}`, raw)
      expect(msg.meta?.loginHint, `login_hint=${JSON.stringify(raw)} 不得置位`).toBeUndefined()
    }
  })

  it('②c 纯函数面：只有**非空字符串／true** 才算带 hint（禁"看着像就归"）', () => {
    expect(hasLoginHint('relogin')).toBe(true)
    expect(hasLoginHint(true)).toBe(true)
    expect(hasLoginHint('')).toBe(false)
    expect(hasLoginHint('   ')).toBe(false)
    expect(hasLoginHint(false)).toBe(false)
    expect(hasLoginHint(undefined)).toBe(false)
    expect(hasLoginHint(null)).toBe(false)
    expect(hasLoginHint(1)).toBe(false)
    expect(hasLoginHint({})).toBe(false)
  })
})

describe('片 D ③ 拒绝语义不变（前端不得把 -32002 当成功）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetClientForTests()
    sessionStorage.clear()
    await router.replace({ name: 'login' }).catch(() => undefined)
  })

  it('③a 带 login_hint 的消息仍是 **error 态**，绝不落 approved／成功面', () => {
    const msg = frameToMessage('t-d6', 'c-d6', 'relogin')
    expect(msg.meta?.status).toBe('error')
    expect(msg.meta?.approved).toBeUndefined()
    expect(msg.kind).toBe('status')

    const wrapper = mountStatus(msg)
    expect(wrapper.find('.status-text').classes()).toContain('error')
    expect(wrapper.find('.approval-card').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('✓ 已批准')
  })

  it('③b 登录出口**不解除**审批闸：待办仍挂在 store（出口≠放行）', () => {
    const approvals = useApprovalStore()
    approvals.upsert({ request_id: 'r-d6', action: 'shell_exec', risk: 'high' })
    const msg = frameToMessage('t-d7', 'c-d7', 'relogin')
    mountStatus(msg)
    expect(approvals.pending.some((item) => item.request_id === 'r-d6')).toBe(true)
  })
})
