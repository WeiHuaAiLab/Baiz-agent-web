<script setup lang="ts">
// 空态与骨架屏互斥渲染（MSG-3233 ④ 的页面级视图）。
// 抽出本件：父层 ChatContent 只关心「空不空、在不在加载」两条 boolean，
// 骨架屏 / 空态分支逻辑与按钮文案收于此，父层不在模板里内联 v-if 长链。
import SkeletonChatView from "./SkeletonChatView.vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  /** 父层 messages.isLoading：加载中且完全空 ⇒ 走骨架 | 走空态 */
  loading: boolean;
  /** 父层聚合：displayItems/pendingApprovals/streamingRuns 全空时为 true */
  empty: boolean;
}>();

defineEmits<{
  /** 空态按钮「开始新会话」：父层打开新建会话弹层（ui.openCreate('session')） */
  (e: "create-session"): void;
}>();

const { t } = useI18n();
</script>

<template>
  <!-- 骨架优先：加载中且完全空 ⇒ 骨架；否则空态（两者互斥） -->
  <SkeletonChatView v-if="props.loading" />
  <div v-else-if="props.empty" class="empty-state">
    <p class="empty">{{ t("chat.empty") }}</p>
    <button
      type="button"
      class="empty-start"
      @click="$emit('create-session')"
    >
      {{ t("chat.emptyStart") }}
    </button>
  </div>
</template>