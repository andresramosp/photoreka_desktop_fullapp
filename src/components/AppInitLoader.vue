<template>
  <div class="app-init-loader">
    <div class="loader-content">
      <SpiralGridLoader
        variant="primary"
        :size="80"
        text="Loading your catalog..."
      />
    </div>
  </div>
</template>

<script setup>
import SpiralGridLoader from "./SpiralGridLoader.vue";
</script>

<style scoped>
.app-init-loader {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-body, #0f0f0f);
}

.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}
</style>
