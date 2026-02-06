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
      <!-- Close Button (Top Right Corner) -->
      <button class="close-panel-btn-corner" @click="isExpanded = false">
        <n-icon>
          <CloseOutlined />
        </n-icon>
      </button>

      <!-- Clustering Type Section -->
      <div class="control-section">
        <h4 class="section-title">
          <n-icon
            color="var(--text-on-primary)"
            size="16"
            style="margin-right: 6px; vertical-align: middle"
          >
            <AppsOutline />
          </n-icon>
          Clustering Type
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <button
                class="info-icon-btn"
                type="button"
                @click.stop="clusteringSectionRef?.openInfoModal()"
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
        <ClusteringTypeSection
          ref="clusteringSectionRef"
          :selectedChunk="selectedChunk"
          :chunkOptions="chunkOptions"
          :showDiscreteLoader="showDiscreteLoader"
          @update:selectedChunk="(val) => emit('update:selectedChunk', val)"
          @chunk-change="handleChunkChange"
        />
      </div>

      <!-- Patterns Section -->
      <div class="control-section">
        <div class="section-toggle" @click="showPatterns = !showPatterns">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-on-primary)">
              <TagOutlined />
            </n-icon>
            <span class="section-toggle-label">Patterns for cluster</span>
          </div>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: showPatterns }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>

        <div v-if="showPatterns">
          <PatternsSection
            :patternsForCurrentChunk="patternsForCurrentChunk"
            :selectedPatternId="selectedPatternId"
            displayMode="list"
            @select-pattern="handlePatternClick"
          />
        </div>
      </div>

      <!-- Display Options Section -->
      <div class="control-section">
        <div
          class="section-toggle"
          @click="showDisplayOptions = !showDisplayOptions"
        >
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-on-primary)">
              <EyeOutlined />
            </n-icon>
            <span class="section-toggle-label">Display options</span>
          </div>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: showDisplayOptions }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>

        <div v-if="showDisplayOptions">
          <DisplayOptionsSection
            :gridRelaxationEnabled="gridRelaxationEnabled"
            :gridRelaxationExpandStrength="gridRelaxationExpandStrength"
            :gridSnapToGrid="gridSnapToGrid"
            :atlasBackground="atlasBackground"
            :showDiscreteLoader="showDiscreteLoader"
            @update:gridRelaxationEnabled="
              (val) => emit('update:gridRelaxationEnabled', val)
            "
            @update:gridRelaxationExpandStrength="
              (val) => emit('update:gridRelaxationExpandStrength', val)
            "
            @update:gridSnapToGrid="(val) => emit('update:gridSnapToGrid', val)"
            @update:atlasBackground="
              (val) => emit('update:atlasBackground', val)
            "
          />
        </div>
      </div>

      <!-- Search Filters Section -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleMoreFilters">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-on-primary)">
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

        <div v-if="showMoreFilters" class="filters-container">
          <SearchFiltersSection
            :selectedVisualAspects="selectedVisualAspects"
            :artisticScoreFilters="artisticScoreFilters"
            :timeRangeFilter="timeRangeFilter"
            :processedPhotos="processedPhotos"
            :showDiscreteLoader="showDiscreteLoader"
            @update:selectedVisualAspects="
              (val) => emit('update:selectedVisualAspects', val)
            "
            @update:artisticScoreFilters="
              (val) => emit('update:artisticScoreFilters', val)
            "
            @update:timeRangeFilter="
              (val) => emit('update:timeRangeFilter', val)
            "
            @visual-aspects-change="handleVisualAspectsChange"
            @artistic-scores-change="handleArtisticScoresChange"
            @time-range-change="handleTimeRangeChange"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { NTooltip, NIcon } from "naive-ui";
import {
  CloseOutlined,
  SettingOutlined,
  FilterOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  TagOutlined,
} from "@vicons/antd";
import { AppsOutline } from "@vicons/ionicons5";
import ClusteringTypeSection from "./sections/ClusteringTypeSection.vue";
import DisplayOptionsSection from "./sections/DisplayOptionsSection.vue";
import PatternsSection from "./sections/PatternsSection.vue";
import SearchFiltersSection from "./sections/SearchFiltersSection.vue";

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

  // Patterns
  viewPatternsEnabled: {
    type: Boolean,
    default: false,
  },
  patternOptions: {
    type: Array,
    default: () => [],
  },
  patternsForCurrentChunk: {
    type: Array,
    default: () => [],
  },
  selectedPatternId: {
    type: [String, Number],
    default: null,
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
  "update:viewPatternsEnabled",
  "update:selectedPatternId",
  "chunk-change",
  "visual-aspects-change",
  "artistic-scores-change",
  "time-range-change",
  "reset-view",
  "highlight-pattern",
  "unhighlight-pattern",
  "select-pattern",
]);

// Internal state
const isExpanded = computed({
  get: () => props.showConfigPanel,
  set: (value) => emit("update:showConfigPanel", value),
});

const showMoreFilters = ref(false);
const showPatterns = ref(false);
const showDisplayOptions = ref(false);
const clusteringSectionRef = ref(null);

// Local state for artistic score filters (for counting active filters)
const localArtisticScoreFilters = ref({ ...props.artisticScoreFilters });

// Watch for external changes to artistic score filters
watch(
  () => props.artisticScoreFilters,
  (newVal) => {
    localArtisticScoreFilters.value = { ...newVal };
  },
  { deep: true },
);

// Watch for chunk changes to clear selected pattern
watch(
  () => props.selectedChunk,
  () => {
    if (props.selectedPatternId !== null) {
      emit("update:selectedPatternId", null);
    }
  },
);

// Computed properties
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

// Change handlers - pass through to emit
const handleChunkChange = (value) => {
  emit("chunk-change", value);
};

const handleVisualAspectsChange = (value) => {
  emit("visual-aspects-change", value);
};

const handleArtisticScoresChange = (value) => {
  emit("artistic-scores-change", value);
};

const handleTimeRangeChange = (range) => {
  emit("time-range-change", range);
};

const handlePatternClick = (pattern) => {
  emit("select-pattern", pattern);
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
  margin-bottom: 7px;
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

.active-indicator {
  background: var(--primary-color, #3b82f6);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}

.toggle-icon {
  color: #888;
  transition: transform 0.2s;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

/* Filters container */
.filters-container {
  margin-top: 12px;
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
</style>
