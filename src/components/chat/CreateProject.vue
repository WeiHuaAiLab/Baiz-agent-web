<script setup lang="ts">
// 新建项目弹窗：按图示 modal-mask + modal-card 形式，标题+关闭按钮、两个带必填星号的字段、取消/保存。
// 由 App.vue 全局挂载（受 ui.createMode === 'project' 控制），覆盖任意路由下方的内容，
// 避免切换聊天区造成「新开页面」的视觉跳变。
// 创建成功保持原回归语义：来自 CreateChat / ChatInput 时回跳原视图（并自动选中新项目），否则直接关闭。
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import { useSettingsStore } from '../../stores/settings'
import { useFilesStore } from '../../stores/files'
import { useUiStore } from '../../stores/ui'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const settings = useSettingsStore()
const files = useFilesStore()
const ui = useUiStore()

const name = ref('')
/** 项目路径：默认空，显示「选择项目路径」占位，由用户点击路径框主动选择；
 *  若跳过选择直接点「创建」，则在创建时兜底弹系统目录选择框完成授权。
 *  选中的目录直接作为项目路径，不预填工作区，也不在其下创建同名子文件夹。 */
const parentPath = ref('')

/** 表单可提交：名称非空即可（路径可在提交时兜底授权选择） */
const canSubmit = computed(() => !!name.value.trim())

/** Esc 关闭弹窗：组件级监听，关闭后释放 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') cancel()
}
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/** 触发 OS 目录选择：选完即填入路径（选择时完成授权登记）；
 *  选中的目录直接作为项目路径，创建时不再建同名子文件夹。 */
async function pickParent() {
  const picked = await files.authorizeDir()
  if (picked) {
    parentPath.value = picked.path
    ui.toast(`${t('tasks.parentPicked')} ${picked.path}`, 'info')
  }
}

/** 创建完成：若来自其它流程（CreateChat / ChatInput），按 createReturn 回跳原视图
 *  并自动选中新项目；否则直接关闭（与原 CreateProject 等价）。 */
function finish() {
  if (ui.createReturn) {
    ui.pendingProjectId = workspace.projects[0]?.id ?? ''
    if (ui.createReturn.mode) {
      ui.openCreate(ui.createReturn.mode)
    } else {
      ui.backToChat()
    }
  } else {
    ui.closeCreate()
  }
}

function cancel() {
  if (ui.createReturn) {
    if (ui.createReturn.mode) ui.openCreate(ui.createReturn.mode)
    else ui.backToChat()
  } else {
    ui.closeCreate()
  }
}

/** 提交：项目路径在此时才授权选择（若尚未选择）。选中的目录直接作为项目路径，
 *  不再创建同名子文件夹；项目名称仅作为列表中的显示名。
 *  之后注册到 workspace.projects + 绑定 files.pickedDirs + 加入已授权工作区。 */
async function submit() {
  const title = name.value.trim()
  if (!title) {
    ui.toast(t('tasks.needFolderName'), 'error')
    return
  }
  let projectDir = parentPath.value
  if (!projectDir) {
    // 点击「创建」时才弹系统目录选择框完成授权，避免一进弹窗就触发授权
    const picked = await files.authorizeDir()
    if (!picked) return // 用户取消授权：放弃本次创建
    projectDir = picked.path
    parentPath.value = projectDir
  }
  const dirName = projectDir.split(/[\\/]/).pop() || title
  files.bindDir(projectDir, dirName)
  settings.addWorkspace(projectDir)
  settings.setActiveWorkspace(projectDir)
  workspace.addProject(title)
  ui.toast(`${t('chat.projectCreated')}：${title}`, 'success')
  finish()
}
</script>

<template>
  <div class="modal-mask modal-create-project" @click.self="cancel">
    <div class="modal-card modal-card-wide">
      <!-- 标题栏：左侧标题 + 右侧关闭按钮，对齐参考图样式 -->
      <header class="modal-header">
        <h3>{{ t('chat.createProjectTitle') }}</h3>
        <button
          type="button"
          class="modal-close"
          :title="t('common.close')"
          @click="cancel"
        >
          <Icon name="x" :size="14" />
        </button>
      </header>

      <label class="field-label">
        {{ t('chat.projectFieldName') }}
        <span class="required">*</span>
      </label>
      <input
        v-model="name"
        class="modal-input"
        :placeholder="t('chat.projectNamePlaceholder')"
        autofocus
        @keyup.enter="submit"
      />

      <label class="field-label">
        {{ t('chat.projectFieldPath') }}
        <span class="required">*</span>
      </label>
      <!-- 点击路径框即弹系统目录选择器；若跳过此步，点「创建」时也会兜底授权选择 -->
      <button type="button" class="path-picker" @click="pickParent">
        <Icon name="workspace" :size="14" />
        <span class="path-text" :class="{ 'is-placeholder': !parentPath }">
          {{ parentPath || t('chat.projectPathPlaceholder') }}
        </span>
      </button>

      <div class="modal-actions">
        <button type="button" class="btn-ghost" @click="cancel">
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!canSubmit"
          @click="submit"
        >
          {{ t('chat.projectCreate') }}
        </button>
      </div>
    </div>
  </div>
</template>
