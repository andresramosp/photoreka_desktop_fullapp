<template>
  <div class="aspect-card">
    <div v-if="header" class="aspect-header">
      <div class="aspect-title-wrapper">
        <h3 class="aspect-title">{{ aspect.label }}</h3>
        <span class="aspect-subtitle"
          >{{ aspect.totalPhotos }} photos with this aspect</span
        >
      </div>
    </div>

    <div class="values-list">
      <div
        v-for="(item, index) in aspect.breakdown"
        :key="item.value"
        class="value-row"
      >
        <div class="value-info">
          <div class="value-label-row">
            <div
              class="value-color-dot"
              :style="{ backgroundColor: getAspectSliceColor(index) }"
            ></div>
            <span class="value-label">{{ item.label }}</span>
          </div>
          <span class="value-count">{{ item.count }} photos</span>
        </div>

        <div class="value-bar-section">
          <div class="bar-container">
            <div
              class="bar-fill"
              :style="{
                width: `${
                  aspect.totalPhotos > 0
                    ? (item.count / aspect.totalPhotos) * 100
                    : 0
                }%`,
                backgroundColor: getAspectSliceColor(index),
              }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { getAspectSliceColor } from "@/components/report/visualAspectsUtils.js";

defineProps({
  aspect: {
    type: Object,
    required: true,
  },
  header: {
    type: Boolean,
    default: true,
  },
});
</script>

<style scoped>
.aspect-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
  min-height: 200px;
}

@media (max-width: 768px) {
  .aspect-card {
    min-height: unset;
  }
}

.aspect-card:hover {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-lg);
}

.aspect-header {
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-md);
  border-bottom: 2px solid var(--border-color);
}

.aspect-title-wrapper {
  display: flex;
  flex-direction: column;
}

.aspect-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.aspect-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-normal);
  margin-top: var(--spacing-xs);
}

.values-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.value-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
}

.value-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 200px;
  flex-shrink: 0;
}

.value-label-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.value-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.value-label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.value-count {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  white-space: nowrap;
  margin-left: var(--spacing-md);
}

.value-bar-section {
  flex: 1;
  display: flex;
  align-items: center;
}

.bar-container {
  width: 100%;
  height: 24px;
  background-color: var(--bg-secondary);
  border-radius: 0;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 0;
  transition: width 0.3s ease;
  min-width: 2px;
}

@media (max-width: 1024px) {
  .value-row {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .value-info {
    width: 100%;
    min-width: unset;
  }

  .value-bar-section {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .aspect-title {
    font-size: var(--font-size-lg);
  }

  .value-label {
    font-size: var(--font-size-sm);
  }

  .bar-container {
    height: 20px;
  }
}
</style>
