<template>
  <!-- Desktop: collapsed trigger or expanded panel -->
  <template v-if="!isMobile">
    <div
      v-if="!isExpanded"
      class="collapsed-panel"
      title="Map filters"
      @click.stop="isExpanded = true"
    >
      <n-icon class="settings-icon">
        <SettingOutlined />
      </n-icon>
    </div>

    <div
      v-else
      class="control-panel shared-config-panel"
      @click.stop
      @wheel.stop
    >
      <!-- Close button -->
      <button class="close-panel-btn-corner" @click="isExpanded = false">
        <n-icon><CloseOutlined /></n-icon>
      </button>

      <!-- Panel title -->
      <div class="panel-title">
        <n-icon
          size="14"
          color="var(--text-primary)"
          style="margin-right: 6px; vertical-align: middle"
        >
          <FilterOutlined />
        </n-icon>
        Filters
        <span
          v-if="activeFiltersCount > 0"
          class="active-indicator"
          style="margin-left: 6px"
          >{{ activeFiltersCount }}</span
        >
      </div>

      <!-- Location source -->
      <div class="filter-group">
        <div class="filter-label">
          Location source
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <button
                class="info-icon-btn"
                type="button"
                aria-label="About location source"
              >
                <n-icon size="14" color="var(--text-primary)"
                  ><InfoCircleOutlined
                /></n-icon>
              </button>
            </template>
            Camera GPS: only photos with device GPS data.<br />
            AI Inferred: all AI-inferred locations regardless of confidence
            level.
          </n-tooltip>
        </div>
        <div class="filter-btn-group">
          <button
            class="filter-btn"
            :class="{ active: confidenceFilter.includes('gps') }"
            title="Camera GPS coordinates"
            @click="toggleConfidence('gps')"
          >
            GPS
          </button>
          <button
            class="filter-btn"
            :class="{
              active:
                confidenceFilter.includes('very_likely') ||
                confidenceFilter.includes('likely') ||
                confidenceFilter.includes('uncertain'),
            }"
            title="All AI-inferred locations (any confidence)"
            @click="toggleAiInferred()"
          >
            AI Inferred
          </button>
        </div>
      </div>

      <!-- Location detail -->
      <div
        class="filter-group last"
        :class="{ 'filter-group-disabled': !granularityEnabled }"
      >
        <div class="filter-label">
          Location detail
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <button
                class="info-icon-btn"
                type="button"
                aria-label="About location detail"
              >
                <n-icon size="14" color="var(--text-primary)"
                  ><InfoCircleOutlined
                /></n-icon>
              </button>
            </template>
            Place: highest precision, place-level.<br />
            City: photos pinned to a specific city.<br />
            Region: photos identified at region level.<br />
            Country: only the country was identified.<br />
            <em>Applies only when AI sources are selected.</em>
          </n-tooltip>
        </div>
        <div class="filter-btn-group">
          <button
            class="filter-btn filter-btn--place"
            :class="{ active: granularityFilter.includes('place') }"
            :disabled="!granularityEnabled"
            title="Place-level precision"
            @click="granularityEnabled && toggleGranularity('place')"
          >
            <span class="granularity-dot granularity-dot--place" />
            Place
          </button>
          <button
            class="filter-btn filter-btn--city"
            :class="{ active: granularityFilter.includes('city') }"
            :disabled="!granularityEnabled"
            title="City precision"
            @click="granularityEnabled && toggleGranularity('city')"
          >
            <span class="granularity-dot granularity-dot--city" />
            City
          </button>
          <button
            class="filter-btn filter-btn--region"
            :class="{ active: granularityFilter.includes('region') }"
            :disabled="!granularityEnabled"
            title="Region precision"
            @click="granularityEnabled && toggleGranularity('region')"
          >
            <span class="granularity-dot granularity-dot--region" />
            Region
          </button>
          <button
            class="filter-btn filter-btn--country"
            :class="{ active: granularityFilter.includes('country') }"
            :disabled="!granularityEnabled"
            title="Country-level AI locations"
            @click="granularityEnabled && toggleGranularity('country')"
          >
            <span class="granularity-dot granularity-dot--country" />
            Country
          </button>
        </div>
      </div>

      <!-- Search Filters Section -->
      <div class="control-section">
        <div
          class="section-toggle"
          @click="showSearchFilters = !showSearchFilters"
        >
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-primary)">
              <FilterOutlined />
            </n-icon>
            <span class="section-toggle-label">Search Filters</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px">
            <span
              v-if="searchFiltersActiveCount > 0"
              class="active-indicator"
              >{{ searchFiltersActiveCount }}</span
            >
            <n-icon
              size="12"
              class="toggle-icon"
              :class="{ rotated: showSearchFilters }"
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

        <div v-if="showSearchFilters" class="search-filters-content">
          <!-- Visual Aspects -->
          <div class="filter-item">
            <label class="filter-item-label">Visual Aspects</label>
            <n-tree-select
              :value="selectedVisualAspects"
              v-model:show="visualAspectsDropdownShow"
              @update:value="handleVisualAspectsChange"
              multiple
              clearable
              placeholder="Any aspect"
              :options="treeSelectOptions"
              :max-tag-count="2"
              size="small"
              check-strategy="child"
              :show-path="false"
              expand-on-click
              :filterable="false"
              @click.stop
              @keydown.stop
              @keyup.stop
            >
              <template #empty>
                <div
                  style="
                    padding: 8px;
                    color: var(--text-secondary);
                    font-size: 12px;
                  "
                >
                  No visual aspects found
                </div>
              </template>
            </n-tree-select>
          </div>

          <!-- Visual Scores -->
          <div class="filter-item">
            <div
              class="filter-sub-toggle"
              @click="showArtisticScores = !showArtisticScores"
            >
              <span class="filter-item-label">Visual Scores</span>
              <div style="display: flex; align-items: center; gap: 6px">
                <button
                  v-if="Object.keys(localArtisticScoreFilters).length > 0"
                  class="clear-filter-btn"
                  title="Clear all scores"
                  @click.stop="clearArtisticScores"
                >
                  <n-icon size="11" color="var(--text-secondary)">
                    <CloseOutlined />
                  </n-icon>
                </button>
                <n-icon
                  size="12"
                  class="toggle-icon"
                  color="var(--icon-secondary)"
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
                  <ScoreOperatorSlider
                    :label="formatCriterionName(criterion.value)"
                    :model-value="
                      localArtisticScoreFilters[criterion.value] ?? null
                    "
                    @update:model-value="
                      (v: any) => handleArtisticScoreChange(criterion.value, v)
                    "
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Time Range -->
          <div class="filter-item">
            <div
              class="filter-sub-toggle"
              @click="showTimeRange = !showTimeRange"
            >
              <span class="filter-item-label">Time Range</span>
              <div style="display: flex; align-items: center; gap: 6px">
                <button
                  v-if="timeRangeFilter !== null"
                  class="clear-filter-btn"
                  title="Clear time range"
                  @click.stop="clearTimeRange"
                >
                  <n-icon size="11" color="var(--text-secondary)">
                    <CloseOutlined />
                  </n-icon>
                </button>
                <n-icon
                  size="12"
                  class="toggle-icon"
                  color="var(--icon-secondary)"
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
            <div v-if="showTimeRange" class="time-range-container">
              <TimeRangeFilter
                :photos="processedPhotos"
                :show-title="false"
                :current-time-range="timeRangeFilter"
                @time-range-change="handleTimeRangeChange"
                :histogram-height="'40px'"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation Controls Section -->
      <div class="control-section">
        <div
          class="section-toggle"
          @click="showNavigationControls = !showNavigationControls"
        >
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

        <div v-if="showNavigationControls" class="controls-info">
          <div class="control-tip">
            <div class="control-icon-group">
              <span class="control-icon-text">🖱️</span>
              <span class="control-text">Drag to pan the map</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <span class="control-icon-text">🖱️</span>
              <span class="control-text">Scroll to zoom in / out</span>
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
  </template>

  <!-- Mobile: floating button bar + drop-down modal -->
  <template v-if="isMobile">
    <div class="mobile-bar">
      <button
        class="mobile-config-btn"
        :class="{ active: mobileModal === 'filters' }"
        @click.stop="mobileModal = mobileModal === 'filters' ? null : 'filters'"
      >
        <n-icon size="16"><FilterOutlined /></n-icon>
        <span>Filters</span>
        <span v-if="activeFiltersCount > 0" class="mobile-badge">{{
          activeFiltersCount
        }}</span>
      </button>
    </div>

    <div
      v-if="mobileModal === 'filters'"
      class="mobile-modal"
      @click.stop="mobileModal = null"
    >
      <div class="mobile-modal-content" @click.stop>
        <div class="mobile-modal-header">
          <h3 class="mobile-modal-title">
            <n-icon size="18" style="vertical-align: middle; margin-right: 6px">
              <FilterOutlined />
            </n-icon>
            Filters
          </h3>
          <button class="mobile-modal-close" @click="mobileModal = null">
            <n-icon size="18"><CloseOutlined /></n-icon>
          </button>
        </div>
        <div class="mobile-modal-body">
          <!-- Location source -->
          <div class="filter-group">
            <div class="filter-label">
              Location source
              <n-tooltip trigger="hover" placement="top">
                <template #trigger>
                  <button
                    class="info-icon-btn"
                    type="button"
                    aria-label="About location source"
                  >
                    <n-icon size="14" color="var(--text-primary)"
                      ><InfoCircleOutlined
                    /></n-icon>
                  </button>
                </template>
                Camera GPS: only photos with device GPS data.<br />
                AI Inferred: all AI-inferred locations regardless of confidence
                level.
              </n-tooltip>
            </div>
            <div class="filter-btn-group">
              <button
                class="filter-btn"
                :class="{ active: confidenceFilter.includes('gps') }"
                title="Camera GPS coordinates"
                @click="toggleConfidence('gps')"
              >
                GPS
              </button>
              <button
                class="filter-btn"
                :class="{
                  active:
                    confidenceFilter.includes('very_likely') ||
                    confidenceFilter.includes('likely') ||
                    confidenceFilter.includes('uncertain'),
                }"
                title="All AI-inferred locations (any confidence)"
                @click="toggleAiInferred()"
              >
                AI Inferred
              </button>
            </div>
          </div>

          <!-- Location detail -->
          <div
            class="filter-group last"
            :class="{ 'filter-group-disabled': !granularityEnabled }"
          >
            <div class="filter-label">
              Location detail
              <n-tooltip trigger="hover" placement="top">
                <template #trigger>
                  <button
                    class="info-icon-btn"
                    type="button"
                    aria-label="About location detail"
                  >
                    <n-icon size="14" color="var(--text-primary)"
                      ><InfoCircleOutlined
                    /></n-icon>
                  </button>
                </template>
                Place: highest precision, place-level.<br />
                City: photos pinned to a specific city.<br />
                Region: photos identified at region level.<br />
                Country: only the country was identified.<br />
                <em>Applies only when AI sources are selected.</em>
              </n-tooltip>
            </div>
            <div class="filter-btn-group">
              <button
                class="filter-btn filter-btn--place"
                :class="{ active: granularityFilter.includes('place') }"
                :disabled="!granularityEnabled"
                title="Place-level precision"
                @click="granularityEnabled && toggleGranularity('place')"
              >
                <span class="granularity-dot granularity-dot--place" />
                Place
              </button>
              <button
                class="filter-btn filter-btn--city"
                :class="{ active: granularityFilter.includes('city') }"
                :disabled="!granularityEnabled"
                title="City precision"
                @click="granularityEnabled && toggleGranularity('city')"
              >
                <span class="granularity-dot granularity-dot--city" />
                City
              </button>
              <button
                class="filter-btn filter-btn--region"
                :class="{ active: granularityFilter.includes('region') }"
                :disabled="!granularityEnabled"
                title="Region precision"
                @click="granularityEnabled && toggleGranularity('region')"
              >
                <span class="granularity-dot granularity-dot--region" />
                Region
              </button>
              <button
                class="filter-btn filter-btn--country"
                :class="{ active: granularityFilter.includes('country') }"
                :disabled="!granularityEnabled"
                title="Country-level AI locations"
                @click="granularityEnabled && toggleGranularity('country')"
              >
                <span class="granularity-dot granularity-dot--country" />
                Country
              </button>
            </div>
          </div>

          <!-- Search Filters Section -->
          <div class="control-section">
            <div
              class="section-toggle"
              @click="showSearchFilters = !showSearchFilters"
            >
              <div style="display: flex; align-items: center; gap: 6px">
                <n-icon size="16" color="var(--text-primary)">
                  <FilterOutlined />
                </n-icon>
                <span class="section-toggle-label">Search Filters</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px">
                <span
                  v-if="searchFiltersActiveCount > 0"
                  class="active-indicator"
                  >{{ searchFiltersActiveCount }}</span
                >
                <n-icon
                  size="12"
                  class="toggle-icon"
                  :class="{ rotated: showSearchFilters }"
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

            <div v-if="showSearchFilters" class="search-filters-content">
              <!-- Visual Aspects -->
              <div class="filter-item">
                <label class="filter-item-label">Visual Aspects</label>
                <n-tree-select
                  :value="selectedVisualAspects"
                  v-model:show="visualAspectsDropdownShow"
                  @update:value="handleVisualAspectsChange"
                  multiple
                  clearable
                  placeholder="Any aspect"
                  :options="treeSelectOptions"
                  :max-tag-count="2"
                  size="small"
                  check-strategy="child"
                  :show-path="false"
                  expand-on-click
                  :filterable="false"
                  @click.stop
                  @keydown.stop
                  @keyup.stop
                >
                  <template #empty>
                    <div
                  style="
                    padding: 8px;
                    color: var(--text-secondary);
                    font-size: 12px;
                  "
                >
                      No visual aspects found
                    </div>
                  </template>
                </n-tree-select>
              </div>

              <!-- Visual Scores -->
              <div class="filter-item">
                <div
                  class="filter-sub-toggle"
                  @click="showArtisticScores = !showArtisticScores"
                >
                  <span class="filter-item-label">Visual Scores</span>
                  <div style="display: flex; align-items: center; gap: 6px">
                    <button
                      v-if="Object.keys(localArtisticScoreFilters).length > 0"
                      class="clear-filter-btn"
                      title="Clear all scores"
                      @click.stop="clearArtisticScores"
                    >
                      <n-icon size="11" color="var(--text-secondary)">
                        <CloseOutlined />
                      </n-icon>
                    </button>
                    <n-icon
                      size="12"
                      class="toggle-icon"
                      color="var(--icon-secondary)"
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
                      <ScoreOperatorSlider
                        :label="formatCriterionName(criterion.value)"
                        :model-value="
                          localArtisticScoreFilters[criterion.value] ?? null
                        "
                        @update:model-value="
                          (v: any) =>
                            handleArtisticScoreChange(criterion.value, v)
                        "
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Time Range -->
              <div class="filter-item">
                <div
                  class="filter-sub-toggle"
                  @click="showTimeRange = !showTimeRange"
                >
                  <span class="filter-item-label">Time Range</span>
                  <div style="display: flex; align-items: center; gap: 6px">
                    <button
                      v-if="timeRangeFilter !== null"
                      class="clear-filter-btn"
                      title="Clear time range"
                      @click.stop="clearTimeRange"
                    >
                      <n-icon size="11" color="var(--text-secondary)">
                        <CloseOutlined />
                      </n-icon>
                    </button>
                    <n-icon
                      size="12"
                      class="toggle-icon"
                      color="var(--icon-secondary)"
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
                <div v-if="showTimeRange" class="time-range-container">
                  <TimeRangeFilter
                    :photos="processedPhotos"
                    :show-title="false"
                    :current-time-range="timeRangeFilter"
                    @time-range-change="handleTimeRangeChange"
                    :histogram-height="'40px'"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Navigation Controls Section -->
          <div class="control-section">
            <div
              class="section-toggle"
              @click="showNavigationControls = !showNavigationControls"
            >
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

            <div v-if="showNavigationControls" class="controls-info">
              <div class="control-tip">
                <div class="control-icon-group">
                  <span class="control-icon-text">🖱️</span>
                  <span class="control-text">Drag to pan the map</span>
                </div>
              </div>
              <div class="control-tip">
                <div class="control-icon-group">
                  <span class="control-icon-text">🖱️</span>
                  <span class="control-text">Scroll to zoom in / out</span>
                </div>
              </div>
              <div class="control-tip">
                <div class="control-icon-group">
                  <div class="keyboard-keys-group">
                    <div class="keyboard-key">
                      {{ isMac ? "⌘ Cmd" : "Ctrl" }}
                    </div>
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
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { NIcon, NTooltip, NTreeSelect } from "naive-ui";
import {
  CloseOutlined,
  SettingOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  CompassOutlined,
} from "@vicons/antd";
import { useIsMobile } from "@/composables/useIsMobile.js";
import TimeRangeFilter from "@/components/TimeRangeFilter.vue";
import ScoreOperatorSlider from "@/components/controls/ScoreOperatorSlider.vue";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { useSearchStore } from "@/stores/searchStore.js";
import { useUserStore } from "@/stores/userStore";

