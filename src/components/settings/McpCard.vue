<script setup lang="ts">
// MCP 服务配置管理：列表展示已添加的 MCP，支持添加/编辑（弹窗）/删除/启停。
// 数据持久化到 localStorage（key: baiz.mcp.servers），保存后由 daemon 在下一次运行时加载。
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  useMcpStore,
  type McpServer,
  type McpDraft,
  type McpCapability,
  type McpRiskLevel,
} from '../../stores/mcp'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const mcp = useMcpStore()

type EditMode = 'closed' | 'add' | 'edit'

const draft = ref<McpDraft | null>(null)
const mode = ref<EditMode>('closed')

const CAP_KEYS: McpCapability[] = ['tools', 'prompts', 'resources', 'sampling']
const RISK_KEYS: McpRiskLevel[] = ['low', 'medium', 'high']
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2024-11-05']

const canSave = computed(
  () => !!draft.value && !!draft.value.name.trim() && !!draft.value.command.trim(),
)

function capTag(cap: McpCapability): string {
  if (cap === 'tools') return t('settings.mcp.capTag.core')
  if (cap === 'sampling') return t('settings.mcp.capTag.deny')
  return t('settings.mcp.capTag.opt')
}

function startAdd() {
  draft.value = mcp.makeDraft()
  mode.value = 'add'
}

function startEdit(s: McpServer) {
  draft.value = mcp.cloneForEdit(s)
  mode.value = 'edit'
}

function cancel() {
  draft.value = null
  mode.value = 'closed'
}

function save() {
  if (!draft.value || !canSave.value) return
  if (mode.value === 'edit' && draft.value.id) {
    mcp.updateServer(draft.value.id, draft.value)
  } else {
    mcp.addServer(draft.value)
  }
  cancel()
}

function remove(s: McpServer) {
  if (!window.confirm(t('settings.mcp.removeConfirm'))) return
  if (mode.value === 'edit' && draft.value?.id === s.id) cancel()
  mcp.removeServer(s.id)
}

function toggleCap(cap: McpCapability) {
  if (!draft.value) return
  const has = draft.value.capabilities.includes(cap)
  draft.value.capabilities = has
    ? draft.value.capabilities.filter((c) => c !== cap)
    : [...draft.value.capabilities, cap]
}

