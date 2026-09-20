<script setup lang="ts">
// MSG-3231 ②（ZCode 走查 [缺陷 3] 归位）：本卡＝**运行与更新**页的实内容——
// 版本 + 检查更新（741 的入口从「关于」搬到此处，页签名与内容就此一致）。
// 能力门：`bridge.has('updater.check')`（tauri 形态 true；web/mock false ⇒ 按钮不显、
// 且给一句"当前形态不支持"的诚实说明）。
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { detectRuntime, detectVersion, getBridge } from '../../bridge'
import { useUiStore } from '../../stores/ui'

const { t } = useI18n()
const ui = useUiStore()
const bridge = getBridge()
const runtime = detectRuntime()
const version = ref<string | null>(null)
const updateSupported = bridge.has('updater.check')
const checking = ref(false)
// rust-expert MSG-3203 复审 D③：安装面另设闸（downloadAndInstall 消费资源，
// 二次触发必败；安装期间重复点击无意义）。
const installing = ref(false)

onMounted(async () => {
  version.value = await detectVersion()
})

async function checkUpdate() {
  if (checking.value) return
  checking.value = true
  try {
    const result = await bridge.checkUpdate()
    if (result?.available) {
      ui.toast(`${t('settings.updateAvailable')} v${result.version}`, 'info')
      if (!installing.value && window.confirm(`${t('settings.updateConfirm')} v${result.version}`)) {
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
    <h2>{{ t('settings.runtimeTitle') }}</h2>
    <p class="section-desc">{{ t('settings.updateHint') }}</p>
    <div class="settings-row">
      <span class="row-label">{{ t('settings.version') }}</span>
      <span v-if="version" class="about-version">v{{ version }} · {{ runtime }}</span>
      <span v-else class="about-version">
        {{ runtime === 'tauri' ? t('settings.versionUnknown', { runtime }) : t('settings.localPreview') }}
      </span>
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
    <p v-if="!updateSupported" class="section-desc update-unsupported">
      {{ t('settings.updateUnsupported') }}
    </p>
  </div>
</template>
