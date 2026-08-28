<script setup lang="ts">
// 侧栏品牌区：Logo 图（彩色版本），小尺寸 60px 高。
import Logo from '../common/Logo.vue'
</script>

<template>
  <!-- 临时隐藏整个品牌区（含 Logo），查看效果 -->
  <div v-if="false" class="brand">
    <Logo size="md" />
  </div>
</template>