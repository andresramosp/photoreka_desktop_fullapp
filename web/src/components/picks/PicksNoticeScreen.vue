<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  text?: string;
  action?: string;
  loading?: boolean;
}>();
const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <section class="pk-notice-screen">
    <span v-if="loading" class="pk-notice-spinner" />
    <p class="pk-eyebrow">{{ eyebrow }}</p>
    <h1 class="pk-notice-title">{{ title }}</h1>
    <p v-if="text" class="pk-notice-text">{{ text }}</p>
    <button v-if="action" class="pk-btn" @click="emit('action')">{{ action }}</button>
  </section>
</template>

<style scoped>
.pk-notice-screen {
  min-height: calc(100vh - var(--pk-topbar-h) - 80px);
  max-width: 620px;
  margin: 0 auto;
  padding: 40px clamp(16px, 4vw, 48px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
}

.pk-notice-title {
  margin: 0;
  font-family: var(--pk-serif);
  font-weight: 400;
  font-size: clamp(32px, 4.4vw, 52px);
  line-height: 1.05;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

.pk-notice-text {
  margin: 0 0 8px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--pk-text-2);
  text-wrap: balance;
}

.pk-notice-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-top-color: var(--pk-gold);
  animation: pk-notice-spin 0.9s linear infinite;
}

@keyframes pk-notice-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
