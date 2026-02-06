<template>
  <div class="mobile-config-panel">
    <!-- Floating Buttons Bar -->
    <div class="floating-buttons-bar">
      <button class="back-button" @click="goBack" title="Volver atrás">
        <n-icon size="18">
          <ArrowLeftOutlined />
        </n-icon>
      </button>

      <button
        class="config-button"
        @click="activeModal = 'clustering'"
        :class="{ active: activeModal === 'clustering' }"
      >
        <n-icon size="16">
          <AppsOutline />
        </n-icon>
        <span class="button-label">Cluster</span>
      </button>

      <button
        class="config-button"
        @click="activeModal = 'display'"
        :class="{ active: activeModal === 'display' }"
      >
        <n-icon size="16">
          <EyeOutlined />
        </n-icon>
        <span class="button-label">Display</span>
      </button>

      <button
        class="config-button"
        @click="activeModal = 'patterns'"
        :class="{ active: activeModal === 'patterns' }"
      >
        <n-icon size="16">
          <TagOutlined />
        </n-icon>
        <span class="button-label">Patterns</span>
      </button>

      <button
        class="config-button"
        @click="activeModal = 'filters'"
        :class="{ active: activeModal === 'filters' }"
      >
        <n-icon size="16">
          <FilterOutlined />
        </n-icon>
        <span class="button-label">Filters</span>
        <span v-if="activeFiltersCount > 0" class="filter-badge">
          {{ activeFiltersCount }}
        </span>
      </button>
    </div>

    <!-- Clustering Modal -->
    <div
      v-if="activeModal === 'clustering'"
      class="mobile-modal"
      @click="activeModal = null"
    >
      <div class="mobile-modal-content" @click.stop>
        <div class="mobile-modal-header">
          <h3 class="mobile-modal-title">
            <n-icon size="18" style="vertical-align: middle; margin-right: 6px">
              <AppsOutline />
            </n-icon>
            Clustering Type
            <button
              class="info-modal-btn"
              @click.stop="clusteringSectionRef?.openInfoModal()"
            >
              <n-icon size="14">
                <InfoCircleOutlined />
              </n-icon>
            </button>
          </h3>
          <button class="close-modal-btn" @click="activeModal = null">
            <n-icon size="18">
              <CloseOutlined />
            </n-icon>
          </button>
        </div>
        <div class="mobile-modal-body">
          <ClusteringTypeSection
            ref="clusteringSectionRef"
            :selectedChunk="selectedChunk"
            :chunkOptions="chunkOptions"
            :showDiscreteLoader="showDiscreteLoader"
            @update:selectedChunk="(val) => emit('update:selectedChunk', val)"
            @chunk-change="handleChunkChange"
          />
        </div>
      </div>
    </div>

    <!-- Display Options Modal -->
    <div
      v-if="activeModal === 'display'"
      class="mobile-modal"
      @click="activeModal = null"
    >
      <div class="mobile-modal-content" @click.stop>
        <div class="mobile-modal-header">
          <h3 class="mobile-modal-title">
            <n-icon size="18" style="vertical-align: middle; margin-right: 6px">
              <EyeOutlined />
            </n-icon>
            Display Options
          </h3>
          <button class="close-modal-btn" @click="activeModal = null">
            <n-icon size="18">
              <CloseOutlined />
            </n-icon>
          </button>
        </div>
        <div class="mobile-modal-body">
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
    </div>

    <!-- Patterns Modal -->
    <div
      v-if="activeModal === 'patterns'"
      class="mobile-modal"
      @click="activeModal = null"
    >
      <div class="mobile-modal-content" @click.stop>
        <div class="mobile-modal-header">
          <h3 class="mobile-modal-title">
            <n-icon size="18" style="vertical-align: middle; margin-right: 6px">
              <TagOutlined />
            </n-icon>
            Patterns
          </h3>
          <button class="close-modal-btn" @click="activeModal = null">
            <n-icon size="18">
              <CloseOutlined />
            </n-icon>
          </button>
        </div>
        <div class="mobile-modal-body">
          <PatternsSection
            :patternsForCurrentChunk="patternsForCurrentChunk"
            :selectedPatternId="selectedPatternId"
            displayMode="select"
            @select-pattern="handlePatternClick"
          />
        </div>
      </div>
    </div>

    <!-- Filters Modal -->
    <div
      v-if="activeModal === 'filters'"
      class="mobile-modal"
      @click="activeModal = null"
    >
      <div class="mobile-modal-content" @click.stop>
        <div class="mobile-modal-header">
          <h3 class="mobile-modal-title">
            <n-icon size="18" style="vertical-align: middle; margin-right: 6px">
              <FilterOutlined />
            </n-icon>
            Search Filters
          </h3>
          <button class="close-modal-btn" @click="activeModal = null">
            <n-icon size="18">
              <CloseOutlined />
            </n-icon>
          </button>
        </div>
        <div class="mobile-modal-body">
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
import { NIcon } from "naive-ui";
import {
  CloseOutlined,
  FilterOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  TagOutlined,
  ArrowLeftOutlined,
} from "@vicons/antd";
import { AppsOutline } from "@vicons/ionicons5";
import ClusteringTypeSection from "./sections/ClusteringTypeSection.vue";
import DisplayOptionsSection from "./sections/DisplayOptionsSection.vue";
import PatternsSection from "./sections/PatternsSection.vue";
import SearchFiltersSection from "./sections/SearchFiltersSection.vue";

