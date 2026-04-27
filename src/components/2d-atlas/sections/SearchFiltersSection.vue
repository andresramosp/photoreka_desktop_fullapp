<template>
  <div class="section-content">
    <!-- Semantic Text Search -->
    <div class="filter-item">
      <div class="filter-header-row">
        <label class="filter-label">Semantic Search</label>
        <div class="tags-mode-switch-wrapper">
          <span
            class="tag-mode-label"
            :class="{ active: searchMode === 'broad' }"
            >Broad</span
          >
          <n-switch
            v-model:value="isPreciseMode"
            size="small"
            class="tags-mode-switch"
          />
          <span
            class="tag-mode-label"
            :class="{ active: searchMode === 'precise' }"
            >Precise</span
          >
        </div>
      </div>
      <div class="text-search-row">
        <n-input
          v-model:value="textSearchQuery"
          placeholder="Describe what you're looking for..."
          size="small"
          clearable
          :disabled="isTextSearching || showDiscreteLoader"
          @keyup.enter="handleTextSearch"
          @clear="handleClearTextSearch"
          @click.stop
          @keydown.stop
          @keyup.stop
        />
        <n-button
          size="small"
          type="primary"
          :loading="isTextSearching"
          :disabled="!textSearchQuery?.trim() || showDiscreteLoader"
          @click="handleTextSearch"
        >
          <template #icon>
            <n-icon><SearchOutlined /></n-icon>
          </template>
        </n-button>
      </div>
    </div>

    <!-- Visual Aspects Filter -->
    <div class="filter-item">
      <label class="filter-label">Visual Aspects</label>
      <n-tree-select
        :value="selectedVisualAspects"
        v-model:show="visualAspectsDropdownShow"
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
        :filterable="false"
        @click.stop
        @keydown.stop
        @keyup.stop
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
          <span class="scores-toggle-label"
            >Visual Scores
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
            </n-tooltip></span
          >
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
            size="14"
            class="toggle-icon"
            color="#aaa"
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
            <ScoreOperatorSlider
              :label="formatCriterionName(criterion.value)"
              :model-value="localArtisticScoreFilters[criterion.value] ?? null"
              @update:model-value="
                (v) => handleArtisticScoreChange(criterion.value, v)
              "
              :disabled="showDiscreteLoader"
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
            size="14"
            class="toggle-icon"
            color="#aaa"
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
          :histogram-height="'40px'"
        />
      </div>
    </div>

    <!-- Tags Filter -->
    <div class="filter-item">
      <div class="filter-header-row">
        <label class="filter-label"
          >Tags
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-icon size="12" color="var(--text-secondary)">
                <InfoCircleFilled />
              </n-icon>
            </template>
            Exact tag matching only. Use Search tool for semantic queries.
          </n-tooltip></label
        >

        <div class="tags-mode-switch-wrapper">
          <span class="tag-mode-label" :class="{ active: !isOrMode }">All</span>
          <n-switch
            v-model:value="isOrMode"
            size="small"
            class="tags-mode-switch"
          />
          <span class="tag-mode-label" :class="{ active: isOrMode }">Any</span>
        </div>
      </div>
      <n-select
        v-model:value="includedTagsFilter"
        v-model:show="includedTagsDropdownShow"
        multiple
        filterable
        clearable
        remote
        placeholder="Include tags..."
        :options="includedTagSuggestionsFormatted"
        :clear-filter-after-select="true"
        :max-tag-count="3"
        :ignore-composition="false"
        class="tags-select include-tags-select"
        size="small"
        @search="handleIncludedTagSearch"
        @update:value="handleIncludedTagsUpdate"
        @click.stop
        @keydown.stop
        @keyup.stop
      >
        <template #empty>
          <div style="padding: 8px; color: #888; font-size: 11px">
            Start typing to search tags...
          </div>
        </template>
      </n-select>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import {
  NTreeSelect,
  NTooltip,
  NIcon,
  NSelect,
  NSwitch,
  NInput,
  NButton,
} from "naive-ui";
import { InfoCircleFilled, CloseOutlined, SearchOutlined } from "@vicons/antd";
import TimeRangeFilter from "@/components/TimeRangeFilter.vue";
import ScoreOperatorSlider from "@/components/controls/ScoreOperatorSlider.vue";
import { useSearchStore } from "@/stores/searchStore.js";
import { useUserStore } from "@/stores/userStore";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { api } from "@/utils/axios";

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
  "tag-search",
  "text-search",
]);

// Internal state
const showArtisticScores = ref(false);
const showTimeRange = ref(false);
const visualAspectsDropdownShow = ref(false);

// Text search state
const textSearchQuery = ref("");
const isTextSearching = ref(false);
const isPreciseMode = ref(false);
const searchMode = computed(() => (isPreciseMode.value ? "precise" : "broad"));

const handleTextSearch = () => {
  const query = (textSearchQuery.value || "").trim();
  if (!query) return;
  isTextSearching.value = true;
  emit("text-search", {
    query,
    searchMode: searchMode.value,
    onDone: () => (isTextSearching.value = false),
  });
};

const handleClearTextSearch = () => {
  textSearchQuery.value = "";
  emit("text-search", {
    query: "",
    searchMode: searchMode.value,
    onDone: () => {},
  });
};
const includedTagsDropdownShow = ref(false);

// Mobile detection
const { isMobile } = useIsMobile();

