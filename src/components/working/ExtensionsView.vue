<script setup lang="ts">
// 工作区 · 能力扩展子页：扩展插件列表（模拟 demo 数据，开关状态本地模拟）。
// 刀 D2（2026-09-29）：**技能面接线**——新增「技能」区块，数据来自 daemon
// `skills.list`（磁盘真技能目录；测试员加的技能在此现形）。拉取失败 ⇒ 空列表
// ＋可重试提示（**禁回落假清单**）；启停语义未开 ⇒ 只读展示（**禁假开关**）。
import { onMounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '../common/Icon.vue'
import type { IconName } from '../common/Icon.vue'
import { useToolStore } from '../../stores/tools'

const { t } = useI18n()
const tools = useToolStore()

interface ExtensionItem {
  id: string
  name: string
  desc: string
  author: string
  version: string
  category: string
  icon: IconName
}

// 模拟扩展市场数据（demo）
const demoExtensions: ExtensionItem[] = [
  {
    id: 'git',
    name: 'Git 集成',
    desc: '仓库状态、提交与分支管理，在会话中直接执行 Git 操作并查看变更',
    author: 'Baiz 官方',
    version: '1.2.0',
    category: '代码',
    icon: 'tools',
  },
  {
    id: 'memory',
    name: '记忆增强',
    desc: '跨会话持久记忆，自动沉淀用户偏好与项目事实，检索即用',
    author: 'Baiz 官方',
    version: '0.9.1',
    category: '智能',
    icon: 'skills',
  },
  {
    id: 'websearch',
    name: '联网搜索',
    desc: '实时检索网页信息，弥补模型知识时效性，回答更可靠',
    author: 'Baiz 官方',
    version: '1.0.0',
    category: '检索',
    icon: 'search',
  },
  {
    id: 'excel',
    name: '表格处理',
    desc: '读写 Excel / CSV，生成报表、数据透视与图表',
    author: '社区贡献',
    version: '0.5.3',
    category: '办公',
    icon: 'tasks',
  },
  {
    id: 'translate',
    name: '多语言翻译',
    desc: '高质量机器翻译与术语一致性检查，支持 30+ 语言',
    author: '社区贡献',
    version: '0.8.0',
    category: '办公',
    icon: 'feedback',
  },
  {
    id: 'voice',
    name: '语音识别',
    desc: '本地语音输入（sherpa-onnx），离线可用、隐私安全',
    author: '社区贡献',
    version: '0.3.2',
    category: '多媒体',
    icon: 'mic',
  },
]

const enabled = reactive<Record<string, boolean>>({
  git: true,
  memory: true,
  websearch: true,
  excel: false,
  translate: false,
  voice: false,
})

function toggle(id: string) {
  enabled[id] = !enabled[id]
}

/** 来源层级标签（account／global／workspace ⇒ i18n；未知源照原文展示） */
function sourceLabel(source: string): string {
  const known: Record<string, string> = {
    account: 'skills.sourceAccount',
    global: 'skills.sourceGlobal',
    workspace: 'skills.sourceWorkspace',
  }
  const key = known[source]
  return key ? t(key) : source
}

// 进入本页即拉真技能清单（失败 ⇒ 空列表＋重试；**禁回落假清单**，见 store 口径）
onMounted(() => {
  void tools.loadSkills()
})
</script>

<template>
  <div>
    <div class="settings-card">
      <h2>{{ t('working.extensions') }}</h2>
      <p class="section-desc">{{ t('working.extensionsHint') }}</p>
    </div>

    <ul class="extension-list">
      <li v-for="ext in demoExtensions" :key="ext.id" class="extension-item">
        <span class="ext-icon">
          <Icon :name="ext.icon" :size="16" />
        </span>
        <div class="ext-main">
          <div class="ext-head">
            <span class="ext-name">{{ ext.name }}</span>
            <span class="ext-category">{{ ext.category }}</span>
          </div>
          <p class="ext-desc">{{ ext.desc }}</p>
          <div class="ext-meta">{{ ext.author }} · v{{ ext.version }}</div>
        </div>
        <button type="button" class="ext-toggle" :class="{ on: enabled[ext.id] }" @click="toggle(ext.id)">
          <span class="ext-toggle-track"><span class="ext-toggle-knob" /></span>
          <span class="ext-toggle-label">{{ enabled[ext.id] ? t('common.on') : t('common.off') }}</span>
        </button>
      </li>
    </ul>

    <div class="settings-card skills-panel">
      <h2>{{ t('skills.title') }}</h2>
      <p class="section-desc">{{ t('skills.hint') }}</p>
      <p v-if="tools.skillsLoading" class="dir-empty">{{ t('skills.loading') }}</p>
      <p v-else-if="tools.skillsNotReady" class="dir-empty">{{ t('skills.notReady') }}</p>
      <p v-else-if="tools.skillsFailed" class="dir-empty">
        {{ t('skills.loadFailed') }}<template v-if="tools.error">：{{ tools.error }}</template>
        <button type="button" class="btn-ghost" @click="tools.loadSkills()">
          {{ t('skills.retry') }}
        </button>
      </p>
      <ul v-else-if="tools.skills.length" class="skill-list">
        <li v-for="skill in tools.skills" :key="skill.name" class="skill-item">
          <div class="ext-main">
            <div class="ext-head">
              <span class="ext-name">{{ skill.name }}</span>
              <span v-if="skill.source" class="ext-category">{{ sourceLabel(skill.source) }}</span>
            </div>
            <p class="ext-desc">{{ skill.description || t('skills.noDescription') }}</p>
            <div v-if="skill.path" class="ext-meta" :title="skill.path">{{ skill.path }}</div>
          </div>
        </li>
      </ul>
      <p v-else class="dir-empty">{{ t('skills.empty') }}</p>
    </div>
  </div>
</template>
