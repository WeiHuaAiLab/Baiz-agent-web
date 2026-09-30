<script setup lang="ts">
// **T11／DEBT-872（R2 波一）**：附件行——**ChatInput 与 ComposerBox 共用同一实现**。
//
// 为什么抽件而非各处补丁：①改前两处附件行是**逐行重复的同一段模板**，只补一处必留一处漏；
// ②`ChatInput.vue` 已 586 行，紧贴 `scripts/loc-scan.mjs:TIER_LINE=600` 的黄档红线，
// 就地增写会顶穿行数闸（基线外生产件 ≥600 即红）。
//
// 本件承担 DEBT-872 的三条目标：
//   ① **明确提示**：单件上限（8 MiB，源自 `bridge/web.ts:95` 的壳 `MAX_ATTACH_BYTES`）
//      ＋ 当前体积 ＋ 「可发送／不可发送」；
//   ② **进行态**：读取期间显「正在读取附件… N/M」——改前拖入 8M 件界面**全无动静**；
//   ③ **超限人话**：超限 chip 直接写明"超限·不可发送（上限 8.0 MB）"，
//      且该件**不读内容、不占内存、发不出去**（store 侧闸见 `stores/files.ts`）。
import { useI18n } from 'vue-i18n'
import { useFilesStore } from '../../stores/files'
import { formatFileSize, shortMime } from '../../utils/format'
import { attachmentLimitText } from '../../utils/attachment'
import Icon from '../common/Icon.vue'

const { t } = useI18n()
const files = useFilesStore()
</script>

<template>
    <div
        v-if="files.attachments.length || files.attachProcessing"
        class="attachment-block"
    >
        <div class="attachment-row">
            <!-- 目②：进行态——计数在 store 进读取循环**之前**就已置位（见 files.ts），
                 故大件读取中此条必现，界面不静止 -->
            <div
                v-if="files.attachProcessing"
                class="attachment-chip is-processing"
                data-att-processing="1"
                role="status"
            >
                <span class="att-tag">{{
                    t('chat.attProcessing', {
                        done: files.attachReading,
                        total: files.attachReadingTotal,
                    })
                }}</span>
            </div>

            <div
                v-for="att in files.attachments"
                :key="att.id"
                class="attachment-chip"
                :class="{
                    'is-image': att.kind === 'image',
                    'is-file': att.kind === 'file',
                    'is-over': att.overLimit === true,
                }"
                :data-att-over="att.overLimit === true ? '1' : '0'"
            >
                <img
                    v-if="att.kind === 'image' && att.dataUrl"
                    class="att-thumb"
                    :src="att.dataUrl"
                    :alt="att.name"
                    :title="att.name"
                />
                <div v-else class="att-meta">
                    <div class="att-name" :title="att.name">
                        {{ att.name }}
                    </div>
                    <div class="att-tag">
                        {{ shortMime(att.mimeType) }} ·
                        {{ formatFileSize(att.size) }}
                    </div>
                    <!-- 目③：超限人话**落在该件上**——多件并列时一眼看出是哪一件 -->
                    <div v-if="att.overLimit" class="att-over-hint">
                        {{
                            t('chat.attOverHint', {
                                limit: attachmentLimitText(),
                            })
                        }}
                    </div>
                </div>
                <button
                    type="button"
                    class="att-remove"
                    :title="t('common.delete')"
                    @click="files.removeAttachment(att.id)"
                >
                    <Icon name="x" :size="12" />
                </button>
            </div>
        </div>

        <!-- 目①：上限／当前体积／可否发送——三条一处说清 -->
        <p
            class="attachment-limit"
            :class="{ over: !files.attachmentsSendable }"
            :data-sendable="files.attachmentsSendable ? '1' : '0'"
            role="status"
        >
            <span>{{
                t('chat.attLimit', {
                    total: formatFileSize(files.attachmentsTotalBytes),
                    limit: attachmentLimitText(),
                })
            }}</span>
            <span class="att-verdict">{{
                files.attachmentsSendable
                    ? t('chat.attSendable')
                    : t('chat.attNotSendable')
            }}</span>
        </p>
    </div>
</template>

<style scoped>
/* 只加**新**元素样式；`.attachment-row`／`.attachment-chip`／`.att-*` 的既有样式
   仍在全局 `src/styles/chat.css`（勿在此重写，免得两处口径漂移）。 */
.attachment-limit {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 6px 16px 0;
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.4;
}

/* 不可发送＝须与"可发送"**一眼可辨**（照 KbCard 三态分色例） */
.attachment-limit.over {
    color: var(--danger);
}

.att-verdict {
    font-weight: 500;
}

.attachment-chip.is-over {
    border-color: var(--danger);
}

/* 超限人话：chip 内第三行（.att-meta 是 flex column，自动续行） */
.att-over-hint {
    max-width: 180px;
    color: var(--danger);
    font-size: 11px;
    line-height: 1.3;
}

.attachment-chip.is-processing .att-tag {
    padding: 0 12px;
}
</style>
