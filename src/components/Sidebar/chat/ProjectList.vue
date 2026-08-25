<script setup lang="ts">
// 项目列表：展示 workspace.projects，支持新增项目。
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../../stores/workspace'
import Icon from '../../common/Icon.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()

function newProject() {
  const title = window.prompt(t('sidebar.newProject'), t('sidebar.projectDefault'))
  if (title) workspace.addProject(title)
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
      <li v-for="project in workspace.projects" :key="project.id">
        <Icon name="workspace" :size="13" />
        <span class="project-title">{{ project.title }}</span>
      </li>
    </ul>
    <p v-else class="placeholder">{{ t('sidebar.noProjects') }}</p>
  </div>
</template>
