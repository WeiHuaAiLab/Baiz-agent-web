<script setup lang="ts">
// 项目列表：展示 workspace.projects，支持新增项目（聊天区 CreateProject 表单）；点击项目跳回聊天页。
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useUiStore } from '../../../stores/ui'
import Icon from '../../common/Icon.vue'

const { t } = useI18n()
const router = useRouter()
const workspace = useWorkspaceStore()
const ui = useUiStore()

/** 新增项目：若当前不在 / 聊天路由（如设置页），先跳回 / 再打开创建项目弹窗 */
function newProject() {
  if (router.currentRoute.value.path !== '/') {
    void router.push('/')
  }
  // 侧栏入口没有回归上下文：清掉可能残留的 createReturn（残留来自 CreateChat
  // 「新建项目」的取消/完成路径），避免保存后误回跳到新建会话页而非聊天视图
  ui.createReturn = null
  ui.openCreate('project')
}

/** 点击项目：跳回聊天路由并打开「新建会话」，新会话默认关联该项目（CreateChat 消费 pendingProjectId 自动选中） */
function selectProject(id: string) {
  if (router.currentRoute.value.path !== '/') {
    void router.push('/')
  }
  ui.pendingProjectId = id
  ui.openCreate('session')
}

/** **MSG-3528**：项目**改名**（提示输入·空名拒——不静默改） */
function renameCurrent(project: { id: string; title: string }) {
  const next = window.prompt(t('sidebar.projectRenamePrompt'), project.title)
  if (next === null) return
  if (!workspace.renameProject(project.id, next)) {
    ui.toast(t('sidebar.projectTitleRequired'), 'error')
  }
}

/** **MSG-3528**：项目**删除**（**须确认**——带项目名；只删项目行·其下任务保留并解除关联） */
function removeCurrent(project: { id: string; title: string }) {
  if (!window.confirm(t('sidebar.projectRemoveConfirm', { name: project.title }))) return
  workspace.removeProject(project.id)
}
</script>

<template>
  <div class="section-block">
    <div class="section-head">
      <span>{{ t('sidebar.projects') }}</span>
      <button
        type="button"
        class="mini-add"
        :title="t('sidebar.newProject')"
        @click="newProject"
      >
        <Icon name="plus" :size="13" />
      </button>
    </div>
    <ul v-if="workspace.projects.length" class="project-list">
      <li v-for="project in workspace.projects" :key="project.id" @click="selectProject(project.id)">
        <Icon name="workspace" :size="13" />
        <span class="project-title">{{ project.title }}</span>
        <!-- **MSG-3528**：用户自建项**可改可删**（改名＝提示输入；删除＝确认后删） -->
        <button
          type="button"
          class="project-op"
          :title="t('sidebar.projectRename')"
          @click.stop="renameCurrent(project)"
        >
          <Icon name="pen" :size="12" />
        </button>
        <button
          type="button"
          class="project-op"
          :title="t('sidebar.projectRemove')"
          @click.stop="removeCurrent(project)"
        >
          <Icon name="trash" :size="12" />
        </button>
      </li>
    </ul>
    <p v-else class="placeholder">{{ t('sidebar.noProjects') }}</p>
  </div>
</template>
