<template>
  <div>
    <!-- Collapsed Panel (Small Corner Button) -->
    <div
      v-if="!isExpanded"
      class="collapsed-panel"
      @click="isExpanded = true"
      @click.stop
    >
      <n-icon class="settings-icon">
        <SettingOutlined />
      </n-icon>
    </div>

    <!-- Expanded Panel Content -->
    <div v-if="isExpanded" class="control-panel" @click.stop @wheel.stop>
      <EmbeddingInfoModal v-model="showEmbeddingInfoModal" />
      <!-- Close Button (Top Right Corner) -->
      <button class="close-panel-btn-corner" @click="isExpanded = false">
        <n-icon>
          <CloseOutlined />
        </n-icon>
      </button>

      <!-- Clustering Type Section (Always Visible) -->
      <div class="control-section">
        <h4 class="section-title">
          <n-icon size="16" style="margin-right: 6px; vertical-align: middle">
            <AppsOutline />
          </n-icon>
          Clustering Type
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <button
                class="info-icon-btn"
                type="button"
                @click.stop="showEmbeddingInfoModal = true"
                aria-label="About clustering types"
              >
                <n-icon size="15" color="var(--text-primary)">
                  <InfoCircleOutlined />
                </n-icon>
              </button>
            </template>
            What this map means
          </n-tooltip>
        </h4>
        <div class="control-item-full">
          <n-select
            :disabled="showDiscreteLoader"
            :value="selectedChunk"
            @update:value="handleChunkChange"
            :options="chunkOptions"
            size="small"
            class="embedding-select"
            placeholder="Select embedding type"
            @click.stop
          />
        </div>
      </div>

      <!-- Layout Section -->
      <div class="control-section">
        <h4 class="section-title">
          <n-icon size="16" style="margin-right: 6px; vertical-align: middle">
            <EyeOutlined />
          </n-icon>
          Display options
        </h4>
        <div
          class="control-item-full"
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          "
        >
          <div style="display: flex; align-items: center; gap: 4px">
            <span style="font-size: 12px; color: var(--text-secondary)">
              Unstack photos
            </span>
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
              Separates overlapping photos locally causing a minimum distortion
            </n-tooltip>
          </div>
          <n-switch
            :disabled="showDiscreteLoader"
            :value="gridRelaxationEnabled"
            @update:value="handleGridRelaxationChange"
            size="small"
            @click.stop
          />
        </div>

        <div
          class="control-item-full"
          style="
            margin-top: 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          "
        >
          <div style="display: flex; align-items: center; gap: 4px">
            <span style="font-size: 12px; color: var(--text-secondary)">
              Snap to grid
            </span>
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
              Applies a distortion to align photos to a grid layout
            </n-tooltip>
          </div>
          <n-switch
            :disabled="showDiscreteLoader"
            :value="gridSnapToGrid"
            @update:value="handleGridSnapToGridChange"
            size="small"
            @click.stop
          />
        </div>

        <div class="control-item-full" style="margin-top: 10px">
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
            "
          >
            <div
              style="
                display: flex;
                align-items: center;
                gap: 4px;
                margin-bottom: 7px;
              "
            >
              <span style="font-size: 12px; color: var(--text-secondary)">
                Balloon expansion
              </span>
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
                Inflates the layout around its center
              </n-tooltip>
            </div>
            <span style="font-size: 12px; color: var(--text-secondary)">
              {{ Math.round(gridRelaxationExpandStrength * 100) }}%
            </span>
          </div>
          <n-slider
            :disabled="showDiscreteLoader"
            :value="gridRelaxationExpandStrength"
            @update:value="handleGridRelaxationExpandStrengthChange"
            :min="0"
            :max="0.5"
            :step="0.02"
            @click.stop
            class="score-slider"
          />
        </div>

        <div
          class="control-item-full"
          style="
            margin-top: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          "
        >
          <span style="font-size: 12px; color: var(--text-secondary)">
            Background
          </span>
          <div class="color-picker-pills">
            <button
              v-for="option in atlasBackgroundOptions"
              :key="option.id"
              :class="['color-pill', { active: atlasBackground === option.id }]"
              :style="{ backgroundColor: option.color }"
              :title="option.label"
              :disabled="showDiscreteLoader"
              @click.stop="handleAtlasBackgroundChange(option.id)"
            ></button>
          </div>
        </div>
      </div>

      <!-- More Filters Toggle -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleMoreFilters">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16">
              <FilterOutlined />
            </n-icon>
            <span class="section-toggle-label">Search filters</span>
          </div>
          <div class="section-toggle-indicators">
            <span v-if="activeFiltersCount > 0" class="active-indicator">
              {{ activeFiltersCount }}
            </span>
            <n-icon
              size="12"
              class="toggle-icon"
              :class="{ rotated: showMoreFilters }"
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

        <!-- Collapsible Filters Container -->
        <div v-if="showMoreFilters" class="filters-container">
          <div class="filters-content">
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
                    <n-icon size="12">
                      <CloseOutlined />
                    </n-icon>
                  </button>
                  <n-icon
                    size="12"
                    class="toggle-icon"
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
                      <span class="score-slider-label">{{
                        criterion.label
                      }}</span>
                      <span
                        v-if="localArtisticScoreFilters[criterion.value]"
                        class="score-slider-value"
                      >
                        ≥ {{ localArtisticScoreFilters[criterion.value] }}
                      </span>
                    </div>
                    <n-slider
                      :value="localArtisticScoreFilters[criterion.value]"
                      @update:value="
                        (value) =>
                          handleArtisticScoreChange(criterion.value, value)
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
              <div
                class="scores-toggle"
                @click="showTimeRange = !showTimeRange"
              >
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
                    <n-icon size="12">
                      <CloseOutlined />
                    </n-icon>
                  </button>
                  <n-icon
                    size="12"
                    class="toggle-icon"
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
                  @time-range-change="handleTimeRangeChange"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import {
  NTooltip,
  NSelect,
  NIcon,
  NSlider,
  NTreeSelect,
  NSwitch,
} from "naive-ui";
import {
  CloseOutlined,
  SettingOutlined,
  InfoCircleFilled,
  FilterOutlined,
  EyeOutlined,
  CompassOutlined,
  FullscreenOutlined,
  InfoCircleOutlined,
} from "@vicons/antd";
import { AppsOutline } from "@vicons/ionicons5";
import TimeRangeFilter from "@/components/TimeRangeFilter.vue";
import EmbeddingInfoModal from "./EmbeddingInfoModal.vue";
import { visualAspectsOptions } from "@/stores/searchStore.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { useTheme } from "@/composables/useTheme.js";

