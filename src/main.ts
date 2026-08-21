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

window.addEventListener('error', (event) => {
  const errors = (window as unknown as { __errors?: string[] }).__errors ?? []
  errors.push(String(event.message))
  ;(window as unknown as { __errors?: string[] }).__errors = errors
})
window.addEventListener('unhandledrejection', (event) => {
  const errors = (window as unknown as { __errors?: string[] }).__errors ?? []
  errors.push(`unhandled: ${String(event.reason)}`)
  ;(window as unknown as { __errors?: string[] }).__errors = errors
})

const { client, transport } = getClientSetup()
const messages = useMessageStore(pinia)
const approvals = useApprovalStore(pinia)
const settings = useSettingsStore(pinia)
settings.setDemoMode(transport.kind === 'mock')
client.onEvent((frame) => routeFrame(frame, messages, approvals))

const reconnect = new SseReconnect({
  transport,
  taskId: '*',
  subscribe: (params) => client.subscribe(params),
  onStateChange: (state) => settings.setConnection(state),
})
void reconnect.start().catch((error) => console.warn('[baiz] reconnect failed:', error))

if (detectRuntime() !== 'tauri') {
  registerSW({ immediate: true })
}

console.info(`[baiz] runtime=${detectRuntime()} locale=${i18n.global.locale.value}`)
