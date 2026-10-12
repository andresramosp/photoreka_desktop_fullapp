<script setup lang="ts">
defineProps<{
  title: string;
  text?: string;
  /** Highlighted line at the bottom, e.g. why a chip is disabled. */
  note?: string;
}>();
</script>

<template>
  <div class="pk-tip">
    <strong class="pk-tip-title">{{ title }}</strong>
    <p v-if="text" class="pk-tip-text">{{ text }}</p>
    <slot />
    <p v-if="note" class="pk-tip-note">{{ note }}</p>
  </div>
</template>

<style scoped>
.pk-tip {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pk-tip-title {
  font-size: 13px;
  font-weight: 600;
}

.pk-tip-text {
  margin: 0;
  color: rgba(255, 255, 255, 0.64);
}

.pk-tip-note {
  margin: 4px 0 0;
  color: #ffd98a;
}
</style>
