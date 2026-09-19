// 应用入口：i18n/pinia/路由初始化、客户端与重连管理器装配、PWA 注册、运行时错误捕获。
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { router } from './router'
import { detectRuntime } from './bridge'
import { getClientSetup } from './client/singleton'
import { SseReconnect } from './client/reconnect'
import { routeFrame } from './client/eventRouter'
import { useApprovalStore } from './stores/approval'
import { useMessageStore } from './stores/message'
import { useSettingsStore } from './stores/settings'
import { useFilesStore } from './stores/files'
import { createRpcPreviewLoader } from './utils/filePreview'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import './styles/main.css'

function initialLocale(): 'zh-CN' | 'en-US' {
  try {
    const saved = localStorage.getItem('baiz.locale')
    if (saved === 'zh-CN' || saved === 'en-US') return saved
  } catch {
    /* localStorage unavailable */
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
})

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(router)
app.mount('#app')

// 错误信息监听
window.addEventListener('error', (event) => {
  const errors = (window as unknown as { __errors?: string[] }).__errors ?? []
  errors.push(String(event.message))
  ;(window as unknown as { __errors?: string[] }).__errors = errors
})
// 监听错误的promise拒绝报错
window.addEventListener('unhandledrejection', (event) => {
  const errors = (window as unknown as { __errors?: string[] }).__errors ?? []
  errors.push(`unhandled: ${String(event.reason)}`)
  ;(window as unknown as { __errors?: string[] }).__errors = errors
})

// 获取（首次创建）传输层 + RPC 客户端
const { client, transport } = getClientSetup()
// 创建store
const messages = useMessageStore(pinia)
const approvals = useApprovalStore(pinia)
const settings = useSettingsStore(pinia)
settings.setDemoMode(transport.kind === 'mock')

// MSG-3014 包131：文件预览接真——previewLoader 调 daemon file.preview
// （授权目录钉死／服务端截断／原始字节零转码／二进制标记；R8「预览面装机
// 零执行」销）。mock 演示径不发 RPC——loader 恒 null 走诚实降级（零网面）。
const files = useFilesStore(pinia)
files.setPreviewLoader(
  createRpcPreviewLoader(async (path, maxBytes) => {
    if (transport.kind === 'mock') return null
    try {
      return await client.previewRead({ path, max_bytes: maxBytes })
    } catch {
      return null
    }
  }),
)

// F4 挡板（MSG-2322）：帧统一经 SseReconnect 弃帧面转发路由——重放残帧
// （id<=订阅基线）不达 routeFrame（勿重复处理旧帧）；mock 演示径亦同路。
const reconnect = new SseReconnect({
  transport,
  taskId: '*',
  subscribe: (params) => client.subscribe(params),
  // 首连 handshake：短连接探测 daemon 最新 seq（mock 演示无此端不注入）
  ...(transport.kind === 'mock' ? {} : { probeLatestSeq: () => client.probeEventSeq() }),
  onStateChange: (state) => settings.setConnection(state),
  // 标准 v1.0 §C B6（重连补拉）：每次（重）连建立即调 permission.pending——
  // 推送可丢、状态须可查，断线期间产生的卡重连后仍在。
  onConnected: () => {
    void approvals.syncPending()
  },
})
reconnect.onDispatch((frame) => routeFrame(frame, messages, approvals))

// SSE 流断线自动续、不丢事件
void reconnect.start().catch((error) => console.warn('[baiz] reconnect failed:', error))

if (detectRuntime() !== 'tauri') {
  registerSW({ immediate: true })
}

console.info(`[baiz] runtime=${detectRuntime()} locale=${i18n.global.locale.value}`)
