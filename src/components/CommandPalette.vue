<script setup lang="ts">
// 命令面板（VS Code Ctrl+K 风格）：全局命令搜索浮层，任意页面可按快捷键或 ui.openPalette() 唤出，
// 输入文字过滤并执行命令（新建会话/任务/定时任务、导出 md/json、切换主题、跳设置页、切换会话等）。
// 显隐由 ui store 的 paletteOpen 控制，Esc 或点击遮罩关闭；挂在 App.vue 最外层、路由之外。
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMessageStore } from '../stores/message'
import { useSessionStore } from '../stores/session'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { downloadText, exportConversation } from '../utils/export'

interface Command {
  id: string
  label: string
  hint?: string
  run(): void
}

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const workspace = useWorkspaceStore()
const settings = useSettingsStore()
const ui = useUiStore()
const messages = useMessageStore()

const query = ref('')
const active = ref(0)

function exportCurrent(format: 'md' | 'json') {
  const conversation = session.active
  if (!conversation) return
  const { filename, content } = exportConversation(
    conversation,
    messages.list(conversation.id),
    format,
  )
  downloadText(filename, content)
}

function baseCommands(): Command[] {
  return [
    { id: 'new-session', label: t('palette.newSession'), run: () => ui.openCreate('session') },
    { id: 'new-task', label: t('palette.newTask'), run: () => router.push('/working/tasks') },
    {
      id: 'new-scheduled',
      label: t('palette.newScheduled'),
      run: () => router.push('/working/scheduled'),
    },
    { id: 'export-md', label: t('palette.exportMd'), run: () => exportCurrent('md') },
    { id: 'export-json', label: t('palette.exportJson'), run: () => exportCurrent('json') },
    {
      id: 'theme-light',
      label: t('palette.themeLight'),
      run: () => settings.setTheme('light'),
    },
    {
      id: 'theme-dark',
      label: t('palette.themeDark'),
      run: () => settings.setTheme('dark'),
    },
    { id: 'settings', label: t('palette.settings'), run: () => router.push('/settings') },
  ]
}

const commands = computed<Command[]>(() => {
  const q = query.value.trim().toLowerCase()
  const all: Command[] = [
    ...baseCommands(),
    ...session.conversations.map((conversation) => ({
      id: `session-${conversation.id}`,
      label: conversation.title,
      hint: t('palette.session'),
      run: () => session.select(conversation.id),
    })),
  ]
  if (!q) return all
  return all.filter(
    (command) =>
      command.label.toLowerCase().includes(q) || (command.hint ?? '').toLowerCase().includes(q),
  )
})

watch(commands, () => {
  active.value = 0
})

function run(command: Command) {
  command.run()
  ui.closePalette()
  query.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % commands.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + commands.value.length) % commands.value.length
  } else if (event.key === 'Enter') {
    const command = commands.value[active.value]
    if (command) run(command)
  }
}
</script>

<template>
  <div v-if="ui.paletteOpen" class="palette-mask" @click.self="ui.closePalette()">
    <div class="palette">
      <input
        v-model="query"
        :placeholder="t('palette.placeholder')"
        autofocus
        @keydown="onKeydown"
      />
      <div class="palette-list">
        <button
          v-for="(command, index) in commands"
          :key="command.id"
          type="button"
          :class="{ active: index === active }"
          @click="run(command)"
          @mouseenter="active = index"
        >
          <span class="pl-label">{{ command.label }}</span>
          <span v-if="command.hint" class="pl-hint">{{ command.hint }}</span>
        </button>
        <p v-if="commands.length === 0" class="pl-empty">{{ t('palette.empty') }}</p>
      </div>
    </div>
  </div>
</template>
