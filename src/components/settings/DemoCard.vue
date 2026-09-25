<script setup lang="ts">
// **MSG-3577 · P9**：「重置演示数据」**护栏版**（四条）。
//
// 旧版（病灶）：`confirm` ⇒ **`db.delete()`** ⇒ 删**所有** `baiz.*`（连**账号别名表**一起清）
// ⇒ 本地分段库整库消失、P2 两字形并读的字面来源丢失，且前端**无 daemon "列会话" RPC** ⇒ 不可回填。
//
// 现版：①**正式版不渲染本卡**（仅 dev／显式演示构建可达）；②**输入式确认**（逐字输入「重置」）
// ＋**逐条列出将清什么**（并明写"daemon/服务器数据不动"）；③**清前先导出备份**
// `baiz-backup-<ts>.json`，且**不再 `db.delete()`**（只清当前账号库三表）；④**别名表保留**。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DEMO_RESET_PHRASE,
  backupFileName,
  backupJsonText,
  clearLocalDemoData,
  collectBackup,
  demoResetAvailable,
  downloadTextFile,
  keysToClear,
  phraseMatches,
} from '../../utils/demoReset'

const { t } = useI18n()

/** ① 正式版收口：不可用 ⇒ 整卡不渲染（代码保留·不可达） */
const available = demoResetAvailable()
const open = ref(false)
const phrase = ref('')
const busy = ref(false)
const notice = ref('')

/** ② 逐条列出将清的设置键（本地库三表另列一行） */
const willClearKeys = computed(() => (open.value ? keysToClear() : []))
const canConfirm = computed(() => phraseMatches(phrase.value) && !busy.value)

function start() {
  open.value = true
  phrase.value = ''
  notice.value = ''
}

function cancel() {
  open.value = false
  phrase.value = ''
}

/**
 * ③④ 确认后：**先备份（含别名表）⇒ 再清场**——备份失败即**中止**（禁"无备份就清"）。
 * 备份是**本地下载**（零上传）；清场**不用 `db.delete()`**（只清当前账号库三表）。
 */
async function confirmReset() {
  if (!canConfirm.value) return
  busy.value = true
  notice.value = ''
  try {
    const payload = await collectBackup()
    downloadTextFile(backupFileName(), backupJsonText(payload))
    const result = await clearLocalDemoData()
    notice.value = t('settings.demoResetDone', {
      n: result.removedKeys.length,
      kept: result.keptKeys.length,
    })
    location.reload()
  } catch (error) {
    // 失败**照实上屏**（不静默、不假装已清）
    notice.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <!-- ① 正式版收口：`available` 为假 ⇒ 本卡**不渲染**（正式版不可达） -->
  <div v-if="available" class="settings-card" data-demo-card="1">
    <h2>{{ t('settings.demo') }}</h2>
    <p class="section-desc">{{ t('settings.demoHint') }}</p>
    <!-- **DEBT-886 · E3**：「重置演示数据」在正式版**不渲染**＝`demoResetAvailable()` **按设计收口**
         ——出说明（**零行为改动**），免得被当成"功能没做"反复立案 -->
    <p class="section-desc demo-dev-only">{{ t('settings.demoDevOnly') }}</p>

    <button v-if="!open" type="button" class="btn-ghost danger" @click="start">
      {{ t('settings.resetDemo') }}
    </button>

    <!-- ② 输入式确认面板（替代旧 `window.confirm`）：先讲清"清什么／不动什么"，再要求输入口令 -->
    <div v-else class="demo-reset-panel" data-demo-reset-panel="1">
      <p class="demo-reset-title">{{ t('settings.resetConfirm') }}</p>
      <ul class="demo-reset-list">
        <li>{{ t('settings.demoResetListTitle') }}</li>
        <li class="demo-reset-db">{{ t('settings.demoResetDb') }}</li>
        <li v-for="key in willClearKeys" :key="key" class="demo-reset-key">{{ key }}</li>
        <li class="demo-reset-keeps">{{ t('settings.demoResetKeeps') }}</li>
      </ul>
      <p class="demo-reset-backup">{{ t('settings.demoResetBackup') }}</p>
      <label class="demo-reset-field">
        <span class="row-label">{{ t('settings.demoResetPhrase', { phrase: DEMO_RESET_PHRASE }) }}</span>
        <input v-model="phrase" type="text" autocomplete="off" :disabled="busy" />
      </label>
      <div class="form-actions">
        <button type="button" class="btn-ghost" :disabled="busy" @click="cancel">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="btn-ghost danger" :disabled="!canConfirm" @click="confirmReset">
          {{ t('settings.resetDemo') }}
        </button>
      </div>
      <p v-if="notice" class="demo-reset-notice" role="status">{{ notice }}</p>
    </div>
  </div>
</template>
