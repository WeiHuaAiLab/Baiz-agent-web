<script setup lang="ts">
// MSG-3231 ②（ZCode 走查 [缺陷 3] 归位）：本卡＝**运行与更新**页的实内容——
// 版本 + 检查更新（741 的入口从「关于」搬到此处，页签名与内容就此一致）。
// 能力门：`bridge.has('updater.check')`（tauri 形态 true；web/mock false ⇒ 按钮不显、
// 且给一句"当前形态不支持"的诚实说明）。
//
// MSG-3301「更新内容可见化」：发现新版后**不再用 `window.confirm` 原生框**——
// 改为卡内展开「更新内容」区（`notes`＝服务端 `latest.json.notes`，经桥接带出），
// 下方两枚明确按钮「现在更新／稍后」；`notes` **按纯文本渲染**（禁 v-html／
// innerHTML）＋**4KB 长度闸**＋超长可滚；无 `notes` 即显式兜底（**禁空白、禁假装**）。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { detectRuntime, detectVersion, getBridge } from '../../bridge'
import { useUiStore } from '../../stores/ui'
import { normalizeUpdateNotes } from '../../utils/updateNotes'

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
/** 待决更新（null＝无）：检查命中即置，装完／「稍后」即清 */
const pending = ref<{
  version?: string
  notes?: string | null
  install: () => Promise<void>
} | null>(null)
/** 更新内容区折叠态：**默认展开**（老板问的就是"更新了什么"——不该藏着） */
const notesOpen = ref(true)
/** 显示前规范化（换行正常化＋4KB 截断明示）——纯文本，无 HTML 解析 */
const notes = computed(() => normalizeUpdateNotes(pending.value?.notes))

onMounted(async () => {
  version.value = await detectVersion()
})

async function checkUpdate() {
  if (checking.value) return
  checking.value = true
  try {
    const result = await bridge.checkUpdate()
    if (result?.available) {
      // MSG-3301：卡内呈现（含服务端更新说明），不再弹原生确认框
      pending.value = { version: result.version, notes: result.notes, install: result.install }
      notesOpen.value = true
      ui.toast(`${t('settings.updateAvailable')} v${result.version}`, 'info')
    } else {
      pending.value = null
      ui.toast(t('settings.updateNone'), 'success')
    }
  } catch {
    ui.toast(t('settings.updateFailed'), 'error')
  } finally {
    checking.value = false
  }
}

/** 「现在更新」：`installing` 闸下二次点击无效（既有闸保留） */
async function installNow() {
  const target = pending.value
  if (!target || installing.value) return
  installing.value = true
  try {
    await target.install()
    pending.value = null
  } catch (error) {
    ui.toast(`${t('settings.updateFailed')}：${(error as Error).message}`, 'error')
  } finally {
    installing.value = false
  }
}

/** 「稍后」：收起本卡（更新对象按设计不由长期持有——下次检查重取） */
function dismissUpdate() {
  if (installing.value) return
  pending.value = null
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

    <!-- MSG-3301：更新内容区（服务端 notes——纯文本、可折叠·默认展开、超长可滚） -->
    <section v-if="pending" class="update-notes" data-state="available">
      <button
        type="button"
        class="update-notes-head"
        :aria-expanded="notesOpen"
        @click="notesOpen = !notesOpen"
      >
        <span class="update-notes-title">{{ t('settings.updateWhatsNew') }}</span>
        <span class="update-notes-toggle">{{ notesOpen ? '▾' : '▸' }}</span>
      </button>
      <div v-if="notesOpen" class="update-notes-panel">
        <p v-if="!notes.text" class="update-notes-empty">{{ t('settings.updateNoNotes') }}</p>
        <template v-else>
          <!-- 纯文本节点：notes 系服务端可控文本——此面**恒不** v-html -->
          <pre class="update-notes-body">{{ notes.text }}</pre>
          <p v-if="notes.truncated" class="update-notes-trunc">
            {{ t('settings.updateNotesTruncated') }}
          </p>
        </template>
        <div class="update-notes-actions">
          <button
            type="button"
            class="update-now-btn"
            :disabled="installing"
            @click="installNow"
          >
            {{ installing ? t('settings.updateInstalling') : t('settings.updateNow') }}
          </button>
          <button
            type="button"
            class="update-later-btn"
            :disabled="installing"
            @click="dismissUpdate"
          >
            {{ t('settings.updateLater') }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
