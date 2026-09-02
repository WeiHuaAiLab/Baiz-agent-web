import { createRouter, createWebHashHistory } from 'vue-router'

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
      path: '/working',
      name: 'working',
      component: () => import('../components/working/WorkingView.vue'),
      redirect: '/working/scheduled',
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
router.beforeEach(async (to) => {
  if (to.name === 'login') return true
  const { useAuthStore } = await import('../stores/auth')
  const auth = useAuthStore()
  if (!auth.sessionToken) {
    auth.hydrate()
  }
  if (!auth.loggedIn) {
    return { name: 'login' }
  }
  return true
})
