<script setup lang="ts">
// 图标组件：集中维护 SVG path（默认 24×24 描边风格，支持个别实心填充/坐标系特例），按 name 渲染统一尺寸图标。
export type IconName =
  | 'chat'
  | 'workspace'
  | 'tools'
  | 'skills'
  | 'tasks'
  | 'settings'
  | 'plus'
  | 'x'
  | 'send'
  | 'copy'
  | 'refresh'
  | 'check'
  | 'user'
  | 'feedback'
  | 'info'
  | 'pen'
  | 'alarm'
  | 'extension'
  | 'chevron'
  | 'pin'
  | 'trash'
  | 'mic'
  | 'search'
  | 'stop'
  | 'download'
  | 'extesionPanel'

const props = defineProps<{ name: IconName; size?: number }>()

const paths: Record<IconName, string> = {
  chat: 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  workspace: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  tools:
    'M14.7 6.3a4.5 4.5 0 0 0-6.1 5.6L4 16.6 7.4 20l4.7-4.6a4.5 4.5 0 0 0 5.6-6.1l-2.6 2.6-2.8-.8-.8-2.8 2.6-2.6Z',
  skills: 'M12 3l1.9 4.7L18.5 9l-4.6 1.3L12 15l-1.9-4.7L5.5 9l4.6-1.3L12 3ZM5 16l1 2.5L8.5 19.5 6 20l-1 2.5L4 20l-2.5-.5L4 18.5 5 16Z',
  tasks: 'M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  send: 'M5 12h14M12 5l7 7-7 7',
  copy: 'M9 9h11v11H9zM5 15V5h10',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  check: 'M4 12l5 5L20 7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  feedback: 'M21 15a2 2 0 0 1-2 2H9l-5 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10ZM12 8v3M12 14h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5M12 16h.01',
  pen: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5ZM12 20h9',
  alarm: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12v4l3 2M5 3 2 6M19 3l3 3',
  extension: 'M10 21v-1a2 2 0 1 1 4 0v1h6v-6h-1a2 2 0 0 1 0-4h1V5h-6v1a2 2 0 1 1-4 0V5H4v6h1a2 2 0 0 1 0 4H4v6h6Z',
  chevron: 'M9 6l6 6-6 6',
  pin: 'M9 4h6l-1 4 2 3v2H8v-2l2-3-1-4ZM12 17v3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm6 9a6 6 0 0 1-12 0M12 18v3',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
  stop: 'M6 6h12v12H6z',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 21h16',
  // 源自 antd MenuUnfoldOutlined，已由 1024 坐标系换算到 24 坐标系（×24/1024）
  extesionPanel:
    'M9.56 10.36h11.25c0.1 0 0.19-0.08 0.19-0.19v-1.31c0-0.1-0.08-0.19-0.19-0.19H9.56c-0.1 0-0.19 0.08-0.19 0.19v1.31c0 0.1 0.08 0.19 0.19 0.19zm-0.19 4.78c0 0.1 0.08 0.19 0.19 0.19h11.25c0.1 0 0.19-0.08 0.19-0.19v-1.31c0-0.1-0.08-0.19-0.19-0.19H9.56c-0.1 0-0.19 0.08-0.19 0.19v1.31zm11.81-11.39H2.81c-0.1 0-0.19 0.08-0.19 0.19v1.31c0 0.1 0.08 0.19 0.19 0.19h18.38c0.1 0 0.19-0.08 0.19-0.19v-1.31c0-0.1-0.08-0.19-0.19-0.19zm0 14.81H2.81c-0.1 0-0.19 0.08-0.19 0.19v1.31c0 0.1 0.08 0.19 0.19 0.19h18.38c0.1 0 0.19-0.08 0.19-0.19v-1.31c0-0.1-0.08-0.19-0.19-0.19zM3.34 15.05L7 12.16a0.21 0.21 0 0 0 0-0.33L3.34 8.95c-0.14-0.11-0.34-0.01-0.34 0.16v5.77a0.21 0.21 0 0 0 0.34 0.16z',
}

// 特殊图标：实心填充渲染（非描边）
const fillIcons: IconName[] = ['extesionPanel']
</script>

<template>
  <svg
    :width="props.size ?? 18"
    :height="props.size ?? 18"
    viewBox="0 0 24 24"
    :fill="fillIcons.includes(props.name) ? 'currentColor' : 'none'"
    :stroke="fillIcons.includes(props.name) ? 'none' : 'currentColor'"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[props.name]" />
  </svg>
</template>
