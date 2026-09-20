<script setup lang="ts">
// 关于模块：品牌信息（slogan / 版本 / 运行环境）与系统状态（连接状态）。
// 原侧栏「关于我们」弹窗内容已并入此处。
import { useI18n } from 'vue-i18n'
// MSG-3203 DEBT-741：更新检查（桥能力门＋本地 toast 面）
import { detectRuntime, detectVersion, getBridge } from '../../bridge'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'
import { onMounted, ref } from 'vue'

const { t } = useI18n()
const settings = useSettingsStore()
const runtime = detectRuntime()
// MSG-2805 DEBT-569：版本显动态化——tauri 径 getVersion（壳 conf 同源）；
// null（web 径/桥未通）→ 诚实文案勿假值（勿 v0.1.0 硬编漂移）
const version = ref<string | null>(null)
onMounted(async () => {
  version.value = await detectVersion()
})

// **MSG-3203 DEBT-741**（移植 MSG-2726）：更新检查挂点——`updater.check`
// 能力门（tauri 形态 true；web/mock 形态 false ⇒ 钮不显、不炸）。
// 检查得新版 ⇒ 提示＋确认后 `install()`（壳侧 updater 被动装，装完重启生效）；
// 检查失败走人话文案（不静默成功）。
const bridge = getBridge()
const ui = useUiStore()
const updateSupported = bridge.has('updater.check')
const checking = ref(false)
// rust-expert MSG-3203 复审 D③：安装面另设闸——downloadAndInstall 消费资源，
// 二次触发必败；且安装期间用户重复点击无意义。
const installing = ref(false)

async function checkUpdate() {
  if (checking.value) return
  checking.value = true
  try {
    const result = await bridge.checkUpdate()
    if (result?.available) {
      ui.toast(`${t('settings.updateAvailable')} v${result.version}`, 'info')
      if (
        !installing.value &&
        window.confirm(`${t('settings.updateConfirm')} v${result.version}`)
      ) {
        installing.value = true
        await result.install()
      }
    } else {
      ui.toast(t('settings.updateNone'), 'success')
    }
  } catch {
    ui.toast(t('settings.updateFailed'), 'error')
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <div class="settings-card">
    <h2>{{ t('settings.about') }}</h2>
    <p class="section-desc">{{ t('settings.slogan') }}</p>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.version') }}</span>
      <span v-if="version" class="about-version">v{{ version }} · {{ runtime }}</span>
      <span v-else class="about-version">{{ runtime === 'tauri' ? '版本未取到 · tauri' : '本地预览' }}</span>
      <!-- MSG-3203 DEBT-741：检查更新（tauri 壳形态——updater.check 能力门） -->
      <button
        v-if="updateSupported"
        type="button"
        class="check-update-btn"
        :disabled="checking"
        @click="checkUpdate"
      >
        {{ checking ? t('settings.checking') : t('settings.checkUpdate') }}
      </button>
    </div>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.connection') }}</span>
      <span class="conn-state">
        <span class="status-dot" :class="settings.connection" />
        {{ t('status.' + settings.connection) }}
      </span>
    </div>
  </div>
</template>
