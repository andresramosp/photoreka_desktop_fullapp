<template>
  <div class="empty-view">
    <div class="empty-content">
      <n-icon size="64" color="#6b7280">
        <svg viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41c0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"
          />
        </svg>
      </n-icon>
      <h2 class="empty-title">Help</h2>
      <p class="empty-description">Help view coming soon...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: "HelpView",
});

// Help logic here
</script>

<style scoped>
.empty-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
}

.empty-content {
  text-align: center;
}

.empty-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 16px 0 8px 0;
}

.empty-description {
  font-size: 16px;
  color: #ffffff73;
  margin: 0;
}
</style>