// ── Props & emits ────────────────────────────────────────────────────────────

type ConfidenceLevel = "gps" | "very_likely" | "likely" | "uncertain";
type GranularityLevel = "place" | "city" | "region" | "country";

type ConfidenceFilter = ConfidenceLevel[];
type GranularityFilter = GranularityLevel[];

const props = defineProps<{
  confidenceFilter: ConfidenceFilter;
  granularityFilter: GranularityFilter;
  selectedVisualAspects: string[];
  artisticScoreFilters: Record<string, any>;
  timeRangeFilter: [number, number] | null;
  processedPhotos: any[];
}>();

const emit = defineEmits<{
  "update:confidenceFilter": [value: ConfidenceFilter];
  "update:granularityFilter": [value: GranularityFilter];
  "update:selectedVisualAspects": [value: string[]];
  "update:artisticScoreFilters": [value: Record<string, any>];
  "update:timeRangeFilter": [value: [number, number] | null];
}>();

// ── Internal UI state ────────────────────────────────────────────────────────

const { isMobile } = useIsMobile();
const isExpanded = ref(false);
const mobileModal = ref<string | null>(null);
const showNavigationControls = ref(false);
const showSearchFilters = ref(false);
const showArtisticScores = ref(false);
const showTimeRange = ref(false);
const visualAspectsDropdownShow = ref(false);
const localArtisticScoreFilters = ref<Record<string, any>>({
  ...props.artisticScoreFilters,
});
watch(
  () => props.artisticScoreFilters,
  (newVal) => {
    localArtisticScoreFilters.value = { ...newVal };
  },
  { deep: true },
);

