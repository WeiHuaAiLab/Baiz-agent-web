<template>
  <div class="login-view">
    <div class="login-card">
      <h2 class="login-title">Baiz Agent 登录</h2>
      <p class="login-hint">请使用 https://kb.ruiac.net/ 的账号登录</p>
      <!-- DEBT-738（MSG-3148）：演示态**肉眼可辨**——登录页常显「演示模式（未连接）」
           （演示传输只在 dev 或显式 VITE_BAIZ_DEMO=1 时存在，绝不再生产兜底） -->
      <p v-if="settings.demoMode" class="login-mode">{{ t('chat.demoMode') }}</p>
      <!-- DEBT-742：会话被 daemon 判失效（-32002）后回到登录页——先说清原因再让人登 -->
      <p v-if="auth.sessionExpired" class="login-expired">{{ t('errors.sessionExpired') }}</p>
      <form class="login-form" @submit.prevent="submit">
        <label class="login-field">
          <span>账号</span>
          <input
            v-model="email"
            type="text"
            autocomplete="username"
            placeholder="邮箱"
            :disabled="auth.loading"
          />
        </label>
        <label class="login-field">
          <span>密码</span>
      <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="密码"
            :disabled="auth.loading"
          />
        </label>
        <p v-if="auth.error" class="login-error">{{ auth.error }}</p>
        <button class="login-submit" type="submit" :disabled="auth.loading || !email || !password">
          {{ auth.loading ? "登录中…" : "登录" }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const settings = useSettingsStore();
const email = ref("");
const password = ref("");

async function submit() {
  const ok = await auth.login(email.value.trim(), password.value);
  if (ok) {
    void router.push("/");
  }
}
</script>

<style scoped>
.login-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg);
}
.login-card {
  width: 360px;
  padding: 32px 28px;
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
}
.login-title {
  margin: 0 0 4px;
  font-size: 22px;
}
.login-hint {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--muted);
}
.login-mode {
  margin: 0 0 20px;
  align-self: flex-start;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--warning-soft);
  color: var(--risk-medium-text);
  font-size: 11px;
}
.login-expired {
  margin: 0 0 20px;
  align-self: flex-start;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.login-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.login-field input {
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-primary);
  font-size: 15px;
}
.login-field input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}
.login-error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}
.login-submit {
  min-height: 36px;
  padding: 8px 16px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  cursor: pointer;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 15px;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.login-submit:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.login-submit:disabled {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text-disabled);
  cursor: not-allowed;
}
</style>
