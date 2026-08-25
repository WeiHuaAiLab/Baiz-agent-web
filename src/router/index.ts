import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'chat',
      // 右侧扩展面板（抽屉）由 ChatView 内部配置驱动，不再依赖路由命名视图
      component: () => import('../components/ChatView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../components/SettingsView.vue'),
    },
  ],
})
