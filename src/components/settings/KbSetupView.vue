<script setup lang="ts">
// MSG-3340（1.0.20 批 A · A3-①）：未登录态可达的「连接知识库」独立页。
//
// 存在理由：干净机开箱是死循环——未登录进不去设置 ⇒ 配不了知识库 ⇒ 登录撞
// `-32010`（知识库未配置）⇒ 拿不到 token。本页＝**该循环的唯一出口**。
//
// **放宽面最小**（安全三栏之①）：本页只装 `KbCard`（域名＋API Key 两项），
// **不装**设置页其余任何卡（API Key／模型／MCP／工作区／记忆／关于）。
// 顶部一行按登录态分流：「返回登录」（未登录）／「返回聊天」（已登录）。
// 回退面（安全三栏之③）：把 `router/index.ts` 白名单里的 `'kb-setup'` 删掉
// 即整闸复原（本页随之不可达，零副作用）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import KbCard from './KbCard.vue'
import { useAuthStore } from '../../stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const backLabel = computed(() =>
  auth.loggedIn ? t('settings.kb.backToChat') : t('settings.kb.backToLogin'),
)

function goBack() {
  void router.push(auth.loggedIn ? { name: 'chat' } : { name: 'login' })
}
</script>

<template>
  <section class="settings-view kb-setup-view">
    <div class="settings-inner">
      <button type="button" class="kb-setup-back" @click="goBack">← {{ backLabel }}</button>
      <KbCard />
    </div>
  </section>
</template>

<style scoped>
/* 复用设置页布局类（.settings-view／.settings-inner），此处只加"返回"一行 */
.kb-setup-back {
  margin: 0 0 12px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.kb-setup-back:hover {
  background: var(--hover);
}
</style>
