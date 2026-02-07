<template>
  <div class="section-content">
    <!-- Visual Aspects Filter -->
    <div class="filter-item">
      <label class="filter-label">Visual Aspects</label>
      <n-tree-select
        :value="selectedVisualAspects"
        @update:value="handleVisualAspectsChange"
        multiple
        clearable
        placeholder="Any aspect"
        :options="treeSelectOptions"
        :max-tag-count="2"
        class="aspects-select"
        :disabled="showDiscreteLoader"
        size="small"
        check-strategy="child"
        :show-path="false"
        expand-on-click
        @click.stop
      >
        <template #empty>
          <div style="padding: 8px; color: #888; font-size: 12px">
            No visual aspects found
          </div>
        </template>
      </n-tree-select>
    </div>

    <!-- Artistic Scores Filter (Collapsible) -->
    <div class="filter-item">
      <div
        class="scores-toggle"
        @click="showArtisticScores = !showArtisticScores"
      >
        <div style="display: flex; align-items: center; gap: 4px">
          <span class="scores-toggle-label">Visual Scores</span>
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-icon
                size="12"
                color="var(--text-secondary)"
                style="cursor: help"
              >
                <InfoCircleFilled />
              </n-icon>
            </template>
            Filter photos by minimum score threshold (1-10)
          </n-tooltip>
        </div>
        <div style="display: flex; align-items: center; gap: 8px">
          <button
            v-if="Object.keys(localArtisticScoreFilters).length > 0"
            @click.stop="clearArtisticScores"
            class="clear-scores-btn"
            title="Clear all scores"
          >
            <n-icon size="12" color="var(--text-on-primary)">
              <CloseOutlined />
            </n-icon>
          </button>
          <n-icon
            size="12"
            class="toggle-icon"
            color="var(--text-on-primary)"
            :class="{ rotated: showArtisticScores }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>
      </div>

      <!-- Collapsible Scores Content -->
      <div v-if="showArtisticScores" class="artistic-scores-sliders">
        <div
          v-for="(group, groupKey) in artisticScoresGroups"
          :key="groupKey"
          class="score-group"
        >
          <div class="score-group-header">{{ group.label }}</div>
          <div
            v-for="criterion in group.criteria"
            :key="criterion.value"
            class="score-slider-item"
          >
            <div class="score-slider-header">
              <span class="score-slider-label">{{ criterion.label }}</span>
              <span
                v-if="localArtisticScoreFilters[criterion.value]"
                class="score-slider-value"
              >
                ≥ {{ localArtisticScoreFilters[criterion.value] }}
              </span>
            </div>
            <n-slider
              :value="localArtisticScoreFilters[criterion.value] || 1"
              @update:value="
                (value) => handleArtisticScoreChange(criterion.value, value)
              "
              :min="1"
              :max="10"
              :step="0.5"
              :disabled="showDiscreteLoader"
              @click.stop
              class="score-slider"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Time Range Filter (Collapsible) -->
    <div class="filter-item">
      <div class="scores-toggle" @click="showTimeRange = !showTimeRange">
        <div style="display: flex; align-items: center; gap: 4px">
          <span class="scores-toggle-label">Time Range</span>
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-icon
                size="12"
                color="var(--text-secondary)"
                style="cursor: help"
              >
                <InfoCircleFilled />
              </n-icon>
            </template>
            Filter photos by capture date range
          </n-tooltip>
        </div>
        <div style="display: flex; align-items: center; gap: 8px">
          <button
            v-if="timeRangeFilter !== null"
            @click.stop="clearTimeRange"
            class="clear-scores-btn"
            title="Clear time range"
          >
            <n-icon size="12" color="var(--text-on-primary)">
              <CloseOutlined />
            </n-icon>
          </button>
          <n-icon
            size="12"
            class="toggle-icon"
            color="var(--text-on-primary)"
            :class="{ rotated: showTimeRange }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>
      </div>

      <!-- Collapsible Time Range Content -->
      <div v-if="showTimeRange" class="time-range-container">
        <TimeRangeFilter
          :photos="processedPhotos"
          :show-title="false"
          :current-time-range="timeRangeFilter"
          @time-range-change="handleTimeRangeChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { NTreeSelect, NTooltip, NIcon, NSlider } from "naive-ui";
