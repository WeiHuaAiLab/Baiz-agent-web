import { createRouter, createWebHashHistory } from 'vue-router'
import { readWorkingTab, workingTabPath } from '../utils/workingTabs'

/**
 * MSG-3340（1.0.20 批 A · A3-①）：**未登录态唯一放行的非登录路由**。
 * 干净机开箱路径＝无 token 也要能填「知识库域名＋API Key」⇒ 只放行「连接知识库」目标路由；
 * 其余非登录路由（chat／working／settings）未登录**一律弹回 /login**（对照断言钉死）。
 */
export const LOGOUT_ALLOWED_ROUTE_NAMES: readonly string[] = ['kb-setup']

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../components/LoginView.vue'),
    },
    {
      path: '/',
      name: 'chat',
      // 右侧扩展面板（抽屉）由 ChatView 内部配置驱动，不再依赖路由命名视图
      component: () => import('../components/ChatView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../components/settings/SettingsView.vue'),
    },
    {
      // MSG-3340（1.0.20 批 A · A3-①）：未登录态**唯一**可达的设置类路由——
      // 只装「连接知识库」卡（KbSetupView），不装设置页其余卡 ⇒ 放宽面最小。
      path: '/kb-setup',
      name: 'kb-setup',
      component: () => import('../components/settings/KbSetupView.vue'),
    },
    {
      path: '/working',
      name: 'working',
      component: () => import('../components/working/WorkingView.vue'),
      // MSG-3375 U-4：进入 /working 落**上次页签**（无记忆／记忆非法 ⇒ 定时任务，
      // 即保持既有默认面）。页签可见性与记忆写入在 `WorkingView.vue`。
      redirect: () => workingTabPath(readWorkingTab()),
      children: [
        // 普通任务页暂时不展示（默认进入定时任务页），恢复时取消注释即可
        // {
        //   path: 'tasks',
        //   name: 'working-tasks',
        //   component: () => import('../components/working/TasksView.vue'),
        // },
        {
          path: 'scheduled',
          name: 'working-scheduled',
          component: () => import('../components/working/ScheduledView.vue'),
        },
        {
          path: 'extensions',
          name: 'working-extensions',
          component: () => import('../components/working/ExtensionsView.vue'),
        },
      ],
    },
  ],
})

// MSG-2287 需求乙：登录闸——未登录态全功能面拦截（登录页除外），
// 提示词照堂钉「请使用 https://kb.ruiac.net/ 的账号登录」勿自撰。
//
// MSG-3340（1.0.20 批 A · A3-①）：**开一条最小口**——未登录态放行
// 「连接知识库」目标路由（`kb-setup`，白名单见 `LOGOUT_ALLOWED_ROUTE_NAMES`）。
// 动因：干净机开箱是"未登录 ⇒ 配不了知识库 ⇒ 登录撞 -32010 ⇒ 拿不到 token"死循环。
// **紧致**：白名单只此一条，其余非登录路由（chat／working／settings）未登录仍弹回
// /login——删掉这条闸会让"对照断言"立刻变红（见 MSG-3340 红证 ②）。
router.beforeEach(async (to) => {
  if (to.name === 'login') return true
  if (typeof to.name === 'string' && LOGOUT_ALLOWED_ROUTE_NAMES.includes(to.name)) return true
  const { useAuthStore } = await import('../stores/auth')
  const auth = useAuthStore()
  if (!auth.sessionToken) {
    auth.hydrate()
  }
  // MSG-3509 P1③④：会话态零命中时**再问一次壳侧持久身份**（系统凭据库）——
  // 命中即放行（自动更新/重启后仍登录）；桥未通/未命中 ⇒ 照旧回登录页。
  if (!auth.loggedIn) {
    await auth.hydrateAsync()
  }
  if (!auth.loggedIn) {
    return { name: 'login' }
  }
  return true
})
