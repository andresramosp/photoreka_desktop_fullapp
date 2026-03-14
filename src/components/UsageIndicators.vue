<template>
  <!-- Mobile: Icon with Popover -->
  <!-- <div class="usage-indicators-mobile">
    <n-popover trigger="click" placement="bottom">
      <template #trigger>
        <n-button quaternary circle size="small" class="usage-trigger-btn">
          <template #icon>
            <n-icon size="20" color="var(--info-color)">
              <DriveFolderUploadFilled />
            </n-icon>
          </template>
        </n-button>
      </template>
      <div class="usage-popover-content">
        <div class="usage-popover-header">
          <n-icon size="16" color="var(--info-color)">
            <DriveFolderUploadFilled />
          </n-icon>
          <span>Upload Usage</span>
        </div>
        <div class="usage-popover-stats">
          <span class="usage-popover-count"
            >{{ photosUsage }} / {{ photosLimit }}</span
          >
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill upload-progress"
            :style="{ width: uploadPercentage + '%' }"
          ></div>
        </div>
        <span class="remaining-text"
          >{{ photosRemaining }} photos remaining</span
        >
      </div>
    </n-popover>
  </div> -->

  <!-- Desktop: Full card -->
  <div class="usage-indicators" :class="{ 'settings-mode': settingsMode }">
    <div class="usage-card">
      <div class="usage-header">
        <div class="usage-title">
          <n-icon size="16" color="var(--primary-color)">
            <InProgress />
          </n-icon>
          Analyzed Photos
        </div>
        <span class="usage-count"
          >{{ analyzedPhotosUsed }} / {{ analyzedPhotosLimit }}</span
        >
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill analysis-progress"
          :style="{ width: analysisPercentage + '%' }"
          :class="{
            warning: analysisPercentage > 80,
            critical: analysisPercentage > 95,
          }"
        ></div>
      </div>
      <div class="usage-footer">
        <span class="remaining-text"
          >{{ analyzedPhotosRemaining }} analyses remaining</span
        >
      </div>
    </div>

    <div class="usage-card">
      <div class="usage-header">
        <div class="usage-title">
          <n-icon size="16" color="var(--info-color)">
            <DriveFolderUploadFilled />
          </n-icon>
          Photo Upload
        </div>
        <span class="usage-count">{{ photosUsage }} / {{ photosLimit }}</span>
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill upload-progress"
          :style="{ width: uploadPercentage + '%' }"
          :class="{
            warning: uploadPercentage > 80,
            critical: uploadPercentage > 95,
          }"
        ></div>
      </div>
      <div class="usage-footer">
        <span class="remaining-text"
          >{{ photosRemaining }} photos remaining</span
        >
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useUserStore } from "@/stores/userStore";
import { NButton, NIcon } from "naive-ui";
import { DriveFolderUploadFilled } from "@vicons/material";
import { InProgress } from "@vicons/carbon";
import { AddOutline } from "@vicons/ionicons5";

const props = defineProps({
  settingsMode: {
    type: Boolean,
    default: false,
  },
});

const userStore = useUserStore();

// Default values if usage is not available
const photosUsage = computed(() => userStore.user?.usage?.photosUsage || 0);
const photosLimit = computed(() => userStore.user?.usage?.photosLimit || 5000);
const photosRemaining = computed(() => userStore.user?.usage?.photosRemaining);
const analyzedPhotosUsed = computed(
  () => userStore.user?.usage?.analyzedPhotosUsed || 0,
);
const analyzedPhotosLimit = computed(
  () => userStore.user?.usage?.analyzedPhotosLimit || 2000,
);
const analyzedPhotosRemaining = computed(
  () =>
    userStore.user?.usage?.analyzedPhotosRemaining || analyzedPhotosLimit.value,
);

// Calculate percentages
const uploadPercentage = computed(() => {
  if (photosLimit.value === 0) return 0;
  return Math.min((photosUsage.value / photosLimit.value) * 100, 100);
});

const analysisPercentage = computed(() => {
  if (analyzedPhotosLimit.value === 0) return 0;
  return Math.min(
    (analyzedPhotosUsed.value / analyzedPhotosLimit.value) * 100,
    100,
  );
});
</script>

<style scoped>
.usage-indicators {
  display: flex;
  gap: var(--spacing-lg);
  align-items: stretch;
}

.usage-card {
  flex: 1;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
  min-width: 200px;
}

.usage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.usage-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.usage-count {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: var(--bg-container);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--spacing-xs);
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.3s ease;
}

.upload-progress {
  background-color: var(--info-color);
}

.analysis-progress {
  background-color: var(--primary-color);
}

.progress-fill.warning {
  background-color: var(--warning-color);
}

.progress-fill.critical {
  background-color: var(--error-color);
}

.usage-indicators.settings-mode {
  flex-direction: column;
}

.usage-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.remaining-text {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

/* Mobile version - hidden by default on desktop */
.usage-indicators-mobile {
  display: none;
  position: absolute;
  top: 8px;
  right: 12px;
  margin: 0;
  padding: 0;
}

/* Popover content styles */
.usage-popover-content {
  min-width: 200px;
  padding: var(--spacing-xs);
}

.usage-popover-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  margin-bottom: var(--spacing-sm);
}

.usage-popover-stats {
  margin-bottom: var(--spacing-xs);
}

.usage-popover-count {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.usage-trigger-btn {
  background-color: var(--bg-surface) !important;
  border: 1px solid var(--border-color) !important;
}

/* Responsive */
@media (max-width: 768px) {
  /* Hide desktop version, show mobile version */
  /* .usage-indicators {
    display: none;
  }

  .usage-indicators-mobile {
    display: flex;
    position: absolute;
    top: 8px;
    right: 12px;
  } */
}
</style>
