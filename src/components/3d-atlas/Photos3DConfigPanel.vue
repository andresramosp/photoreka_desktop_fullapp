<template>
  <div>
    <!-- Collapsed Panel (Small Corner Button) -->
    <div
      v-if="!isExpanded"
      class="collapsed-panel"
      @click="isExpanded = true"
      @click.stop
      @touchstart.stop
      @touchmove.stop
      @touchend.stop
    >
      <n-icon class="settings-icon">
        <SettingOutlined />
      </n-icon>
    </div>

    <!-- Expanded Panel Content -->
    <div
      v-if="isExpanded"
      class="control-panel"
      @click.stop
      @wheel.stop
      @touchstart.stop
      @touchmove.stop
      @touchend.stop
    >
      <!-- Close Button (Top Right Corner) -->
      <button class="close-panel-btn-corner" @click="isExpanded = false">
        <n-icon>
          <CloseOutlined />
        </n-icon>
      </button>

      <!-- Clustering Type Section (Always Visible) -->
      <EmbeddingInfoModal3D v-model="showEmbeddingInfoModal3D" />
      <div class="control-section">
        <h4 class="section-title">
          <n-icon size="16" style="margin-right: 6px; vertical-align: middle">
            <AppsOutline />
          </n-icon>
          Clustering Type
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-icon
                size="15"
                color="var(--text-primary)"
                style="cursor: help; margin-left: 4px; margin-top: 2px"
                @click.stop="showEmbeddingInfoModal3D = true"
              >
                <InfoCircleOutlined />
              </n-icon>
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
                  :show-title="false"
                  @time-range-change="handleTimeRangeChange"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Display Options Toggle -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleDisplayOptions">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16">
              <EyeOutlined />
            </n-icon>
            <span class="section-toggle-label">Display Options</span>
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

        <!-- Display Options Content -->
        <div v-if="showDisplayOptions" class="options-container">
          <!-- 2D View Toggle -->
          <!-- <div
            class="control-item"
            style="
              margin-top: 12px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            "
          >
            <label class="control-label" style="margin: 0">2D View</label>
            <n-switch
              :value="outputDims === 2"
              @update:value="handleDimensionsToggle"
              size="small"
              @click.stop
            />
          </div> -->

          <!-- Grid Relaxation Toggle -->
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
              >Reduce overlaps</label
            >
            <n-switch
              :value="gridRelaxationEnabled"
              @update:value="handleGridRelaxationToggle"
              size="small"
              :disabled="showDiscreteLoader"
              @click.stop
            />
          </div>

          <!-- Radial Scaling Slider -->
          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Radial Scaling
            </label>
            <div class="slider-container">
              <n-slider
                :value="inflateFactor"
                @update:value="handleInflateFactorChange"
                :min="1"
                :max="3"
                :step="0.1"
                :marks="{ 1: '1x', 2: '2x', 3: '3x' }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>

          <!-- Floating Tags Toggle -->
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
              >Show Floating Tags</label
            >
            <n-switch
              :value="floatingTagsEnabled"
              @update:value="handleFloatingTagsToggle"
              size="small"
              @click.stop
            />
          </div>

          <!-- Detection Radius Slider -->
          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Tags Detection Radius
            </label>
            <div class="slider-container">
              <n-slider
                :value="floatingTagsDetectionRadius"
                @update:value="handleDetectionRadiusChange"
                :min="20"
                :max="150"
                :step="10"
                :marks="{ 20: '20', 50: '50', 100: '100', 150: '150' }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>

          <!-- Max Tags Slider -->
          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Max Tags to Show
            </label>
            <div class="slider-container">
              <n-slider
                :value="floatingTagsMaxTags"
                @update:value="handleMaxTagsChange"
                :min="5"
                :max="30"
                :step="5"
                :marks="{ 5: '5', 15: '15', 30: '30' }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>

          <!-- Tour Pause Duration Slider -->
          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Photo Tour Pause Duration
            </label>
            <div class="slider-container">
              <n-slider
                :value="tourPauseDuration"
                @update:value="handleTourPauseDurationChange"
                :min="100"
                :max="3000"
                :step="100"
                :format-tooltip="(value) => `${value / 1000}s`"
                :marks="{
                  100: '0.1s',
                  500: '0.5s',
                  1000: '1s',
                  2000: '2s',
                  3000: '3s',
                }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Tag Beacons Toggle -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleTagBeacons">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16">
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

      <!-- Navigation Controls Toggle -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleNavigationControls">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16">
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
          <!-- Desktop Controls -->
          <template v-if="!hasTouch">
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">🖱️</span>
                <span class="control-text"
                  >Right-click on stage to activate camera</span
                >
              </div>
            </div>
            <div v-if="!isPlayground" class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">👆</span>
                <span class="control-text">{{ navigationHintText }}</span>
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">🖱️⚙️</span>
                <span class="control-text">Accelerate movement speed</span>
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <div class="keyboard-key">Esc</div>
                <span class="control-text">Return to normal mouse</span>
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <div class="keyboard-keys-group">
                  <div class="keyboard-key">W</div>
                  <div class="keyboard-key">A</div>
                  <div class="keyboard-key">S</div>
                  <div class="keyboard-key">D</div>
                </div>
                <span class="control-text">Forward/back/left/right</span>
              </div>
            </div>

            <div class="control-tip">
              <div class="control-icon-group">
                <div class="keyboard-key">F</div>
                <span class="control-text">Move up</span>
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <div class="keyboard-key">V</div>
                <span class="control-text">Move down</span>
              </div>
            </div>
          </template>

          <!-- Touch Controls (Mobile) -->
          <template v-else>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">☝️</span>
                <span class="control-text"
                  >One finger drag to rotate camera view</span
                >
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">🤏</span>
                <span class="control-text"
                  >Two finger pinch to move forward/backward</span
                >
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">✌️</span>
                <span class="control-text"
                  >Two finger drag to move left/right/forward/back</span
                >
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">💡</span>
                <span class="control-text"
                  >Combine gestures for smooth navigation</span
                >
              </div>
            </div>
          </template>

          <!-- Navigate by Click Toggle -->
          <div
            v-if="!isPlayground"
            class="control-item"
            style="
              margin-top: 16px;
              padding-top: 16px;
              border-top: 1px solid rgba(255, 255, 255, 0.1);
            "
          >
            <span class="control-label">
              Select by click
              <n-tooltip trigger="hover" placement="top">
                <template #trigger>
                  <n-icon
                    size="12"
                    color="var(--text-secondary)"
                    style="cursor: help; margin-left: 4px"
                  >
                    <InfoCircleFilled />
                  </n-icon>
                </template>
                Click photos to select/deselect them
              </n-tooltip>
            </span>
            <n-switch
              :value="selectByClick"
              @update:value="handleSelectByClickChange"
              :disabled="showDiscreteLoader"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
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
  TagsOutlined,
  CompassOutlined,
  InfoCircleOutlined,
} from "@vicons/antd";
import { AppsOutline } from "@vicons/ionicons5";
import TimeRangeFilter from "@/components/TimeRangeFilter.vue";
import { visualAspectsOptions } from "@/stores/searchStore.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import EmbeddingInfoModal3D from "./EmbeddingInfoModal3D.vue";

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
  outputDims: {
    type: Number,
    default: 3,
  },
  inflateFactor: {
    type: Number,
    default: 1,
  },
  gridRelaxationEnabled: {
    type: Boolean,
    default: true,
  },
  floatingTagsEnabled: {
    type: Boolean,
    default: true,
  },
  floatingTagsDetectionRadius: {
    type: Number,
    default: 50,
  },
  floatingTagsMaxTags: {
    type: Number,
    default: 15,
  },
  tourPauseDuration: {
    type: Number,
    default: 500,
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
    default: 120,
  },
  tagBeaconsMaxBeacons: {
    type: Number,
    default: 20,
  },
  tagBeaconsTopTags: {
    type: Number,
    default: 3,
  },
  tagBeaconsMergeRadius: {
    type: Number,
    default: 150,
  },
  // Navigation
  hasTouch: {
    type: Boolean,
    default: false,
  },
  isPlayground: {
    type: Boolean,
    default: false,
  },
  selectByClick: {
    type: Boolean,
    default: false,
  },
  navigationHintText: {
    type: String,
    default: "Left-click on photos to fly to them",
  },
});