// Local state for artistic score filters
const localArtisticScoreFilters = ref({ ...props.artisticScoreFilters });

// Tags filter state
const includedTagsFilter = ref([]);
const excludedTagsFilter = ref([]);
const includedTagSuggestions = ref([]);
const excludedTagSuggestions = ref([]);
const isSearchingTags = ref(false);
const isOrMode = ref(true); // true = OR (Any), false = AND (All)

const tagsMode = computed(() => (isOrMode.value ? "OR" : "AND"));

let debounceIncludedTimer = null;
let debounceExcludedTimer = null;

// Watch for external changes to artistic score filters
watch(
  () => props.artisticScoreFilters,
  (newVal) => {
    localArtisticScoreFilters.value = { ...newVal };
  },
  { deep: true },
);

// Watch for tags mode changes and re-trigger search if tags are selected
watch(
  () => isOrMode.value,
  () => {
    if (includedTagsFilter.value.length > 0) {
      isSearchingTags.value = true;
      emit("tag-search", {
        included: includedTagsFilter.value,
        excluded: excludedTagsFilter.value,
        mode: tagsMode.value,
      });
      setTimeout(() => {
        isSearchingTags.value = false;
      }, 500);
    }
  },
);

const { artisticScores, formatCriterionName } = useArtisticScores({
  profile: () => useUserStore().user?.profiles,
});
const artisticScoresGroups = artisticScores;

const _searchStore = useSearchStore();
const treeSelectOptions = computed(() => {
  return _searchStore.visualAspectsOptionsForProfile.map((group) => ({
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
  if (isMobile.value) visualAspectsDropdownShow.value = false;
  emit("update:selectedVisualAspects", value);
  emit("visual-aspects-change", value);
};

const handleArtisticScoreChange = (key, filterVal) => {
  if (!filterVal) {
    delete localArtisticScoreFilters.value[key];
  } else {
    localArtisticScoreFilters.value[key] = filterVal;
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

// Tag filtering functions
const fetchTagSuggestions = async (query) => {
  try {
    const response = await api.get("/api/tags/search", {
      params: { term: query },
    });
    return response.data.result.map((tag) => ({
      label: tag.name,
      value: tag.name,
    }));
  } catch (error) {
    console.error("Error fetching tag suggestions", error);
    return [];
  }
};

const handleIncludedTagSearch = (query) => {
  if (debounceIncludedTimer) clearTimeout(debounceIncludedTimer);
  if (!query || query.trim().length < 2) {
    includedTagSuggestions.value = [];
    return;
  }
  debounceIncludedTimer = setTimeout(async () => {
    includedTagSuggestions.value = await fetchTagSuggestions(query);
  }, 300);
};

const handleIncludedTagsUpdate = (value) => {
  if (isMobile.value) includedTagsDropdownShow.value = false;
  // Execute tag search automatically whenever tags change
  isSearchingTags.value = true;
  emit("tag-search", {
    included: value,
    excluded: excludedTagsFilter.value,
    mode: tagsMode.value,
  });
  // Reset searching state after a delay
  setTimeout(() => {
    isSearchingTags.value = false;
  }, 500);
};

const handleExcludedTagSearch = (query) => {
  if (debounceExcludedTimer) clearTimeout(debounceExcludedTimer);
  if (!query || query.trim().length < 2) {
    excludedTagSuggestions.value = [];
    return;
  }
  debounceExcludedTimer = setTimeout(async () => {
    excludedTagSuggestions.value = await fetchTagSuggestions(query);
  }, 300);
};

const includedTagSuggestionsFormatted = computed(
  () => includedTagSuggestions.value,
);
const excludedTagSuggestionsFormatted = computed(
  () => excludedTagSuggestions.value,
);

const clearTags = () => {
  includedTagsFilter.value = [];
  excludedTagsFilter.value = [];
  emit("tag-search", { included: [], excluded: [], mode: tagsMode.value });
};
</script>

<style scoped>
.section-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 5px;
}

.text-search-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.text-search-row .n-input {
  flex: 1;
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
  letter-spacing: 0.5px;
}

.filter-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tags-mode-switch-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.tag-mode-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: #666;
  transition: color 0.2s;
  cursor: default;
}

.tag-mode-label.active {
  color: #aaa;
}

.tags-mode-switch :deep(.n-switch) {
  --n-height: 16px;
  --n-width: 28px;
}

.tags-mode-switch :deep(.n-switch__rail) {
  background: rgba(255, 255, 255, 0.1);
}

.tags-mode-switch :deep(.n-switch.n-switch--checked .n-switch__rail) {
  background: rgba(74, 222, 128, 0.3);
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
  letter-spacing: 0.5px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.score-slider-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.time-range-container {
  margin-top: 8px;
}

:deep(.n-slider) {
  --n-fill-color: var(--primary-color);
  --n-fill-color-hover: var(--primary-color-hover, var(--primary-color));
}

.tags-select {
  width: 100%;
  margin: 0;
}

.include-tags-select :deep(.n-base-selection) {
  border-color: rgba(34, 197, 94, 0.4);
}

.include-tags-select :deep(.n-base-selection:hover) {
  border-color: rgba(34, 197, 94, 0.6);
}

.exclude-tags-select :deep(.n-base-selection) {
  border-color: rgba(239, 68, 68, 0.4);
}

.exclude-tags-select :deep(.n-base-selection:hover) {
  border-color: rgba(239, 68, 68, 0.6);
}
</style>
