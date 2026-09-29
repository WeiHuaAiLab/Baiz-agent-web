<script setup lang="ts">
// 独立小组件：流式活动行（.activity-line 容器）。
// 仅作"在飞"语义的省略号跑马灯（DESIGN.md §7「禁脉冲／弹跳／旋转」——
// 跑马灯属文字帧步进，不属装饰动画，与流式光标 blink 同源例外）。
// 仅对以「…」结尾的文案生效（思考中… / 生成中… / 正在调用 xxx…）；
// 「已完成 xxx」无尾点 → 静态显示。`dot` 常量点保留（§7 撤除脉冲，常规点
// 表达运行态）。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ text: string }>()

const FRAMES = ['', '.', '..', '...'] as const
const STEP_MS = 400 // DESIGN.md §7 通用过渡 400ms

const animate = computed(() => props.text.endsWith('…'))
const base = computed(() => (animate.value ? props.text.slice(0, -1) : props.text))
const idx = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function start() {
    stop()
    if (!animate.value) return
    timer = setInterval(() => {
        idx.value = (idx.value + 1) % FRAMES.length
    }, STEP_MS)
}
function stop() {
    if (timer) {
        clearInterval(timer)
        timer = null
    }
}

onMounted(start)
watch(animate, () => {
    idx.value = 0
    start()
})
onBeforeUnmount(stop)
</script>

<template>
    <div class="activity-line">
        <span class="activity-dot" />
        <span class="activity-text">{{ base }}<span v-if="animate" class="activity-dots">{{ FRAMES[idx] }}</span></span>
    </div>
</template>