<script setup lang="ts">
// 项目 Logo（机器人+轨道+发光球+"Baiz"），彩色版 PNG。
// 通过 size 控制展示高度（宽度按 PNG 原始 2:1 比例自适应）：
//   - sm  60px → 侧栏品牌区
//   - md  40px → 通用中型场景
//   - lg  160px → 新建会话对话框上方居中（视觉中心，气场足）
// 深色主题：用 filter 反相提亮，原图深蓝在深色背景下反成浅色，整体对比清晰。
import logoUrl from '../../assets/baiz-logo.png'

defineProps<{
  /** 'sm' 60px / 'md' 40px / 'lg' 160px —— 图片按 PNG 原始 2:1 比例放大 */
  size?: 'sm' | 'md' | 'lg'
}>()
</script>

<template>
  <div class="baiz-logo" :class="`is-${size ?? 'md'}`">
    <img :src="logoUrl" alt="Baiz" />
  </div>
</template>

<style scoped>
.baiz-logo {
  display: inline-flex;
  align-items: center;
  line-height: 0;
  text-align: center;
}

/* 高度档位：必须给容器明确高度，img 的 height:100% 才有参照，
   否则会回退到 PNG 原始尺寸（512px 高），导致 size 无效。 */
.baiz-logo.is-sm {
  height: 60px;
}
.baiz-logo.is-md {
  height: 40px;
}
.baiz-logo.is-lg {
  height: 160px;
}

.baiz-logo img {
  /* 高度统一，宽度按 PNG 原始 2:1 比例自动；display:block 消除 baseline 间隙 */
  height: 100%;
  width: auto;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}

/* 深色主题：原图深蓝在深色背景偏暗。brightness(0) 全部转黑 + invert(1) 反相，
   让深蓝/青色整体反成浅色，与深色背景对比清晰；图片轮廓/比例不变。 */
:root[data-theme='dark'] .baiz-logo img {
  filter: brightness(0) invert(1);
}
</style>
