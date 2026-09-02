<template>
  <div class="login-view">
    <div class="login-card">
      <h2 class="login-title">baiz 登录</h2>
      <p class="login-hint">请使用 https://kb.ruiac.net/ 的账号登录</p>
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
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const auth = useAuthStore();
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
  background: var(--bg, #f5f5f5);
}
.login-card {
  width: 360px;
  padding: 32px 28px;
  border-radius: 12px;
  background: var(--surface, #ffffff);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}
.login-title {
  margin: 0 0 4px;
  font-size: 20px;
}
.login-hint {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--muted, #888);
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.login-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.login-field input {
  padding: 8px 10px;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
}
.login-error {
  margin: 0;
  font-size: 13px;
  color: var(--danger, #c0392b);
}
.login-submit {
  padding: 10px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: var(--accent, #2f6fed);
  color: #fff;
}
.login-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
