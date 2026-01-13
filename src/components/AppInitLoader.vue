<template>
  <div class="app-init-loader">
    <div class="loader-content">
      <n-spin size="large" />
      <p class="loader-text">Loading your catalog...</p>
    </div>
  </div>
</template>

<script setup>
import { NSpin } from "naive-ui";
</script>

<style scoped>
.app-init-loader {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary, #0f0f0f);
}

.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.loader-text {
  color: var(--text-secondary, #a8a8a8);
  font-size: 16px;
  margin: 0;
  font-weight: 500;
}
</style>
