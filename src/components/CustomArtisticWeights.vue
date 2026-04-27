<template>
  <div class="custom-weights-content" :class="{ compact }">
    <div class="weights-container">
      <div
        v-for="group in groupedCriteria"
        :key="group.key"
        class="criteria-group"
      >
        <div class="group-header">
          <h4 class="group-title" :style="{ color: group.color }">
            {{ group.label }}
          </h4>
        </div>
        <div class="weights-grid">
          <div
            v-for="criterion in group.criteria"
            :key="criterion.value"
            class="weight-item"
          >
            <ClickableWeightSlider
              :model-value="modelValue[criterion.value] || 0"
              @update:model-value="
                (value) => updateWeight(criterion.value, value)
              "
              :min="0"
              :max="1"
              :step="0.1"
              :label="criterion.label"
              :value-display="modelValue[criterion.value]?.toFixed(1) || '0.0'"
              :readonly="readonly"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import ClickableWeightSlider from "./wrappers/ClickableWeightSlider.vue";
import { useArtisticScores } from "@/composables/useArtisticScores";
import { useUserStore } from "@/stores/userStore";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  formatCriterionName: {
    type: Function,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue"]);

// Get artisticScores from composable
const { artisticScores } = useArtisticScores({
  profile: () => useUserStore().user?.profiles,
});

// Group criteria by their categories
const groupedCriteria = computed(() => {
  const groups = [];

  Object.entries(artisticScores).forEach(([groupKey, groupData]) => {
    groups.push({
      key: groupKey,
      label: groupData.label,
      criteria: groupData.criteria,
      color: groupData.color,
    });
  });

  return groups;
});

const updateWeight = (criterion, value) => {
  const newWeights = { ...props.modelValue };
  newWeights[criterion] = value;
  emit("update:modelValue", newWeights);
};
</script>

<style scoped>
.custom-weights-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.weights-header {
  text-align: center;
}

.weights-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
}

.weights-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 450px;
  overflow-y: auto;
  padding-right: 4px;
}

.criteria-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-header {
  padding-bottom: 4px;
  border-bottom: 1px solid #2c2c32;
}

.group-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.weights-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weight-item {
  display: flex;
  flex-direction: column;
}

/* Scrollbar styling */
.weights-container::-webkit-scrollbar {
  width: 6px;
}

.weights-container::-webkit-scrollbar-track {
  background: var(--bg-body);
  border-radius: 3px;
}

.weights-container::-webkit-scrollbar-thumb {
  background: #2c2c32;
  border-radius: 3px;
}

.weights-container::-webkit-scrollbar-thumb:hover {
  background: #3c3c42;
}

/* Compact mode: 2-column grid, no inner scroll */
.compact .weights-container {
  max-height: none;
  overflow-y: visible;
  padding-right: 0;
}

.compact .weights-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.compact .weights-grid .weight-item :deep(.clickable-weight-slider) {
  margin-bottom: 0;
}

.compact .weights-grid .weight-item :deep(.slider-track) {
  height: 38px;
}

.compact .weights-grid .weight-item :deep(.slider-label) {
  font-size: 12px;
}

/* Responsive */
@media (max-width: 768px) {
  .criteria-group {
    gap: 6px;
  }

  .group-title {
    font-size: 11px;
  }
}
</style>
