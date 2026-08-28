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
