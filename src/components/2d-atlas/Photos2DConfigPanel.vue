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
    <div
      v-if="isExpanded"
      class="control-panel shared-config-panel"
      @click.stop
      @wheel.stop
    >
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
            color="var(--text-primary)"
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

      <!-- Viewport Section -->
      <div class="control-section">
        <div class="section-toggle" style="cursor: default; margin-bottom: 7px">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-primary)">
              <DatabaseOutlined />
            </n-icon>
            <span class="section-toggle-label">Viewport</span>
          </div>
        </div>
        <div class="section-content">
          <div class="control-item-full" @pointerup="emitPhotoLimit">
            <div class="slider-header">
              <div class="control-item-label">
                <span>Max photos</span>
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-icon
                      size="12"
                      color="var(--text-secondary)"
                      class="info-icon-small"
                    >
                      <InfoCircleOutlined />
                    </n-icon>
                  </template>
                  Maximum number of photos to load. Shows the most recent first.
                  Lower values improve performance.
                </n-tooltip>
              </div>
              <span class="slider-value">{{
                localPhotoLimit.toLocaleString()
              }}</span>
            </div>
            <n-slider
              :value="getPhotoLimitSliderIndex(localPhotoLimit)"
              @update:value="onPhotoLimitChange"
              :min="0"
              :max="3"
              :step="1"
              :marks="{ 0: '5k', 1: '10k', 2: '20k', 3: '50k' }"
              class="limit-slider"
              @click.stop
            />
          </div>
        </div>
      </div>

      <!-- Cluster Projections Section (patterns + collections) -->
      <div class="control-section">
        <div class="section-toggle" @click="togglePatternsSection">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-primary)">
              <RadarChartOutlined />
            </n-icon>
            <span class="section-toggle-label">Cluster Projections</span>
          </div>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: expandedSection === 'patterns' }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>

        <div
          class="expandable-content"
          :class="{ expanded: expandedSection === 'patterns' }"
        >
          <n-tabs
            v-model:value="projectionTab"
            type="segment"
            size="small"
            class="projection-tabs"
            @click.stop
          >
            <n-tab-pane name="patterns" tab="Patterns">
              <PatternsSection
                :patternsForCurrentChunk="patternsForCurrentChunk"
                :selectedPatternId="selectedPatternId"
                displayMode="list"
                @select-pattern="handlePatternClick"
                @fly-to-pattern="(p) => emit('fly-to-pattern', p)"
              />
            </n-tab-pane>
            <n-tab-pane name="collections" tab="Collections">
              <PatternsSection
                :patternsForCurrentChunk="collectionProjections"
                :selectedPatternId="selectedPatternId"
                displayMode="list"
                :showStrengthIcon="false"
                emptyMessage="No collections yet"
                searchable
                searchPlaceholder="Search collections"
                @select-pattern="handlePatternClick"
                @fly-to-pattern="(p) => emit('fly-to-pattern', p)"
              />
            </n-tab-pane>
          </n-tabs>
        </div>
      </div>

      <!-- Display Options Section -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleDisplayOptionsSection">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-primary)">
              <EyeOutlined />
            </n-icon>
            <span class="section-toggle-label">Display options</span>
          </div>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: expandedSection === 'displayOptions' }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>

        <div
          class="expandable-content"
          :class="{ expanded: expandedSection === 'displayOptions' }"
        >
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
        <div class="section-toggle" @click="toggleFiltersSection">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-primary)">
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
              :class="{ rotated: expandedSection === 'filters' }"
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

        <div
          class="expandable-content filters-container"
          :class="{ expanded: expandedSection === 'filters' }"
        >
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
            @tag-search="handleTagSearch"
            @text-search="(payload) => emit('text-search', payload)"
          />
        </div>
      </div>

      <!-- Tag Beacons Section -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleTagBeacons">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-primary)">
              <TagsOutlined />
            </n-icon>
            <span class="section-toggle-label">Tag Beacons</span>
          </div>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: showTagBeacons }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>

        <div v-if="showTagBeacons && hasTagBeacons" class="options-container">
          <div
            class="control-item"
            style="
              margin-top: 12px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            "
          >
            <label class="control-label" style="margin: 0"
              >Enable Beacons</label
            >
            <n-switch
              :value="tagBeaconsEnabled"
              @update:value="handleTagBeaconsToggle"
              size="small"
              @click.stop
            />
          </div>

          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Zone Cell Size
            </label>
            <div class="slider-container">
              <n-slider
                :value="tagBeaconsCellSize"
                @update:value="handleTagBeaconsCellSizeChange"
                :min="40"
                :max="240"
                :step="10"
                :marks="{ 40: '40', 120: '120', 240: '240' }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>

          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Max Beacons
            </label>
            <div class="slider-container">
              <n-slider
                :value="tagBeaconsMaxBeacons"
                @update:value="handleTagBeaconsMaxBeaconsChange"
                :min="0"
                :max="50"
                :step="1"
                :marks="{
                  0: '0',
                  10: '10',
                  20: '20',
                  30: '30',
                  40: '40',
                  50: '50',
                }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>

          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Top Tags per Zone
            </label>
            <div class="slider-container">
              <n-slider
                :value="tagBeaconsTopTags"
                @update:value="handleTagBeaconsTopTagsChange"
                :min="1"
                :max="5"
                :step="1"
                :marks="{ 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>

          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Merge Same Tag Radius
            </label>
            <div class="slider-container">
              <n-slider
                :value="tagBeaconsMergeRadius"
                @update:value="handleTagBeaconsMergeRadiusChange"
                :min="0"
                :max="300"
                :step="10"
                :marks="{ 0: '0', 50: '50', 150: '150', 300: '300' }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation Controls Section -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleNavigationControls">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-primary)">
              <CompassOutlined />
            </n-icon>
            <span class="section-toggle-label">Navigation Controls</span>
          </div>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: showNavigationControls }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>

        <!-- Navigation Controls Content -->
        <div v-if="showNavigationControls" class="controls-info">
          <div class="control-tip">
            <div class="control-icon-group">
              <div class="keyboard-keys-group">
                <div class="keyboard-key">W</div>
                <div class="keyboard-key">A</div>
                <div class="keyboard-key">S</div>
                <div class="keyboard-key">D</div>
              </div>
              <span class="control-text">Pan up/left/down/right</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <div class="keyboard-keys-group">
                <div class="keyboard-key">↑</div>
                <div class="keyboard-key">←</div>
                <div class="keyboard-key">↓</div>
                <div class="keyboard-key">→</div>
              </div>
              <span class="control-text">Arrow keys also work</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <span class="control-icon-text">🖱️</span>
              <span class="control-text">Mouse wheel to zoom in/out</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <span class="control-icon-text">👆</span>
              <span class="control-text">Click a photo to select it</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <div class="keyboard-keys-group">
                <div class="keyboard-key">{{ isMac ? "⌘ Cmd" : "Ctrl" }}</div>
              </div>
              <span class="control-text"
                >+&nbsp;drag to draw a selection rectangle</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { NTooltip, NIcon, NSwitch, NSlider, NTabs, NTabPane } from "naive-ui";