// Props
const props = defineProps({
  // Panel state
  showConfigPanel: {
    type: Boolean,
    default: true,
  },
  // Clustering
  selectedChunk: {
    type: [String, Number],
    default: null,
  },
  chunkOptions: {
    type: Array,
    default: () => [],
  },
  showDiscreteLoader: {
    type: Boolean,
    default: false,
  },
  // Filters
  selectedVisualAspects: {
    type: Array,
    default: () => [],
  },
  artisticScoreFilters: {
    type: Object,
    default: () => ({}),
  },
  searchResults: {
    type: Array,
    default: () => [],
  },
  timeRangeFilter: {
    type: Object,
    default: null,
  },
  processedPhotos: {
    type: Array,
    default: () => [],
  },
  // Display options
  photoSize: {
    type: Number,
    default: 80,
  },
  // Background (theme-aware palette, same ids as CanvasView)
  atlasBackground: {
    type: String,
    default: null,
  },
  // Layout
  gridRelaxationEnabled: {
    type: Boolean,
    default: true,
  },
  gridRelaxationExpandStrength: {
    type: Number,
    default: 0,
  },
  gridSnapToGrid: {
    type: Boolean,
    default: true,
  },
  // Navigation
  isPlayground: {
    type: Boolean,
    default: false,
  },
});

// Emits
const emit = defineEmits([
  "update:showConfigPanel",
  "update:selectedChunk",
  "update:selectedVisualAspects",
  "update:artisticScoreFilters",
  "update:timeRangeFilter",
  "update:photoSize",
  "update:atlasBackground",
  "update:gridRelaxationEnabled",
  "update:gridRelaxationExpandStrength",
  "update:gridSnapToGrid",
  "chunk-change",
  "visual-aspects-change",
  "artistic-scores-change",
  "time-range-change",
  "reset-view",
]);

// Internal state
const isExpanded = computed({
  get: () => props.showConfigPanel,
  set: (value) => emit("update:showConfigPanel", value),
});

const showMoreFilters = ref(false);
const showDisplayOptions = ref(false);
const showArtisticScores = ref(false);
const showTimeRange = ref(false);
const showNavigationControls = ref(true);
const showEmbeddingInfoModal = ref(false);

// Theme-aware background palette (same behavior as CanvasView)
const { isDarkMode } = useTheme();
const atlasBackgroundOptions = computed(() => {
  const allOptions = [
    { id: "default", color: "#000000", label: "Dark" },
    { id: "white", color: "#f5f5f5", label: "Light" },
    { id: "navy", color: "#1e3a5f", label: "Navy" },
    { id: "forest", color: "#2d4a3e", label: "Forest" },
  ];

  // In dark mode, hide the white option; in light mode, hide the default (dark) option
  if (isDarkMode.value) {
    return allOptions.filter((opt) => opt.id !== "white");
  }
  return allOptions.filter((opt) => opt.id !== "default");
});

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

