<script setup lang="ts">
// 工作区路由容器（Settings 风格）：不再显示返回栏/页面标题，
// 各子页（普通任务 / 定时任务 / 能力扩展）自行提供顶部标题与内容。
import { RouterView } from 'vue-router'
</script>

<template>
  <section class="settings-view working-view">
    <div class="settings-inner">
      <RouterView />
    </div>
  </section>
</template>
