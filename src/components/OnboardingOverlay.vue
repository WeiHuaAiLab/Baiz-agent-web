<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUiStore } from '../stores/ui'

const { t } = useI18n()
const ui = useUiStore()

function runDemo() {
  ui.setPendingPrompt('帮我总结今天的客户情况')
  ui.completeOnboarding()
}
</script>

<template>
  <div v-if="ui.showOnboarding" class="onboard-mask" @click.self="ui.completeOnboarding()">
    <div class="onboard-card">
      <h2>{{ t('onboard.title') }}</h2>
      <p class="onboard-sub">{{ t('onboard.sub') }}</p>
      <ol class="onboard-steps">
        <li>{{ t('onboard.step1') }}</li>
        <li>
          {{ t('onboard.step2') }}
          <button type="button" class="demo-btn" @click="runDemo">{{ t('onboard.tryDemo') }}</button>
        </li>
        <li>{{ t('onboard.step3') }}</li>
      </ol>
      <div class="onboard-actions">
        <button type="button" class="btn-ghost" @click="ui.completeOnboarding()">
          {{ t('onboard.skip') }}
        </button>
        <button type="button" class="btn-primary" @click="ui.completeOnboarding()">
          {{ t('onboard.start') }}
        </button>
      </div>
    </div>
  </div>
</template>
