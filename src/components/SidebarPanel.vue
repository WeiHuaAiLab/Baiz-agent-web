<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { useSettingsStore } from '../stores/settings'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import Icon from './common/Icon.vue'
import TaskForm from './common/TaskForm.vue'
import type { Conversation } from '../models'
import { createEmptyTaskDraft } from '../stores/workspace'
import type { TaskDraft, TaskItem } from '../stores/workspace'
import { formatRelativeTime } from '../utils/time'
import { formatNextRun, nextRunAt } from '../utils/tasks'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const settings = useSettingsStore()
const workspace = useWorkspaceStore()
const ui = useUiStore()

const showAbout = ref(false)
const showFeedback = ref(false)
const feedbackText = ref('')
const feedbackSent = ref(false)
const activeSection = ref<'chat' | 'work'>('chat')
const recentOpen = ref(true)
const menuFor = ref('')
const searchOpen = ref(false)
const searchQuery = ref('')
const taskConfig = ref<TaskItem | null>(null)
const editDraft = ref<TaskDraft>(createEmptyTaskDraft())
const editingId = ref('')
const editingTitle = ref('')

const filteredSessions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return session.conversations
  return session.conversations.filter((item) => item.title.toLowerCase().includes(query))
})

function newSession() {
  ui.openCreate('session')
}

async function removeSession(id: string) {
  await session.remove(id)
}

function openSessionMenu(id: string) {
  menuFor.value = menuFor.value === id ? '' : id
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) {
    recentOpen.value = true
  } else {
    searchQuery.value = ''
  }
}

function startRename(item: Conversation) {
  // 内联编辑（不用 window.prompt——规范 §4.1）
  editingId.value = item.id
  editingTitle.value = item.title
  menuFor.value = ''
}

async function commitRename() {
  const id = editingId.value
  const title = editingTitle.value.trim()
  editingId.value = ''
  editingTitle.value = ''
  if (id && title) await session.rename(id, title)
}

function togglePin(item: Conversation) {
  void session.togglePin(item.id)
  menuFor.value = ''
}

function removeFromMenu(id: string) {
  void session.remove(id)
  menuFor.value = ''
}

function openTaskConfig(task: TaskItem) {
  taskConfig.value = task
  editDraft.value = {
    ...task.schedule,
    title: task.title,
    instruction: task.instruction,
  }
}

function saveTaskConfig() {
  if (!taskConfig.value) return
  workspace.updateTask(taskConfig.value.id, editDraft.value)
  taskConfig.value = null
}

function scheduleText(task: TaskItem): string {
  const schedule = task.schedule
  if (!schedule) return t('tasks.notConfigured')
  const mode = schedule.mode === 'cloud' ? t('tasks.modeCloud') : t('tasks.modeLocal')
  let base: string
  if (schedule.cycle === 'monthly') {
    base = `${t('tasks.cycleMonthly')} ${schedule.day} 日 ${schedule.time} · ${mode}`
  } else if (schedule.cycle === 'weekly') {
    base = `${t('tasks.cycleWeekly')} ${t(`tasks.weekday.${schedule.weekday}`)} ${schedule.time} · ${mode}`
  } else if (schedule.cycle === 'daily') {
    base = `${t('tasks.cycleDaily')} ${schedule.time} · ${mode}`
  } else if (schedule.cycle === 'hourly') {
    base = `${t('tasks.cycleHourly')} · ${mode}`
  } else {
    const unit =
      schedule.unit === 'minute'
        ? t('tasks.unitMinute')
        : schedule.unit === 'hour'
          ? t('tasks.unitHour')
          : t('tasks.unitDay')
    base = `${t('tasks.cycleInterval')} ${schedule.every} ${unit} · ${mode}`
  }
  const next = nextRunAt(schedule)
  return next ? `${base} · ${t('tasks.next')} ${formatNextRun(next)}` : base
}

function newProject() {
  const title = window.prompt(t('sidebar.newProject'), t('sidebar.projectDefault'))
  if (title) workspace.addProject(title)
}

function newTask() {
  ui.openCreate('task')
}

function goSettings() {
  void router.push('/settings')
}

function openFeedback() {
  showFeedback.value = true
  feedbackSent.value = false
  feedbackText.value = ''
}

function sendFeedback() {
  feedbackSent.value = true
  setTimeout(() => {
    showFeedback.value = false
  }, 1200)
}
</script>

