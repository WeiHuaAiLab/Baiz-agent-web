<script setup lang="ts">
// 聊天主视图（页面组装层）：创建会话（CreateChat）/ 创建项目（CreateProject）/ 会话展示（头部 / 内容体 / 输入区）三套布局 + 右侧扩展面板（抽屉）。
// 页面级快捷键（Ctrl+K 命令面板、Ctrl+N 新建会话、Esc 关闭创建流程）在此统一处理。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import CreateChat from './chat/CreateChat.vue'
import ChatHeader from './chat/ChatHeader.vue'
import ChatContent from './chat/ChatContent.vue'
import ChatInput from './chat/ChatInput.vue'
import OverlayScrollArea from './common/OverlayScrollArea.vue'
import Icon from './common/Icon.vue'
import ExtensionPanel, {
    type ExtensionPanelType,
} from './ExtensionPanels/ExtensionPanel.vue'

const { t } = useI18n()
const session = useSessionStore()
const ui = useUiStore()

// 扩展面板（抽屉）配置：默认打开，内容为 FilesPanel；类型可在 ExtensionPanelType 中扩展
const extensionOpen = computed({
  get: () => ui.extensionOpen,
  set: (value: boolean) => ui.setExtensionOpen(value),
})
const extensionType = ref<ExtensionPanelType>('files')
const contentRef = ref<InstanceType<typeof ChatContent>>()

// 创建模式（新会话/普通任务）：chat-main 只显示居中的创建引导，隐藏会话展示
// 注：「新建项目」(createMode === 'project') 升级为全局弹窗（App.vue 挂载），
// 此处不再分支，避免整页切换造成视觉跳变。
const isCreating = computed(() => ui.createMode === 'session' || ui.createMode === 'task')
// 无选中会话（删光会话 / 首次进入 / 创建流程结束后 activeId 为空）时同样显示
// 「新建会话」引导页，而不是落到没有消息的空聊天区——符合
// 「没有会话列表时默认打开新建会话」的预期。
const showCreateGuide = computed(() => isCreating.value || !session.activeId)

function onKeydown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'k') {
        event.preventDefault();
        if (ui.paletteOpen) ui.closePalette();
        else ui.openPalette();
    } else if ((event.ctrlKey || event.metaKey) && key === 'n') {
        event.preventDefault();
        ui.openCreate('session');
    } else if (event.key === 'Escape' && ui.createMode) {
        ui.closeCreate();
    }
}

function onSubmitted() {
    contentRef.value?.scrollToBottom();
}

onMounted(() => {
    window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
    <section class="chat-view">
        <div class="chat-main">
            <CreateChat v-if="showCreateGuide" />
            <template v-else>
                <ChatHeader />
                <OverlayScrollArea class="chat-body">
                    <ChatContent ref="contentRef" />
                </OverlayScrollArea>
                <ChatInput @submitted="onSubmitted" />
            </template>
        </div>
        <button
            v-if="!extensionOpen"
            type="button"
            class="panel-toggle-btn"
            :title="t('chat.openPanel')"
            @click="extensionOpen = true"
        >
            <Icon name="extesionPanel" :size="15" />
        </button>
        <ExtensionPanel v-model:open="extensionOpen" :type="extensionType" />
    </section>
</template>