const isMac = computed(
  () => navigator.platform.toUpperCase().indexOf("MAC") >= 0,
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toggleConfidence(val: ConfidenceLevel) {
  const set = new Set(props.confidenceFilter);
  if (set.has(val)) set.delete(val);
  else set.add(val);
  emit("update:confidenceFilter", [...set]);
}

function toggleAiInferred() {
  const set = new Set(props.confidenceFilter);
  const hasAny =
    set.has("very_likely") || set.has("likely") || set.has("uncertain");
  if (hasAny) {
    set.delete("very_likely");
    set.delete("likely");
    set.delete("uncertain");
  } else {
    set.add("very_likely");
    set.add("likely");
    set.add("uncertain");
  }
  emit("update:confidenceFilter", [...set]);
}

function toggleGranularity(val: GranularityLevel) {
  const set = new Set(props.granularityFilter);
  if (set.has(val)) set.delete(val);
  else set.add(val);
  emit("update:granularityFilter", [...set]);
}

// ── Search filter handlers ────────────────────────────────────────────────────

function handleVisualAspectsChange(value: string[]) {
  if (isMobile.value) visualAspectsDropdownShow.value = false;
  emit("update:selectedVisualAspects", value ?? []);
}

function handleArtisticScoreChange(key: string, filterVal: any) {
  if (!filterVal) {
    delete localArtisticScoreFilters.value[key];
  } else {
    localArtisticScoreFilters.value[key] = filterVal;
  }
  emit("update:artisticScoreFilters", { ...localArtisticScoreFilters.value });
}

function clearArtisticScores() {
  localArtisticScoreFilters.value = {};
  emit("update:artisticScoreFilters", {});
}

function handleTimeRangeChange(range: [number, number] | null) {
  emit("update:timeRangeFilter", range);
}

function clearTimeRange() {
  emit("update:timeRangeFilter", null);
}

// ── Computed ─────────────────────────────────────────────────────────────────

const granularityEnabled = computed(() =>
  props.confidenceFilter.some((f) => f !== "gps"),
);

const searchFiltersActiveCount = computed(() => {
  let count = 0;
  if (props.selectedVisualAspects.length > 0) count++;
  if (Object.keys(localArtisticScoreFilters.value).length > 0) count++;
  if (props.timeRangeFilter !== null) count++;
  return count;
});

const activeFiltersCount = computed(
  () =>
    props.confidenceFilter.length +
    props.granularityFilter.length +
    searchFiltersActiveCount.value,
);

const { artisticScores, formatCriterionName } = useArtisticScores({
  profile: () => useUserStore().user?.profiles,
});
const artisticScoresGroups = artisticScores;

const _searchStore = useSearchStore();
const treeSelectOptions = computed(() =>
  _searchStore.visualAspectsOptionsForProfile.map((group: any) => ({
    label: group.label,
    key: group.key,
    disabled: false,
    checkable: false,
    children: group.children.map((child: any) => ({
      label: child.label,
      key: child.value,
      disabled: false,
      checkable: true,
    })),
  })),
);
</script>

<style scoped>
/* ── Desktop: collapsed trigger ─────────────────────────────────────────── */

.collapsed-panel {
  --collapsed-panel-top: calc(var(--total-header-offset, 48px) - 17px);
  --collapsed-panel-right: 15px;
  --collapsed-panel-size: 48px;
  --collapsed-panel-z-index: 1000;
  --collapsed-panel-background: var(--bg-card);
  --collapsed-panel-backdrop: blur(8px);
  --collapsed-panel-border: 1px solid var(--border-color);
  --collapsed-panel-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  --collapsed-panel-background-hover: var(--bg-surface-hover);
  --collapsed-panel-hover-transform: none;
  --collapsed-panel-shadow-hover: 0 2px 12px rgba(0, 0, 0, 0.3);
  --collapsed-panel-icon-color: var(--icon-primary);
  --collapsed-panel-icon-size: 20px;
}

/* ── Desktop: expanded panel ────────────────────────────────────────────── */

.control-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 325px;
  max-height: calc(100% - 32px);
  background: var(--bg-card);
  border-radius: 12px;
  padding: var(--config-panel-padding, 16px);
  z-index: 1000;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 16px rgba(18, 24, 38, 0.24);
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

.panel-title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  margin-bottom: 14px;
  padding-right: 24px; /* space for close button */
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

.info-icon-btn {
  margin-left: 3px;
  margin-top: 1px;
  background: transparent;
  border: none;
  padding: 2px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  vertical-align: middle;
}

.info-icon-btn:hover {
  background: var(--bg-surface-hover);
}

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

/* ── Mobile: floating bar ───────────────────────────────────────────────── */

.mobile-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 12px;
  gap: 8px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.45), transparent);
  z-index: 1000;
  pointer-events: none;
}

