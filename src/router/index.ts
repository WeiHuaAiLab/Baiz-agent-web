import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'chat', component: () => import('../components/ChatView.vue') },
    { path: '/settings', name: 'settings', component: () => import('../components/SettingsView.vue') },
  ],
})