<template>
  <aside class="side-panel">
    <div class="brand">
      <span class="brand-name">Baiz Agent</span>
    </div>

    <nav class="side-tabs">
      <button
        type="button"
        :class="{ active: activeSection === 'chat' }"
        @click="activeSection = 'chat'"
      >
        <Icon name="chat" :size="15" />
        <span>{{ t('nav.chat') }}</span>
      </button>
      <button
        type="button"
        :class="{ active: activeSection === 'work' }"
        @click="activeSection = 'work'"
      >
        <Icon name="workspace" :size="15" />
        <span>{{ t('nav.workspace') }}</span>
      </button>
    </nav>

    <div class="side-scroll">
      <section v-if="activeSection === 'chat'" class="side-section">
        <button type="button" class="menu-item" @click="newSession">
          <Icon name="chat" :size="15" />
          <span>{{ t('chat.newSession') }}</span>
        </button>

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

        <div class="section-block">
          <div class="section-head clickable" @click="recentOpen = !recentOpen">
            <span>{{ t('sidebar.recent') }}</span>
            <span class="head-icons">
              <button
                type="button"
                class="mini-add"
                :title="t('sidebar.searchSessions')"
                @click.stop="toggleSearch"
              >
                <Icon name="search" :size="13" />
              </button>
              <Icon name="chevron" :size="14" :class="{ open: recentOpen }" />
            </span>
          </div>
          <input
            v-if="searchOpen"
            v-model="searchQuery"
            class="session-search"
            :placeholder="t('sidebar.searchPlaceholder')"
          />
          <ul v-if="recentOpen || searchOpen" class="session-list">
            <li
              v-for="item in filteredSessions"
              :key="item.id"
              :class="{ active: item.id === session.activeId, pinned: !!item.pinnedAt }"
            >
              <input
                v-if="editingId === item.id"
                v-model="editingTitle"
                class="session-rename-input"
                :placeholder="item.title"
                @keyup.enter="commitRename"
                @keyup.esc="editingId = ''"
                @blur="commitRename"
              />
              <span
                v-else
                class="session-title"
                :title="item.title"
                @click="session.select(item.id)"
              >
                {{ item.title }}
              </span>
              <span class="session-time">{{ formatRelativeTime(item.updatedAt) }}</span>
              <Icon v-if="item.pinnedAt" name="pin" :size="12" class="pin-badge" />
              <button
                type="button"
                class="session-more"
                :title="t('chat.sessionMenu')"
                @click="openSessionMenu(item.id)"
              >
                ⋯
              </button>
              <div v-if="menuFor === item.id" class="session-menu" @click.stop>
                <button type="button" @click="startRename(item)">
                  <Icon name="pen" :size="14" />
                  <span>{{ t('chat.renameTitle') }}</span>
                </button>
                <button type="button" @click="togglePin(item)">
                  <Icon name="pin" :size="14" />
                  <span>{{ item.pinnedAt ? t('chat.unpin') : t('chat.pin') }}</span>
                </button>
                <button type="button" class="danger" @click="removeFromMenu(item.id)">
                  <Icon name="trash" :size="14" />
                  <span>{{ t('common.delete') }}</span>
                </button>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section v-else class="side-section">
        <button type="button" class="menu-item" @click="newTask">
          <Icon name="pen" :size="15" />
          <span>{{ t('sidebar.newTask') }}</span>
        </button>

        <button
          type="button"
          class="menu-item"
          :title="t('tasks.addScheduled')"
          @click="ui.openCreate('scheduled')"
        >
          <Icon name="alarm" :size="15" />
          <span>{{ t('sidebar.scheduledTasks') }}</span>
        </button>
        <ul v-if="workspace.tasks.length" class="project-list task-list-slim">
          <li v-for="task in workspace.tasks" :key="task.id">
            <Icon name="tasks" :size="13" />
            <span class="project-title">{{ task.title }}</span>
            <span class="task-when">{{ scheduleText(task) }}</span>
            <button
              type="button"
              class="task-config-btn"
              :title="t('tasks.scheduleTitle')"
              @click="openTaskConfig(task)"
            >
              <Icon name="settings" :size="13" />
            </button>
          </li>
        </ul>
        <p v-else class="placeholder">{{ t('sidebar.noTasks') }}</p>

        <div class="section-block">
          <div class="menu-item static">
            <Icon name="extension" :size="15" />
            <span>{{ t('sidebar.extensions') }}</span>
          </div>
          <p class="placeholder">{{ t('sidebar.noExtensions') }}</p>
        </div>
      </section>
    </div>

    <div class="user-area">
      <span class="avatar"><Icon name="user" :size="16" /></span>
      <span class="username">{{ settings.username }}</span>
      <div class="user-pop">
        <button type="button" @click="goSettings">
          <Icon name="settings" :size="14" />
          <span>{{ t('nav.settings') }}</span>
        </button>
        <button type="button" @click="openFeedback">
          <Icon name="feedback" :size="14" />
          <span>{{ t('sidebar.feedback') }}</span>
        </button>
        <button type="button" @click="showAbout = true">
          <Icon name="info" :size="14" />
          <span>{{ t('sidebar.about') }}</span>
        </button>
      </div>
    </div>

    <div v-if="menuFor" class="menu-mask" @click="menuFor = ''" />

    <div v-if="showAbout" class="modal-mask" @click.self="showAbout = false">
      <div class="modal-card">
        <h3>{{ t('sidebar.aboutTitle') }}</h3>
        <p class="modal-slogan">{{ t('sidebar.aboutSlogan') }}</p>
        <p class="modal-version">{{ t('sidebar.aboutVersion') }} 0.1.0</p>
        <button type="button" class="btn-primary" @click="showAbout = false">
          {{ t('sidebar.aboutClose') }}
        </button>
      </div>
    </div>

    <div v-if="showFeedback" class="modal-mask" @click.self="showFeedback = false">
      <div class="modal-card">
        <h3>{{ t('sidebar.feedbackTitle') }}</h3>
        <p v-if="feedbackSent" class="feedback-sent">{{ t('sidebar.feedbackSent') }}</p>
        <textarea
          v-else
          v-model="feedbackText"
          class="feedback-input"
          :placeholder="t('sidebar.feedbackPlaceholder')"
          rows="4"
        />
        <div v-if="!feedbackSent" class="modal-actions">
          <button type="button" class="btn-ghost" @click="showFeedback = false">
            {{ t('common.back') }}
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="!feedbackText.trim()"
            @click="sendFeedback"
          >
            {{ t('sidebar.feedbackSend') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="taskConfig" class="modal-mask" @click.self="taskConfig = null">
        <div class="modal-card">
        <h3>{{ t('tasks.scheduleTitle') }}</h3>
        <p class="modal-slogan">{{ taskConfig.title }}</p>
        <TaskForm v-model="editDraft" />
        <div class="modal-actions">
          <button type="button" class="btn-ghost" @click="taskConfig = null">
            {{ t('common.cancel') }}
          </button>
          <button type="button" class="btn-primary" @click="saveTaskConfig">
            {{ t('tasks.scheduleSave') }}
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