.mobile-config-btn {
  pointer-events: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 7px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 10px;
  font-weight: 500;
  min-width: 60px;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(18, 24, 38, 0.2);
}

.mobile-config-btn:hover,
.mobile-config-btn.active {
  background: color-mix(in srgb, var(--primary-color) 18%, var(--bg-card));
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
  color: var(--primary-color);
}

.mobile-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  background: var(--primary-color);
  color: white;
  font-size: 9px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 8px;
  min-width: 14px;
  text-align: center;
  line-height: 1.3;
}

/* ── Mobile: drop-down modal ────────────────────────────────────────────── */

.mobile-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1002;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.mobile-modal-content {
  width: 100%;
  max-width: 500px;
  background: var(--bg-card);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.mobile-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.mobile-modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
}

.mobile-modal-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}

.mobile-modal-close:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.mobile-modal-body {
  padding: 16px;
}

/* ── Filter controls (shared desktop + mobile) ──────────────────────────── */

.filter-group {
  margin-bottom: 14px;
}

.filter-group.last {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.filter-label {
  display: flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 7px;
}

.filter-btn-group {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.filter-btn {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  transition: all 0.18s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  justify-content: center;
}

.filter-btn:hover {
  background: color-mix(in srgb, var(--text-primary) 10%, transparent);
  color: var(--text-primary);
}

.filter-btn.active {
  background: color-mix(in srgb, var(--primary-color) 22%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--primary-color);
  font-weight: 600;
}

/* Granularity chips: colored dot + per-level active tint */
.granularity-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 5px;
  flex-shrink: 0;
  opacity: 0.55;
  transition: opacity 0.18s;
}

.filter-btn.active .granularity-dot {
  opacity: 1;
}

.granularity-dot--place {
  background: #4ade80;
}
.granularity-dot--city {
  background: #60a5fa;
}
.granularity-dot--region {
  background: #fbbf24;
}
.granularity-dot--country {
  background: #c084fc;
}

.filter-btn--place.active {
  background: color-mix(in srgb, #4ade80 18%, transparent);
  border-color: color-mix(in srgb, #4ade80 45%, transparent);
  color: #4ade80;
}

.filter-btn--city.active {
  background: color-mix(in srgb, #60a5fa 18%, transparent);
  border-color: color-mix(in srgb, #60a5fa 45%, transparent);
  color: #60a5fa;
}

.filter-btn--region.active {
  background: color-mix(in srgb, #fbbf24 18%, transparent);
  border-color: color-mix(in srgb, #fbbf24 45%, transparent);
  color: #fbbf24;
}

.filter-btn--country.active {
  background: color-mix(in srgb, #c084fc 18%, transparent);
  border-color: color-mix(in srgb, #c084fc 45%, transparent);
  color: #c084fc;
}

/* Los tonos 400 de los chips no llegan a 3:1 sobre fondo claro */
:global([data-theme="light"]) .filter-btn--place.active {
  color: #15803d;
}
:global([data-theme="light"]) .filter-btn--city.active {
  color: #1d4ed8;
}
:global([data-theme="light"]) .filter-btn--region.active {
  color: #b45309;
}
:global([data-theme="light"]) .filter-btn--country.active {
  color: #7e22ce;
}

.filter-group-disabled {
  opacity: 0.38;
  pointer-events: none;
}

.filter-btn:disabled {
  cursor: not-allowed;
}

/* ── Navigation & Selection controls section ────────────────────────────── */

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

.toggle-icon {
  color: var(--icon-secondary);
  transition: transform 0.2s;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

.controls-info {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 4px;
  padding: 12px;
  animation: slideDown 0.3s ease-out;
}

.control-tip {
  margin: 8px 0;
  color: var(--text-secondary, #a0aec0);
  font-size: 12px;
  line-height: 1.4;
}

.control-tip:first-child {
  margin-top: 0;
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

/* ── Search Filters section ────────────────────────────────────────────── */

.search-filters-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.filter-item-label {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.filter-sub-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 2px 0;
}

.filter-sub-toggle:hover {
  opacity: 0.8;
}

.clear-filter-btn {
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

.clear-filter-btn:hover {
  background: var(--bg-surface-hover);
}

.artistic-scores-sliders {
  display: flex;
  flex-direction: column;
  gap: 0;
  animation: slideDown 0.2s ease-out;
}

.score-group {
  margin-top: 6px;
}

.score-group-header {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
  opacity: 0.7;
}

.score-slider-item {
  margin-bottom: 4px;
}

.time-range-container {
  animation: slideDown 0.2s ease-out;
}
</style>
