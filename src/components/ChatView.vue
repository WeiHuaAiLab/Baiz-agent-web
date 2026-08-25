<script setup lang="ts">
// 聊天主视图（页面组装层）：头部 / 内容体 / 输入区三块布局 + 右侧扩展面板（抽屉）。
// 页面级快捷键（Ctrl+K 命令面板、Ctrl+N 新建会话、Esc 关闭创建流程）在此统一处理。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import ChatHeader from './chat/ChatHeader.vue'
import ChatContent from './chat/ChatContent.vue'
import ChatInput from './chat/ChatInput.vue'
import ExtensionPanel, {
    type ExtensionPanelType,
} from './ExtensionPanels/ExtensionPanel.vue'

const ui = useUiStore()

// 扩展面板（抽屉）配置：默认打开，内容为 FilesPanel；类型可在 ExtensionPanelType 中扩展
const extensionOpen = ref(true)
const extensionType = ref<ExtensionPanelType>('files')
const contentRef = ref<InstanceType<typeof ChatContent>>()

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
            <ChatHeader
                :panel-open="extensionOpen"
                @toggle-panel="extensionOpen = !extensionOpen"
            />
            <ChatContent ref="contentRef" />
            <ChatInput @submitted="onSubmitted" />
        </div>
        <!-- 扩展面板（抽屉）：开关与类型由上方配置决定，默认打开 FilesPanel -->
        <ExtensionPanel v-model:open="extensionOpen" :type="extensionType" />
    </section>
</template>