import {
  CloseOutlined,
  SettingOutlined,
  FilterOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  RadarChartOutlined,
  TagsOutlined,
  CompassOutlined,
  DatabaseOutlined,
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
  // User collections, shaped like patterns so they share the same list UI
  collectionProjections: {
    type: Array,
    default: () => [],
  },
  // Viewport limit
  photoLimit: {
    type: Number,
    default: 10000,
  },
  // Tag beacons
  hasTagBeacons: {
    type: Boolean,
    default: false,
  },
  tagBeaconsEnabled: {
    type: Boolean,
    default: false,
  },
  tagBeaconsCellSize: {
    type: Number,
    default: 40,
  },
  tagBeaconsMaxBeacons: {
    type: Number,
    default: 50,
  },
  tagBeaconsTopTags: {
    type: Number,
    default: 1,
  },
  tagBeaconsMergeRadius: {
    type: Number,
    default: 70,
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
  "fly-to-pattern",
  "tag-search",
  "text-search",
  "update:tagBeaconsEnabled",
  "update:tagBeaconsCellSize",
  "update:tagBeaconsMaxBeacons",
  "update:tagBeaconsTopTags",
  "update:tagBeaconsMergeRadius",
  "update:photoLimit",
  "viewport-limit-change",
]);

// Internal state
const isExpanded = computed({
  get: () => props.showConfigPanel,
  set: (value) => emit("update:showConfigPanel", value),
});

