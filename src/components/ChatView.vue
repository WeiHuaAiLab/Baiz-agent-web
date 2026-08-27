<script setup lang="ts">
// 聊天主视图（页面组装层）：创建会话（CreateChat）/ 创建项目（CreateProject）/ 会话展示（头部 / 内容体 / 输入区）三套布局 + 右侧扩展面板（抽屉）。
// 页面级快捷键（Ctrl+K 命令面板、Ctrl+N 新建会话、Esc 关闭创建流程）在此统一处理。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '../stores/ui'
import CreateChat from './chat/CreateChat.vue'
import CreateProject from './chat/CreateProject.vue'
import ChatHeader from './chat/ChatHeader.vue'
import ChatContent from './chat/ChatContent.vue'
import ChatInput from './chat/ChatInput.vue'
import OverlayScrollArea from './common/OverlayScrollArea.vue'
import Icon from './common/Icon.vue'
import ExtensionPanel, {
    type ExtensionPanelType,
} from './ExtensionPanels/ExtensionPanel.vue'

const { t } = useI18n()
const ui = useUiStore()

// 扩展面板（抽屉）配置：默认打开，内容为 FilesPanel；类型可在 ExtensionPanelType 中扩展
const extensionOpen = ref(true)
const extensionType = ref<ExtensionPanelType>('files')
const contentRef = ref<InstanceType<typeof ChatContent>>()
// 外层 OverlayScrollArea 实例（用于内容变化后手动 sync 滑块）
const overlayRef = ref<InstanceType<typeof OverlayScrollArea>>()
// 悬浮滚动条的 target：由 ChatContent 上报的消息滚动容器（响应式，异步加载也能正确绑定）
const scrollTarget = ref<HTMLElement>()

// 创建模式（新会话/普通任务/新项目）：chat-main 只显示居中的创建引导，隐藏会话展示
const isCreating = computed(() => ui.createMode === 'session' || ui.createMode === 'task')
const isCreatingProject = computed(() => ui.createMode === 'project')

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

function onScrollerReady(el?: HTMLElement) {
    scrollTarget.value = el;
}

function syncScroll() {
    // 消息内容变化后，等 DOM 更新完再刷新悬浮滑块位置/高度
    void nextTick(() => overlayRef.value?.sync());
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
            <CreateProject v-if="isCreatingProject" />
            <CreateChat v-else-if="isCreating" />
            <template v-else>
                <ChatHeader />
                <!-- 内容体 + 输入框共同包裹在 OverlayScrollArea 中：
                     输入框位于容器最下方（flex:none），消息区 flex:1 滚动；
                     滚动条轨道覆盖整个 chat 区域（含输入框高度）。
                     有数据时滚动条默认位于底部（ChatContent 内 pinned 逻辑保证）。 -->
                <OverlayScrollArea
                    ref="overlayRef"
                    class="chat-body"
                    :target="scrollTarget"
                >
                    <ChatContent
                        ref="contentRef"
                        @scroller-ready="onScrollerReady"
                        @content-changed="syncScroll"
                    />
                    <ChatInput @submitted="onSubmitted" />
                </OverlayScrollArea>
            </template>
        </div>
        <!-- 打开文件面板：与 ExtensionPanel 同层级，面板关闭时悬浮于 chatView 右上角 -->
        <button
            v-if="!extensionOpen"
            type="button"
            class="panel-toggle-btn"
            :title="t('chat.openPanel')"
            @click="extensionOpen = true"
        >
            <Icon name="extesionPanel" :size="15" />
        </button>
        <!-- 扩展面板（抽屉）：开关与类型由上方配置决定，默认打开 FilesPanel -->
        <ExtensionPanel v-model:open="extensionOpen" :type="extensionType" />
    </section>
</template>