// Emits
const emit = defineEmits([
  "update:showConfigPanel",
  "update:selectedChunk",
  "update:selectedVisualAspects",
  "update:artisticScoreFilters",
  "update:timeRangeFilter",
  "update:outputDims",
  "update:inflateFactor",
  "update:gridRelaxationEnabled",
  "update:floatingTagsEnabled",
  "update:floatingTagsDetectionRadius",
  "update:floatingTagsMaxTags",
  "update:tourPauseDuration",
  "update:tagBeaconsEnabled",
  "update:tagBeaconsCellSize",
  "update:tagBeaconsMaxBeacons",
  "update:tagBeaconsTopTags",
  "update:tagBeaconsMergeRadius",
  "update:selectByClick",
  "chunk-change",
  "visual-aspects-change",
  "artistic-scores-change",
  "time-range-change",
  "dimensions-change",
  "inflate-factor-change",
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
const showTagBeacons = ref(false);
const showEmbeddingInfoModal3D = ref(false);

// Local state for artistic score filters
const localArtisticScoreFilters = ref({ ...props.artisticScoreFilters });

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

const activeFiltersCount = computed(() => {
  let count = 0;
  if (props.selectedVisualAspects.length > 0)
    count += props.selectedVisualAspects.length;
  if (Object.keys(props.artisticScoreFilters).length > 0)
    count += Object.keys(props.artisticScoreFilters).length;
  if (props.searchResults.length > 0) count += 1;
  if (props.timeRangeFilter !== null) count += 1;
  return count;
});

// Toggle functions
const toggleMoreFilters = () => {
  showMoreFilters.value = !showMoreFilters.value;
  if (showMoreFilters.value) {
    showDisplayOptions.value = false;
    showNavigationControls.value = false;
  }
};

const toggleDisplayOptions = () => {
  showDisplayOptions.value = !showDisplayOptions.value;
  if (showDisplayOptions.value) {
    showMoreFilters.value = false;
    showNavigationControls.value = false;
  }
};

const toggleNavigationControls = () => {
  showNavigationControls.value = !showNavigationControls.value;
  if (showNavigationControls.value) {
    showMoreFilters.value = false;
    showDisplayOptions.value = false;
  }
};

const toggleTagBeacons = () => {
  showTagBeacons.value = !showTagBeacons.value;
  if (showTagBeacons.value) {
    showMoreFilters.value = false;
    showDisplayOptions.value = false;
    showNavigationControls.value = false;
  }
};

// Handlers
const handleChunkChange = (value) => {
  emit("update:selectedChunk", value);
  emit("chunk-change", value);
};

const handleVisualAspectsChange = (value) => {
  emit("update:selectedVisualAspects", value);
  emit("visual-aspects-change", value);
};

const handleArtisticScoreChange = (criterion, value) => {
  localArtisticScoreFilters.value[criterion] = value;
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

const handleDimensionsToggle = (value) => {
  const newDims = value ? 2 : 3; // true = 2D, false = 3D
  emit("update:outputDims", newDims);
  emit("dimensions-change", newDims);
};

const handleInflateFactorChange = (value) => {
  emit("update:inflateFactor", value);
  emit("inflate-factor-change", value);
};

const handleGridRelaxationToggle = (value) => {
  emit("update:gridRelaxationEnabled", value);
};

const handleFloatingTagsToggle = (value) => {
  emit("update:floatingTagsEnabled", value);
};

const handleDetectionRadiusChange = (value) => {
  emit("update:floatingTagsDetectionRadius", value);
};

const handleMaxTagsChange = (value) => {
  emit("update:floatingTagsMaxTags", value);
};

const handleTourPauseDurationChange = (value) => {
  emit("update:tourPauseDuration", value);
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

const handleSelectByClickChange = (value) => {
  emit("update:selectByClick", value);
};
</script>

<style scoped>
.control-panel {
  background: var(--bg-container);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  width: 350px;
  max-height: 85vh;
  overflow-y: auto;
  overflow-x: hidden;
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: fixed;
  right: 15px;
  top: 15px;
  z-index: 2000;
  pointer-events: auto;
}

@media (max-width: 767px) {
  .control-panel {
    min-width: 280px;
    max-width: calc(100vw - 10px);
    max-height: 80vh;
    top: 5px;
    right: 5px;
    padding: 8px;
  }

  .control-section {
    padding: 10px;
  }

  .section-title {
    font-size: 13px;
  }

  .control-label {
    font-size: 11px;
  }
}

.control-section {
  padding: var(--spacing-md);
}

.control-section:not(:last-child) {
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
}

.section-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.control-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.control-item:last-child {
  margin-bottom: 0;
}

.control-item-full {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.control-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium, 500);
}

.section-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  cursor: pointer;
  padding: 8px 0;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.section-toggle:hover {
  background-color: rgba(255, 255, 255, 0.03);
}

.section-toggle-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.section-toggle-indicators {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toggle-icon {
  color: rgba(255, 255, 255, 0.5);
  transition: transform 0.3s ease;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

.filters-container {
  margin-top: 12px;
  animation: slideDown 0.3s ease-out;
}

.filters-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.artistic-scores-sliders {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 8px;
  padding-left: 8px;
  margin-top: 12px;
  animation: slideDown 0.3s ease-out;
}

.time-range-container {
  padding-right: 8px;
  padding-left: 8px;
  margin-top: 12px;
  animation: slideDown 0.3s ease-out;
}

.scores-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  padding: 8px 0;
  transition: opacity 0.2s ease;
}

.scores-toggle:hover {
  opacity: 0.8;
}

.scores-toggle-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.score-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.score-group-header {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  margin-bottom: 4px;
}

.clear-scores-btn {
  background: rgba(239, 68, 68, 0.15);
  border: none;
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
}

.clear-scores-btn:hover {
  background: rgba(239, 68, 68, 0.25);
}

.clear-scores-btn .n-icon {
  color: rgba(239, 68, 68, 0.9);
}

.options-container {
  margin-top: 0px;
  animation: slideDown 0.3s ease-out;
  display: flex;
  flex-direction: column;
}

@media (max-width: 767px) {
  .collapsed-panel {
    top: 5px;
    right: 5px;
    width: 42px;
    height: 42px;
  }

  .collapsed-panel .settings-icon {
    font-size: 18px;
  }
}

.collapsed-panel:hover {
  background: rgba(35, 35, 40, 0.95);
  border-color: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.collapsed-panel .settings-icon {
  color: #ffffff;
  font-size: 20px;
  transition: color 0.2s ease;
}

.close-panel-btn-corner {
  position: absolute;
  top: 3px;
  right: 3px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  z-index: 10;
}

.close-panel-btn-corner:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.embedding-select,
.aspects-select,
.text-search-input {
  width: 100%;
}

.slider-container {
  width: 100%;
  padding: 0 8px 0 4px;
  box-sizing: border-box;
}

.radial-slider {
  width: 100%;
}

.radial-slider :deep(.n-slider-marks) {
  padding: 0 2px;
}

.radial-slider :deep(.n-slider-mark) {
  font-size: 9px !important;
  white-space: nowrap;
  overflow: visible;
  color: rgba(255, 255, 255, 0.8) !important;
}

.radial-slider :deep(.n-slider-mark-text) {
  font-size: 9px !important;
  transform: translateX(-50%);
  max-width: 60px;
  text-align: center;
  color: rgba(255, 255, 255, 0.8) !important;
}

.radial-slider :deep(.n-slider-mark:first-child .n-slider-mark-text) {
  transform: translateX(0);
  text-align: left;
}

.radial-slider :deep(.n-slider-mark:last-child .n-slider-mark-text) {
  transform: translateX(-100%);
  text-align: right;
}

.controls-info {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
  margin-top: 12px;
  animation: slideDown 0.3s ease-out;
}

.control-tip {
  margin: var(--spacing-sm) 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
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
  color: var(--text-secondary);
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
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.12),
    rgba(255, 255, 255, 0.04)
  );
  border: 1px solid rgba(255, 255, 255, 0.18);
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

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
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
</style>