// Detect if user is on macOS
const isMac = computed(() => {
  return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
});

// Control which section is expanded (null, 'patterns', 'displayOptions', 'filters', 'navigation')
const expandedSection = ref(null);
const projectionTab = ref("patterns");
const clusteringSectionRef = ref(null);
const showNavigationControls = ref(false);
const showTagBeacons = ref(false);

// ---------------------------------------------------------------------------
// Viewport limit (max photos slider)
// ---------------------------------------------------------------------------
const PHOTO_LIMIT_VALUES = [5000, 10000, 20000, 50000];
const PHOTO_LIMIT_STORAGE_KEY = "photoreka:atlas2d:photoLimit";

const isValidPhotoLimit = (value) => PHOTO_LIMIT_VALUES.includes(value);

const readStoredPhotoLimit = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PHOTO_LIMIT_STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return isValidPhotoLimit(parsed) ? parsed : null;
};

const writeStoredPhotoLimit = (value) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PHOTO_LIMIT_STORAGE_KEY, String(value));
};

const localPhotoLimit = ref(readStoredPhotoLimit() ?? props.photoLimit);

onMounted(() => {
  const persisted = readStoredPhotoLimit();
  if (persisted !== null && persisted !== props.photoLimit) {
    localPhotoLimit.value = persisted;
    emit("update:photoLimit", persisted);
    emit("viewport-limit-change");
  }
});

watch(
  () => props.photoLimit,
  (v) => {
    localPhotoLimit.value = v;
  },
);

const getPhotoLimitSliderIndex = (value) => {
  const idx = PHOTO_LIMIT_VALUES.indexOf(value);
  return idx >= 0 ? idx : 0;
};

const onPhotoLimitChange = (index) => {
  localPhotoLimit.value = PHOTO_LIMIT_VALUES[index];
  writeStoredPhotoLimit(localPhotoLimit.value);
};

const emitPhotoLimit = () => {
  emit("update:photoLimit", localPhotoLimit.value);
  emit("viewport-limit-change");
};

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

