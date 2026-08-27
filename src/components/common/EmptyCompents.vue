<script setup lang="ts">
// 通用空状态占位组件。
// 用法：
//   <EmptyCompents title="暂无数据" description="创建后会在此展示" />
//   <EmptyCompents icon="inbox" title="暂无任务" description="..." />
//   <EmptyCompents icon="folder">自定义说明文字（默认 slot）</EmptyCompents>
import Icon, { type IconName } from './Icon.vue'

interface Props {
  /** 顶部 icon 名称，对应 src/components/common/Icon.vue 已注册图标 */
  icon?: IconName
  /** 主标题（必填） */
  title: string
  /** 副标题/补充说明，可选 */
  description?: string
}

withDefaults(defineProps<Props>(), {
  icon: 'inbox',
  description: '',
})
</script>

<template>
  <div class="empty">
    <div class="empty-icon">
      <Icon :name="icon" :size="22" />
    </div>
    <div class="empty-title">{{ title }}</div>
    <div v-if="description || $slots.default" class="empty-desc">
      <slot>{{ description }}</slot>
    </div>
    <div v-if="$slots.action" class="empty-action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  color: var(--muted);
}

.empty-icon {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--code-bg);
  color: var(--muted);
  margin-bottom: 12px;
}

.empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}

.empty-desc {
  font-size: 12px;
  color: var(--muted);
  max-width: 320px;
  line-height: 1.5;
}

.empty-action {
  margin-top: 12px;
}
</style>