// Esc 关闭弹窗
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && mode.value !== 'closed') cancel()
}
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="settings-card">
    <div class="mcp-header">
      <div class="mcp-head-text">
        <h2>{{ t('settings.mcp.title') }}</h2>
        <p class="section-desc">{{ t('settings.mcp.hint') }}</p>
      </div>
      <button
        v-if="mode === 'closed'"
        type="button"
        class="btn-ghost"
        @click="startAdd"
      >
        <Icon name="plus" :size="13" />
        {{ t('settings.mcp.add') }}
      </button>
    </div>

    <!-- 已添加的 MCP 列表 -->
    <ul v-if="mcp.servers.length" class="mcp-list">
      <li v-for="item in mcp.servers" :key="item.id">
        <div class="mcp-item-main">
          <div class="mcp-item-head">
            <span class="mcp-name">{{ item.name }}</span>
            <span class="mcp-tag">
              {{ t(`settings.mcp.transport.${item.transport}`) }}
            </span>
            <span class="mcp-tag" :class="`risk-${item.riskLevel}`">
              {{ t(`settings.mcp.risk.${item.riskLevel}`) }}
            </span>
          </div>
          <span class="mcp-desc">
            {{ item.description || item.command }}
          </span>
        </div>
        <div class="mcp-item-actions">
          <div class="seg seg-sm">
            <button
              type="button"
              :class="{ active: item.enabled }"
              @click="mcp.setEnabled(item.id, true)"
            >
              {{ t('common.on') }}
            </button>
            <button
              type="button"
              :class="{ active: !item.enabled }"
              @click="mcp.setEnabled(item.id, false)"
            >
              {{ t('common.off') }}
            </button>
          </div>
          <button
            type="button"
            class="mcp-icon-btn"
            :title="t('settings.mcp.editTitle')"
            @click="startEdit(item)"
          >
            <Icon name="pen" :size="13" />
          </button>
          <button
            type="button"
            class="mcp-icon-btn danger"
            :title="t('common.delete')"
            @click="remove(item)"
          >
            <Icon name="trash" :size="13" />
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="dir-empty">{{ t('settings.mcp.empty') }}</p>
  </div>

  <!-- MCP 添加/编辑弹窗 -->
  <Teleport to="body">
    <div
      v-if="draft"
      class="modal-mask modal-create-mcp"
      @click.self="cancel"
    >
      <div class="modal-card modal-card-mcp" role="dialog" aria-modal="true">
        <header class="modal-header">
          <h3>
            {{
              mode === 'add'
                ? t('settings.mcp.addTitle')
                : t('settings.mcp.editTitle')
            }}
            <span v-if="draft.name" class="mcp-editor-name">
              · {{ draft.name }}
            </span>
          </h3>
          <button
            type="button"
            class="modal-close"
            :title="t('common.close')"
            @click="cancel"
          >
            <Icon name="x" :size="14" />
          </button>
        </header>

        <div class="mcp-field">
          <span class="row-label">{{ t('settings.mcp.field.name') }}</span>
          <input
            v-model="draft.name"
            type="text"
            :placeholder="t('settings.mcp.field.namePh')"
            autofocus
          />
        </div>

        <div class="mcp-field">
          <span class="row-label">{{ t('settings.mcp.field.transport') }}</span>
          <select v-model="draft.transport">
            <option value="stdio">
              {{ t('settings.mcp.transport.stdio') }}
            </option>
            <option value="http">
              {{ t('settings.mcp.transport.http') }}
            </option>
          </select>
        </div>

        <div class="mcp-field">
          <span class="row-label">{{ t('settings.mcp.field.protocol') }}</span>
          <select v-model="draft.protocolVersion">
            <option v-for="v in PROTOCOL_VERSIONS" :key="v" :value="v">
              {{ v }}
            </option>
          </select>
        </div>

        <div class="mcp-field">
          <span class="row-label">{{ t('settings.mcp.field.command') }}</span>
          <input
            v-model="draft.command"
            type="text"
            :placeholder="t('settings.mcp.field.commandPh')"
          />
        </div>

        <div class="mcp-field">
          <span class="row-label">{{ t('settings.mcp.field.risk') }}</span>
          <div class="seg-risk">
            <button
              v-for="r in RISK_KEYS"
              :key="r"
              type="button"
              :class="[`risk-${r}`, { active: draft.riskLevel === r }]"
              @click="draft.riskLevel = r"
            >
              {{ t(`settings.mcp.risk.${r}`) }}
            </button>
          </div>
        </div>

        <div class="mcp-field">
          <span class="row-label">{{ t('settings.mcp.field.capabilities') }}</span>
          <div class="chip-row">
            <button
              v-for="cap in CAP_KEYS"
              :key="cap"
              type="button"
              class="chip"
              :class="{
                active: draft.capabilities.includes(cap),
                deny: cap === 'sampling',
              }"
              @click="toggleCap(cap)"
            >
              <span class="chip-label">{{ t(`settings.mcp.cap.${cap}`) }}</span>
              <span class="chip-tag">{{ capTag(cap) }}</span>
            </button>
          </div>
        </div>

        <div class="mcp-field">
          <span class="row-label">{{ t('settings.mcp.field.desc') }}</span>
          <input
            v-model="draft.description"
            type="text"
            :placeholder="t('settings.mcp.field.descPh')"
          />
        </div>

        <div class="mcp-field">
          <span class="row-label">{{ t('settings.mcp.field.enabled') }}</span>
          <div class="seg seg-sm">
            <button
              type="button"
              :class="{ active: draft.enabled }"
              @click="draft.enabled = true"
            >
              {{ t('common.on') }}
            </button>
            <button
              type="button"
              :class="{ active: !draft.enabled }"
              @click="draft.enabled = false"
            >
              {{ t('common.off') }}
            </button>
          </div>
        </div>

        <div class="mcp-field">
          <span class="row-label">{{ t('settings.mcp.field.verify') }}</span>
          <div class="mcp-verify-row">
            <button
              type="button"
              class="btn-ghost"
              :title="t('settings.mcp.comingSoon')"
              disabled
            >
              {{ t('settings.mcp.verify.test') }}
            </button>
            <button
              type="button"
              class="btn-ghost"
              :title="t('settings.mcp.comingSoon')"
              disabled
            >
              {{ t('settings.mcp.verify.list') }}
            </button>
          </div>
        </div>

        <div class="modal-actions mcp-modal-actions">
          <span class="mcp-editor-hint">
            {{ t('settings.mcp.applyOnNextRun') }}
          </span>
          <div class="mcp-modal-btns">
            <button type="button" class="btn-ghost" @click="cancel">
              {{ t('common.cancel') }}
            </button>
            <button
              type="button"
              class="btn-primary"
              :disabled="!canSave"
              @click="save"
            >
              {{ t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