// Watch for chunk changes to clear selected pattern.
// Collections are not chunk-scoped, so their selection survives a chunk change.
watch(
  () => props.selectedChunk,
  () => {
    if (props.selectedPatternId === null) return;
    const isCollection = props.collectionProjections.some(
      (c) => c.patternId === props.selectedPatternId,
    );
    if (!isCollection) {
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

// Toggle handlers - sections are mutually exclusive
const togglePatternsSection = () => {
  expandedSection.value =
    expandedSection.value === "patterns" ? null : "patterns";
};

const toggleDisplayOptionsSection = () => {
  expandedSection.value =
    expandedSection.value === "displayOptions" ? null : "displayOptions";
};

const toggleFiltersSection = () => {
  expandedSection.value =
    expandedSection.value === "filters" ? null : "filters";
};

const toggleTagBeacons = () => {
  showTagBeacons.value = !showTagBeacons.value;
  if (showTagBeacons.value) {
    expandedSection.value = null;
    showNavigationControls.value = false;
  }
};

const toggleNavigationControls = () => {
  showNavigationControls.value = !showNavigationControls.value;
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

const handleTagSearch = (tags) => {
  emit("tag-search", tags);
};

const handleTagBeaconsToggle = (value) => {
  emit("update:tagBeaconsEnabled", value);
};

const handleTagBeaconsCellSizeChange = (value) => {
  emit("update:tagBeaconsCellSize", value);
};

const handleTagBeaconsMaxBeaconsChange = (value) => {
  emit("update:tagBeaconsMaxBeacons", value);
};

const handleTagBeaconsTopTagsChange = (value) => {
  emit("update:tagBeaconsTopTags", value);
};

const handleTagBeaconsMergeRadiusChange = (value) => {
  emit("update:tagBeaconsMergeRadius", value);
};
</script>

<style scoped>
/* Collapsed panel button */
.collapsed-panel {
  --collapsed-panel-top: calc(var(--total-header-offset, 48px) - 17px);
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
  background: var(--bg-surface-hover);
}

/* Control panel */
.control-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 300px;
  max-height: calc(100vh - 32px);
  background: var(--bg-card);
  border-radius: 12px;
  padding: var(--config-panel-padding, 16px);
  z-index: 200;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-color);
}

.close-panel-btn-corner {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--icon-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-panel-btn-corner:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

/* Section styles */
.control-section {
  margin-bottom: var(--config-section-spacing, 16px);
  padding-bottom: var(--config-section-spacing, 16px);
  border-bottom: var(--config-section-divider, 1px solid var(--border-color));
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
  padding: var(--config-toggle-padding-y, 4px) 0;
  transition: opacity 0.2s;
  margin-bottom: var(--config-toggle-margin-bottom, 7px);
}

.section-toggle:hover {
  opacity: 0.8;
}

.section-toggle-label {
  color: var(--text-primary);
  font-size: var(--config-toggle-label-size, 13px);
  font-weight: var(--config-toggle-label-weight, 600);
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
  color: var(--icon-secondary);
  transition: transform 0.2s;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

/* Cluster projections tabs */
.projection-tabs {
  --n-tab-font-size: 12px;
}

.projection-tabs :deep(.n-tabs-tab) {
  font-size: 12px;
}

.projection-tabs :deep(.n-tab-pane) {
  padding: 10px 0 0 0;
}

/* Expandable content with smooth animation */
.expandable-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
  opacity: 0;
}

.expandable-content.expanded {
  max-height: 1000px;
  opacity: 1;
  transition:
    max-height 0.3s ease-out,
    opacity 0.3s ease-out;
}

/* Scrollbar styling */
.control-panel::-webkit-scrollbar {
  width: 6px;
}

.control-panel::-webkit-scrollbar-track {
  background: transparent;
}

.control-panel::-webkit-scrollbar-thumb {
  background: var(--border-color-hover);
  border-radius: 3px;
}

.control-panel::-webkit-scrollbar-thumb:hover {
  background: var(--icon-tertiary);
}

/* Navigation controls styles */
.controls-info {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 4px;
  padding: 12px;
  margin-top: 12px;
  animation: slideDown 0.3s ease-out;
}

.control-tip {
  margin: 8px 0;
  color: var(--text-secondary, #a0aec0);
  font-size: 12px;
  line-height: 1.4;
}

.control-tip:last-child {
  margin-bottom: 0;
}

.control-icon-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.control-icon-text {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.control-text {
  color: var(--text-secondary, #a0aec0);
  font-size: 12px;
  line-height: 1.3;
}

.keyboard-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 13px;
  height: 13px;
  padding: 2px 5px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color-hover);
  border-radius: 3px;
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 600;
  font-family: "Segoe UI", system-ui, sans-serif;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.15),
    inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
  text-shadow: 0 0.5px 0.5px rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

.keyboard-keys-group {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.control-tip-sub {
  margin-top: 2px;
  opacity: 0.7;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Viewport limit slider */
.section-content {
  display: flex;
  flex-direction: column;
  gap: var(--config-section-content-gap, 10px);
  padding: 5px;
}

.control-item-full {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.control-item-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
}

.slider-value {
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
}

.info-icon-small {
  cursor: help;
}

.limit-slider {
  --n-rail-color: var(--border-color);
  --n-rail-color-hover: var(--border-color-hover);
  --n-fill-color: var(--primary-color, #3b82f6);
  --n-fill-color-hover: var(--primary-color-hover, #2563eb);
  --n-handle-color: var(--primary-color, #3b82f6);
  --n-dot-color: var(--border-color-hover);
  --n-mark-font-size: 10px;
  --n-mark-color: var(--text-tertiary);
}
</style>
