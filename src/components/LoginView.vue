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
      <!-- DEBT-743：干净机器首登撞 -32010（知识库未配置）⇒ 指路设置页，而非"账号密码错" -->
      <p v-if="auth.kbNotConfigured" class="login-kb">{{ t('errors.kbNotConfigured') }}</p>
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
        <!-- T3／DEBT-875(a)：前端校验人话优先于后端回执（有前端问题先说前端问题） -->
        <p v-if="formError" class="login-error" role="alert">{{ formError }}</p>
        <p v-else-if="auth.error" class="login-error" role="alert">{{ auth.error }}</p>
        <!-- 改前 `|| !email || !password` 把按钮按死 ⇒ 用户点了没反应、**一句人话都没有**。
             现只要不在登录中即可点：点了由 submit() 的本地闸给出人话。 -->
        <button class="login-submit" type="submit" :disabled="auth.loading">
          {{ auth.loading ? "登录中…" : "登录" }}
        </button>
      </form>
      <!-- MSG-3340（1.0.20 批 A · A3-①）：未登录态**可达**「连接知识库」——
           干净机开箱路径：没有 token 也要能填域名＋API Key（否则 -32010 死循环）。
           路由侧只放行 kb-setup 一条，其余非登录路由未登录仍弹回本页。 -->
      <p class="login-kb-entry-row">
        <button type="button" class="login-kb-entry" @click="goKbSetup">
          {{ t('errors.goKbSetup') }}
        </button>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
// T3／DEBT-875(a)：前端闸——空／明显非法输入**本地拦下并给人话**
import { validateLoginInput } from "../utils/authFailure";

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const settings = useSettingsStore();
const email = ref("");
const password = ref("");
// 前端校验人话（与 auth.error＝后端回执分开摆：两条并存会让人不知道先改哪个）
const formError = ref("");

async function submit() {
  // T3／DEBT-875(a)：**先本地闸**——改前此处直接 `auth.login()`，空白串/乱输入一路照发
  const problem = validateLoginInput(email.value, password.value);
  if (problem) {
    formError.value = problem;
    return;
  }
  formError.value = "";
  const ok = await auth.login(email.value.trim(), password.value);
  if (ok) {
    void router.push("/");
  }
}

/** MSG-3340 A3-①：去「连接知识库」独立页（未登录可达；不放行设置页其余面） */
function goKbSetup() {
  void router.push({ name: "kb-setup" });
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
.login-kb {
  margin: 0 0 20px;
  align-self: flex-start;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--warning-soft);
  color: var(--risk-medium-text);
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
.login-kb-entry-row {
  margin: 16px 0 0;
  text-align: center;
}
.login-kb-entry {
  padding: 2px 4px;
  border: none;
  background: none;
  color: var(--accent);
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}
.login-kb-entry:hover {
  color: var(--accent-hover);
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
