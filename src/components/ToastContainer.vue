<script setup lang="ts">
// 全局通知浮层：渲染 ui store 的 toasts 列表（info/success/error）。
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
</script>

<template>
  <div class="toast-container">
    <div v-for="toast in ui.toasts" :key="toast.id" class="toast" :class="toast.type">
      {{ toast.message }}
    </div>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 200;
}

.toast {
  min-width: 220px;
  max-width: 360px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  color: var(--text);
}

.toast.success {
  border-left: 3px solid #1e7e34;
}

.toast.error {
  border-left: 3px solid #c0392b;
}

.toast.info {
  border-left: 3px solid #2563eb;
}
</style>
