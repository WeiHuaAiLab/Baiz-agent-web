import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'csp-meta',
      apply: 'build',
      transformIndexHtml(html: string) {
        // Tauri 桌面壳的 CSP 由 tauri.conf.json 单一来源管理（含 ipc:），
        // 双策略取交集会挡死 IPC——仅 Web 构建注入 meta CSP。
        if (process.env.TAURI_ENV_PLATFORM) return html
        const csp =
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob:; font-src 'self' data:; " +
          "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; " +
          "worker-src 'self' blob:"
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        )
      },
    },
    ...(process.env.VITEST
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            manifest: {
              name: 'baiz',
              short_name: 'baiz',
              description: 'baiz Agent 前端',
              lang: 'zh-CN',
              display: 'standalone',
              start_url: '.',
              background_color: '#f7f7f8',
              theme_color: '#1f1f1f',
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
              navigateFallback: 'index.html',
              navigateFallbackDenylist: [/^\/rpc/, /^\/stream/],
            },
          }),
        ]),
  ],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1024,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})