import { InfoCircleFilled, CloseOutlined } from "@vicons/antd";
import TimeRangeFilter from "@/components/TimeRangeFilter.vue";
import { visualAspectsOptions } from "@/stores/searchStore.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";

const props = defineProps({
  selectedVisualAspects: {
    type: Array,
    default: () => [],
  },
  artisticScoreFilters: {
    type: Object,
    default: () => ({}),
  },
  timeRangeFilter: {
    type: Object,
    default: null,
  },
  processedPhotos: {
    type: Array,
    default: () => [],
  },
  showDiscreteLoader: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "update:selectedVisualAspects",
  "update:artisticScoreFilters",
  "update:timeRangeFilter",
  "visual-aspects-change",
  "artistic-scores-change",
  "time-range-change",
]);

// Internal state
const showArtisticScores = ref(false);
const showTimeRange = ref(false);

// Local state for artistic score filters
const localArtisticScoreFilters = ref({ ...props.artisticScoreFilters });

// Watch for external changes to artistic score filters
watch(
  () => props.artisticScoreFilters,
  (newVal) => {
    localArtisticScoreFilters.value = { ...newVal };
  },
  { deep: true },
);

const { artisticScores } = useArtisticScores();
const artisticScoresGroups = artisticScores;

const treeSelectOptions = computed(() => {
  return visualAspectsOptions.map((group) => ({
    label: group.label,
    key: group.key,
    disabled: false,
    checkable: false,
    children: group.children.map((child) => ({
      label: child.label,
      key: child.value,
      disabled: false,
      checkable: true,
    })),
  }));
});

const handleVisualAspectsChange = (value) => {
  emit("update:selectedVisualAspects", value);
  emit("visual-aspects-change", value);
};

const handleArtisticScoreChange = (key, value) => {
  if (value === 1) {
    delete localArtisticScoreFilters.value[key];
  } else {
    localArtisticScoreFilters.value[key] = value;
  }
  emit("update:artisticScoreFilters", { ...localArtisticScoreFilters.value });
  emit("artistic-scores-change", { ...localArtisticScoreFilters.value });
};

const clearArtisticScores = () => {
  localArtisticScoreFilters.value = {};
  emit("update:artisticScoreFilters", {});
  emit("artistic-scores-change", {});
};

const handleTimeRangeChange = (range) => {
  emit("update:timeRangeFilter", range);
  emit("time-range-change", range);
};

const clearTimeRange = () => {
  emit("update:timeRangeFilter", null);
  emit("time-range-change", null);
};
</script>

<style scoped>
.section-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 5px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  color: #aaa;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.aspects-select {
  width: 100%;
}

.scores-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 4px 0;
}

.scores-toggle-label {
  color: #aaa;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.toggle-icon {
  color: #888;
  transition: transform 0.2s;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

.clear-scores-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 4px;
  padding: 2px 4px;
  cursor: pointer;
  color: #888;
  transition: all 0.2s;
}

.clear-scores-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #e5e5e5;
}

.artistic-scores-sliders {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.score-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.score-group-header {
  color: #888;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.score-slider-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.score-slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.score-slider-label {
  color: var(--text-secondary);
  font-size: 11px;
}

.score-slider-value {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
}

.time-range-container {
  margin-top: 8px;
}

:deep(.n-slider) {
  --n-fill-color: #4ade80;
  --n-fill-color-hover: #22c55e;
}

:deep(.n-slider-handle) {
  background: #4ade80;
  border-color: #4ade80;
}
</style>
