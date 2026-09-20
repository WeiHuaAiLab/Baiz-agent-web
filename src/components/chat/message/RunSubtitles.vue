<script setup lang="ts">
// 批0 人话字幕：本次运行里所有工具调用翻译成小白能看懂的一句话（按时间顺序）。
// 默认隐藏，设置中开启（settings.showHuman）。
import { computed } from 'vue'
import { useSettingsStore } from '../../../stores/settings'
import type { RunState } from '../../../models'

const props = defineProps<{ run?: RunState }>()

const settings = useSettingsStore()
const subtitles = computed(() => props.run?.subtitles ?? [])
</script>

<template>
  <div v-if="settings.showHuman && subtitles.length" class="xp-subtitles">
    <div
      v-for="(sub, i) in subtitles"
      :key="i"
      class="xp-subtitle"
    >
      <span class="xp-subtitle-tag">人话</span>
      <span class="xp-subtitle-text">{{ sub.text }}</span>
    </div>
  </div>
</template>