// Props
const props = defineProps({
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
  timeRangeFilter: {
    type: Object,
    default: null,
  },
  processedPhotos: {
    type: Array,
    default: () => [],
  },
  // Display options
  atlasBackground: {
    type: String,
    default: null,
  },
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
  patternsForCurrentChunk: {
    type: Array,
    default: () => [],
  },
  selectedPatternId: {
    type: [String, Number],
    default: null,
  },
});

// Emits
const emit = defineEmits([
  "update:selectedChunk",
  "update:selectedVisualAspects",
  "update:artisticScoreFilters",
  "update:timeRangeFilter",
  "update:atlasBackground",
  "update:gridRelaxationEnabled",
  "update:gridRelaxationExpandStrength",
  "update:gridSnapToGrid",
  "update:selectedPatternId",
  "chunk-change",
  "visual-aspects-change",
  "artistic-scores-change",
  "time-range-change",
  "select-pattern",
]);

// Internal state
const activeModal = ref(null);
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

// Watch for chunk changes to clear selected pattern and close modal
watch(
  () => props.selectedChunk,
  () => {
    if (props.selectedPatternId !== null) {
      emit("update:selectedPatternId", null);
    }
  },
);

// Computed properties
// Count active filters for badge
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

// Change handlers - pass through to emit
const handleChunkChange = (value) => {
  emit("chunk-change", value);
  // Auto-close modal after selection
  activeModal.value = null;
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
  console.log("[Mobile] handlePatternClick called with pattern:", pattern);
  emit("select-pattern", pattern);
  // Auto-close modal after selection
  activeModal.value = null;
};

const goBack = () => {
  window.history.back();
};
</script>

<style scoped>
.mobile-config-panel {
  position: relative;
  z-index: 200;
}

/* Floating Buttons Bar */
.floating-buttons-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 8px;
  padding: 12px 16px;
  padding-left: 76px;
  background: var(--bg-card);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  z-index: 201;
}

.back-button {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.back-button:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--text-primary);
}

.config-button {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  min-width: 60px;
}

.config-button:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--text-primary);
}

.config-button.active {
  background: color-mix(in srgb, var(--primary-color) 20%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
  color: var(--primary-color);
}

.button-label {
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}

.filter-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--primary-color);
  color: white;
  font-size: 9px;
  font-weight: 600;
  padding: 2px 4px;
  border-radius: 8px;
  min-width: 14px;
  text-align: center;
  line-height: 1;
}

/* Mobile Modal */
.mobile-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 202;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  touch-action: pan-y;
}

.mobile-modal-content {
  width: 100%;
  max-width: 500px;
  background: var(--bg-card);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.mobile-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.mobile-modal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.info-modal-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  margin-left: 4px;
}

.info-modal-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.close-modal-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-modal-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.mobile-modal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.mobile-modal-body::-webkit-scrollbar {
  width: 4px;
}

.mobile-modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.mobile-modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.mobile-modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
