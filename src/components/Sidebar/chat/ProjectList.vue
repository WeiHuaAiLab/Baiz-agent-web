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

/** 新增项目：若当前不在 / 聊天路由（如设置页），先跳回 / 再打开创建项目表单 */
function newProject() {
  if (router.currentRoute.value.path !== '/') {
    void router.push('/')
  }
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
      </li>
    </ul>
    <p v-else class="placeholder">{{ t('sidebar.noProjects') }}</p>
  </div>
</template>