// Computed
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

// Count active filters for indicator
const activeFiltersCount = computed(() => {
  let count = 0;
  if (props.selectedVisualAspects && props.selectedVisualAspects.length > 0) {
    count += 1;
  }
  if (Object.keys(localArtisticScoreFilters.value).length > 0) {
    count += 1;
  }
  if (props.timeRangeFilter !== null) {
    count += 1;
  }
  return count;
});

// Toggle handlers
const toggleMoreFilters = () => {
  showMoreFilters.value = !showMoreFilters.value;
};

const toggleDisplayOptions = () => {
  showDisplayOptions.value = !showDisplayOptions.value;
};

const toggleNavigationControls = () => {
  showNavigationControls.value = !showNavigationControls.value;
};

// Change handlers
const handleChunkChange = (value) => {
  emit("update:selectedChunk", value);
  emit("chunk-change", value);
};

const handleGridRelaxationChange = (value) => {
  emit("update:gridRelaxationEnabled", value);
};

const handleGridSnapToGridChange = (value) => {
  emit("update:gridSnapToGrid", value);
};

const handleGridRelaxationExpandStrengthChange = (value) => {
  emit("update:gridRelaxationExpandStrength", value);
};

const handleVisualAspectsChange = (value) => {
  emit("update:selectedVisualAspects", value);
  emit("visual-aspects-change", value);
};

const handleArtisticScoreChange = (key, value) => {
  if (value === 1) {
    // Remove filter if set to minimum
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

const handlePhotoSizeChange = (value) => {
  emit("update:photoSize", value);
};

const handleAtlasBackgroundChange = (value) => {
  emit("update:atlasBackground", value);
};

const handleResetView = () => {
  emit("reset-view");
};
</script>

<style scoped>
/* Collapsed panel button */

.collapsed-panel {
  touch-action: manipulation;
}

.settings-icon {
  color: #e5e5e5;
  font-size: 20px;
}

.info-icon-btn {
  margin-left: 3px;
  margin-top: 2px;
  background: transparent;
  border: none;
  padding: 2px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.info-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* Control panel */
.control-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 280px;
  max-height: calc(100vh - 32px);
  background: var(--bg-card);
  border-radius: 12px;
  padding: 16px;
  z-index: 200;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.close-panel-btn-corner {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-panel-btn-corner:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

/* Section styles */
.control-section {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.control-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.section-title {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
}

.section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 4px 0;
  transition: opacity 0.2s;
}

.section-toggle:hover {
  opacity: 0.8;
}

.section-toggle-label {
  color: #e5e5e5;
  font-size: 13px;
  font-weight: 600;
}

.section-toggle-indicators {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toggle-icon {
  color: #888;
  transition: transform 0.2s;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

/* Control items */
.control-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.control-item-full {
  margin-bottom: 10px;
}

.control-label {
  color: #aaa;
  font-size: 12px;
}

/* Filters container */
.filters-container {
  margin-top: 12px;
}

.filters-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

/* Scores toggle */
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

/* Artistic scores sliders */
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

/* Time range container */
.time-range-container {
  margin-top: 8px;
}

/* Options container */
.options-container {
  margin-top: 12px;
}

/* Slider container */
.slider-container {
  padding: 0 4px;
}

/* Controls info */
.controls-info {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-tip {
  display: flex;
  align-items: flex-start;
}

.control-icon-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-icon-text {
  font-size: 14px;
  width: 24px;
  text-align: center;
}

.control-text {
  color: #aaa;
  font-size: 11px;
  line-height: 1.4;
}

/* Reset view button */
.reset-view-btn {
  width: 100%;
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.3);
  color: #4ade80;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.reset-view-btn:hover {
  background: rgba(74, 222, 128, 0.2);
  border-color: rgba(74, 222, 128, 0.5);
}

/* Select styling */
.embedding-select,
.aspects-select {
  width: 100%;
}

/* Slider styling */
:deep(.n-slider) {
  --n-fill-color: #4ade80;
  --n-fill-color-hover: #22c55e;
}

:deep(.n-slider-handle) {
  background: #4ade80;
  border-color: #4ade80;
}

/* Scrollbar styling */
.control-panel::-webkit-scrollbar {
  width: 6px;
}

.control-panel::-webkit-scrollbar-track {
  background: transparent;
}

.control-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.control-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Color picker pills (same UI as CanvasView) */
.color-picker-pills {
  display: flex;
  gap: 8px;
}

.color-pill {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.65);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.color-pill:hover {
  transform: scale(1.1);
}

.color-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.color-pill.active {
  border-color: var(--primary-color, #007bff);
  box-shadow: 0 0 0 2px var(--primary-color, #007bff);
}
</style>
