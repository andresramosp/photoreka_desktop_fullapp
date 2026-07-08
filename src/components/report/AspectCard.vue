<template>
  <div
    class="aspect-card"
    :class="{ compact: props.compact }"
    :style="aspectCardStyle"
  >
    <div v-if="!props.compact" class="aspect-header">
      <div class="aspect-title-wrapper">
        <h3 class="aspect-title">{{ aspect.label }}</h3>
        <span class="aspect-subtitle">
          {{ aspect.totalPhotos }} photos with this aspect
        </span>
      </div>
    </div>

    <div class="values-list">
      <div
        v-for="{ item, index } in visibleBreakdown"
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

          <span class="value-count">{{ item.count }}</span>
        </div>

        <div class="value-bar-section">
          <div class="bar-container">
            <div
              class="bar-fill"
              :style="{
                width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%`,
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
import { computed } from "vue";
import { getAspectSliceColor } from "@/components/report/visualAspectsUtils.js";

// Aspect keys (see aspect.key, e.g. "genre" from photo_schema.js) whose
// zero-count values should be hidden instead of shown as empty bars.
const hideZeroCountFor = ["genre"];

const props = defineProps({
  aspect: {
    type: Object,
    required: true,
  },
  minHeight: {
    default: "200px",
    validator: (value) =>
      value === null || typeof value === "string" || typeof value === "number",
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const aspectCardStyle = computed(() => {
  if (props.minHeight === null) {
    return { minHeight: "unset" };
  }

  if (typeof props.minHeight === "number") {
    return { minHeight: `${props.minHeight}px` };
  }

  return { minHeight: props.minHeight };
});

const visibleBreakdown = computed(() => {
  const shouldHideZero = hideZeroCountFor.includes(props.aspect.key);

  return props.aspect.breakdown
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !shouldHideZero || item.count > 0);
});

const maxCount = computed(() => {
  return Math.max(...props.aspect.breakdown.map((item) => item.count), 0);
});
</script>

<style scoped>
.aspect-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
}

.aspect-card:not(.compact):hover {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-lg);
}

.aspect-card.compact {
  padding: var(--spacing-lg);
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

.aspect-card.compact .values-list {
  gap: var(--spacing-md);
}

.value-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
}

.aspect-card.compact .value-row {
  gap: var(--spacing-md);
}

.value-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 170px;
  flex-shrink: 0;
}

.value-label-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.aspect-card.compact .value-label-row {
  gap: var(--spacing-xs);
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

.aspect-card.compact .value-label {
  font-size: var(--font-size-sm);
}

.value-count {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  white-space: nowrap;
  margin-left: var(--spacing-md);
}

.aspect-card.compact .value-count {
  font-size: 11px;
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

.aspect-card.compact .bar-container {
  height: 18px;
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
