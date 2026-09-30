<script setup lang="ts">
// 流式期在飞项容器（仅 ChatContent `#after` 尾流槽用）——**自持全封闭**：
// 合并管理、折叠态、渲染分发全在本件内，父层只传 `items` 一个 prop。
//
// ★ 不复 `MessageItem`／`ToolCallGroup`：那两件内部会拖入 AssistantMessage／
//   UserMessage／StatusMessage／RunBlocks／AuthErrorCard 等一整条依赖链，而尾流槽
//   由 `streamingTailByTaskId` 保证**只可能出现两类**——`tool_call` 与已决
//   `approval`。故此处直接按 kind 分发到 ToolRow／ApprovalCard：依赖面最小，
//   后续调在飞态的渲染不必牵动 settled 侧那一串件，也不必改 displayItems/ChatContent。
//
// 合并管理为**默认常态**（容器＋折叠头常驻，计数／工具名／失败数随帧实时增长），
// 而非"攒够条数才出现"：尾流槽的高度从第一条起就受控。
// 折叠规则：**超过 `AUTO_COLLAPSE_OVER`（3 条）自动折叠**；≤3 条行数不多，
// 默认摊开以保留实时操作可见性。用户一旦手动点过（toggle），后续新增项不再
// 自动翻转——免得"用户刚展开、下一条到来又被收起"。
//
// 样式：折叠头复用 chat.css 的 `.tool-group*` 类（与收束组同面，零样式重复）；
// 行间距走 `.inflight-body`——本件直渲 ToolRow／ApprovalCard **无 `.msg` 壳**，
// `.tool-group-body .msg+.msg` 命中不到，需自补。
//
// 展开态自持（本件常驻 `#after` 槽、不进虚拟列表，无回收 ⇒ 状态不会丢）。
// 代价：收束后该批消息回流到消息列表、改由 ToolCallGroup 走父层展开态表渲染，
// 而那张表默认折叠 ⇒ 呈现为「流式期展开 → 收束后回折」。若要跨阶段连续，把
// 父层 `groupExpanded` 表作为 prop 传入、按 `tg:${首条 id}` 取即可——该 id 口径
// 与收束侧 `flush()` 生成的组本就同源，无需改任何派生逻辑。
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ChatMessage } from "../../models";
import ToolRow from "./message/ToolRow.vue";
import ApprovalCard from "./message/ApprovalCard.vue";

const props = defineProps<{ items: ChatMessage[] }>();

const { t } = useI18n();

/** 自动折叠门槛：**超过**该条数即收起（≤3 条默认摊开） */
const AUTO_COLLAPSE_OVER = 3;

/** 只认上述两类，其余 kind 一律不渲（零兜底壳） */
const rows = computed(() =>
  props.items.filter((m) => m.kind === "tool_call" || m.kind === "approval"),
);

const over = computed(() => rows.value.length > AUTO_COLLAPSE_OVER);

const expanded = ref(true);
/** 用户手动定过 ⇒ 自动翻转让位（后续新增项不再改展开态） */
const userToggled = ref(false);

watch(
  over,
  (isOver) => {
    if (userToggled.value) return;
    expanded.value = !isOver;
  },
  { immediate: true },
);

function toggle(): void {
  userToggled.value = true;
  expanded.value = !expanded.value;
}

/** 折叠头摘要：工具名去重保序（approval 卡同样带 meta.toolName，两类共用） */
const toolNames = computed(() => {
  const names = rows.value
    .map((m) => m.meta?.toolName)
    .filter((name): name is string => !!name);
  return [...new Set(names)].join(" · ");
});

const failedCount = computed(
  () => rows.value.filter((m) => m.meta?.success === false).length,
);
</script>

<template>
  <div v-if="rows.length" class="inflight-items tool-group" :class="{ expanded }">
    <!-- 折叠头常驻（合并管理）：计数／工具名／失败数随帧实时增长 -->
    <button
      type="button"
      class="tool-group-head"
      :title="expanded ? t('chat.toolGroupCollapse') : t('chat.toolGroupExpand')"
      @click="toggle"
    >
      <span class="tool-group-caret">{{ expanded ? "▾" : "▸" }}</span>
      <span class="tool-group-count">
        {{ t("chat.toolGroupSummary", { count: rows.length }) }}
      </span>
      <span v-if="toolNames" class="tool-group-names">{{ toolNames }}</span>
      <span v-if="failedCount" class="tool-group-failed">
        {{ t("chat.toolGroupFailed", { count: failedCount }) }}
      </span>
    </button>

    <!-- v-show 而非 v-if：展开/收起不重建 ToolRow 的 FileCard／diff 统计 -->
    <div v-show="expanded" class="inflight-body grouped">
      <template v-for="m in rows" :key="m.id">
        <ToolRow v-if="m.kind === 'tool_call'" :message="m" />
        <ApprovalCard v-else-if="m.kind === 'approval'" :message="m" />
      </template>
    </div>
  </div>
</template>
