<template>
  <div class="photos-grid-controls">
    <!-- Visual Filters Compact Row -->
    <div class="filters-section">
      <div class="filter-controls-section-header" @click="toggleFilters">
        <div class="filter-controls-header-left">
          <n-icon
            size="16"
            class="filter-controls-section-icon"
            :color="`var(--primary-color)`"
          >
            <Camera20Regular />
          </n-icon>
          <span class="filter-controls-section-label">Search filters</span>
          <span
            v-if="
              (hasActiveFilters || hasActiveScoreFilters) && !isFiltersExpanded
            "
            class="filter-controls-active-badge"
          >
            {{ totalActiveFilters }}
          </span>
        </div>
        <n-icon
          size="14"
          class="filter-controls-toggle-icon"
          :class="{ rotated: isFiltersExpanded }"
        >
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
            />
          </svg>
        </n-icon>
      </div>
      <!-- Filters Collapsible Content -->
      <div
        v-if="isFiltersExpanded"
        class="filter-controls-tab-container filters-expanded-content"
      >
        <VisualFiltersPanel
          :visual-aspects="selectedFilters"
          :score-filters="artisticScoreFilters"
          @update:visual-aspects="handleVisualAspectsPanelChange"
          @update:score-filters="handleScoreFiltersPanelChange"
        />
      </div>
    </div>

    <!-- Sorting Section -->
    <div class="sorting-section">
      <div
        class="filter-controls-section-header sorting-header"
        @click="toggleSorting"
      >
        <div class="filter-controls-header-left">
          <n-icon
            size="16"
            class="filter-controls-section-icon"
            :color="`var(--warning-color)`"
          >
            <Trophy20Regular />
          </n-icon>
          <span class="filter-controls-section-label"
            >Rank by visual scores</span
          >
          <n-button
            v-if="hasActiveSorting"
            text
            size="small"
            @click="toggleSortOrder"
            class="sort-order-btn"
            :title="
              sortOrder === 'desc'
                ? 'Best First (click for Worst First)'
                : 'Worst First (click for Best First)'
            "
          >
            <n-icon size="16">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px">
                <path
                  v-if="sortOrder === 'desc'"
                  d="M19,17H22L18,21L14,17H17V3H19V17M2,17V19H12V17H2M6,5V7H12V5H6M2,11V13H9V11H2Z"
                  fill="currentColor"
                />
                <path
                  v-else
                  d="M19,7H22L18,3L14,7H17V21H19V7M2,17V19H12V17H2M6,5V7H12V5H6M2,11V13H9V11H2Z"
                  fill="currentColor"
                />
              </svg>
            </n-icon>
          </n-button>
          <n-button
            v-if="hasActiveSorting"
            quaternary
            size="small"
            @click="clearSorting"
            class="clear-action-btn"
          >
            Clear
          </n-button>
          <span
            v-if="hasActiveSorting && !isSortingExpanded"
            class="filter-controls-active-badge"
          >
            Active
          </span>
        </div>
        <n-icon
          size="14"
          class="filter-controls-toggle-icon"
          :class="{ rotated: isSortingExpanded }"
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
        v-if="isSortingExpanded"
        class="sorting-wrapper filter-controls-tab-container"
      >
        <!-- Sorting Type Selection -->
        <div class="sorting-type-row">
          <n-radio-group
            v-model:value="sortingType"
            size="small"
            @update:value="handleSortingTypeChange"
            class="inline-radios"
          >
            <n-radio value="criteria" class="sorting-radio">Criteria</n-radio>
            <n-radio value="genre" class="sorting-radio">Genre</n-radio>
          </n-radio-group>
        </div>
        <!-- Criteria Selection -->
        <div
          v-if="sortingType === 'criteria'"
          class="filter-controls-criteria-row"
        >
          <template
            v-for="[groupKey, group] in Object.entries(artisticScores)"
            :key="groupKey"
          >
            <n-button
              v-for="criterion in group.criteria"
              :key="criterion.value"
              secondary
              :type="
                selectedCriteria.includes(criterion.value)
                  ? groupKey === 'fundamentals'
                    ? 'primary'
                    : 'warning'
                  : 'default'
              "
              size="small"
              @click="toggleCriterion(criterion.value)"
              class="filter-controls-criterion-button"
            >
              <template #icon>
                <n-icon>
                  <component :is="criterionIcons[criterion.value]" />
                </n-icon>
              </template>
              {{ criterion.label }}
            </n-button>
          </template>
        </div>

        <!-- Genre Buttons -->
        <div v-if="sortingType === 'genre'" class="genre-row">
          <n-tooltip
            v-for="genre in genres"
            :key="genre.value"
            trigger="hover"
            placement="bottom"
            :show-arrow="true"
            delay="1200"
          >
            <template #trigger>
              <n-button
                :type="selectedGenre === genre.value ? 'primary' : 'default'"
                size="small"
                secondary
                @click="handleGenreSelect(genre.value)"
                class="genre-button"
                :class="{ 'custom-button': genre.value === 'custom' }"
              >
                <template #icon>
                  <n-icon>
                    <component :is="genre.icon" />
                  </n-icon>
                </template>
                {{ genre.label }}
              </n-button>
            </template>
            <div
              v-if="genre.value !== 'custom'"
              v-html="formatGenreTooltip(genre.value)"
            ></div>
            <div v-else>Customize your own scoring weights</div>
          </n-tooltip>
        </div>
      </div>
    </div>

    <!-- More Filters Section -->
    <div class="date-range-section">
      <div class="filter-controls-section-header" @click="toggleDateRange">
        <div class="filter-controls-header-left">
          <n-icon
            size="16"
            class="filter-controls-section-icon"
            :color="`var(--text-on-primary)`"
          >
            <Settings20Regular />
          </n-icon>
          <span class="filter-controls-section-label">More filters</span>
        </div>
        <n-icon
          size="14"
          class="filter-controls-toggle-icon"
          :class="{ rotated: isDateRangeExpanded }"
        >
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
            />
          </svg>
        </n-icon>
      </div>

      <!-- Collapsible More Filters -->
      <div v-if="isDateRangeExpanded" class="filter-controls-tab-container">
        <div class="more-filters-content">
          <!-- Tags Filter Row -->
          <div class="tags-filter-row">
            <div class="filter-wrapper">
              <div class="filter-header-row">
                <div style="display: flex; align-items: center; gap: 6px">
                  <label class="filter-label">Include tags</label>
                  <n-tooltip trigger="hover" placement="top">
                    <template #trigger>
                      <n-icon
                        size="14"
                        style="
                          color: var(--text-secondary);
                          cursor: help;
                          opacity: 0.7;
                        "
                      >
                        <Info16Regular />
                      </n-icon>
                    </template>
                    Exact tag matching only. Use Search tool for semantic
                    queries.
                  </n-tooltip>
                </div>
                <div class="tags-mode-switch-wrapper">
                  <span class="tag-mode-label" :class="{ active: !isOrMode }">
                    All
                  </span>
                  <n-switch
                    v-model:value="isOrMode"
                    size="small"
                    class="tags-mode-switch"
                  />
                  <span class="tag-mode-label" :class="{ active: isOrMode }">
                    Any
                  </span>
                </div>
              </div>
              <n-select
                v-model:value="includedTags"
                v-model:show="includedTagsDropdownShow"
                multiple
                filterable
                clearable
                remote
                placeholder="Include tags..."
                :options="includedTagSuggestionsFormatted"
                :filter="() => true"
                :clear-filter-after-select="true"
                :max-tag-count="3"
                :ignore-composition="false"
                size="small"
                @search="handleIncludedTagSearch"
                @update:value="handleIncludedTagsUpdate"
                class="compact-select"
              >
                <template #empty>
                  <div style="padding: 8px; color: #888; font-size: 11px">
                    Start typing to search tags...
                  </div>
                </template>
              </n-select>
            </div>

            <div class="filter-wrapper">
              <label class="filter-label">Exclude tags</label>
              <n-select
                v-model:value="excludedTags"
                v-model:show="excludedTagsDropdownShow"
                multiple
                filterable
                clearable
                remote
                placeholder="Exclude tags..."
                :options="excludedTagSuggestionsFormatted"
                :filter="() => true"
                :clear-filter-after-select="true"
                :max-tag-count="3"
                :ignore-composition="false"
                size="small"
                @search="handleExcludedTagSearch"
                @update:value="handleExcludedTagsUpdate"
                class="compact-select"
              >
                <template #empty>
                  <div style="padding: 8px; color: #888; font-size: 11px">
                    Start typing to search tags...
                  </div>
                </template>
              </n-select>
            </div>
          </div>

          <!-- Filename Search + Metadata Filters Row -->
          <div class="metadata-row">
            <!-- Filename Search -->
            <div class="filter-wrapper">
              <label class="filter-label">File name</label>
              <n-input
                v-model:value="filenameSearch"
                placeholder="Filename..."
                clearable
                size="small"
                class="filename-input"
                @update:value="handleFilenameSearchChange"
              >
                <template #prefix>
                  <n-icon size="14">
                    <Search20Regular />
                  </n-icon>
                </template>
              </n-input>
            </div>

            <!-- File Type Filter -->
            <div class="filter-wrapper">
              <label class="filter-label">File type</label>
              <n-select
                disabled
                v-model:value="selectedFileTypes"
                multiple
                placeholder="All types..."
                :options="fileTypeOptions"
                size="small"
                clearable
                filterable
                class="compact-select"
              />
            </div>

            <!-- ISO Filter -->
            <div class="filter-wrapper">
              <label class="filter-label">ISO</label>
              <n-select
                v-model:value="selectedISO"
                multiple
                disabled
                placeholder="All ISO..."
                :options="isoOptions"
                size="small"
                clearable
                filterable
                class="compact-select"
              />
            </div>

            <!-- Flash Filter -->
            <div class="filter-wrapper">
              <label class="filter-label">Flash</label>
              <n-select
                v-model:value="selectedFlash"
                disabled
                placeholder="All states..."
                :options="flashOptions"
                size="small"
                clearable
                class="compact-select"
              />
            </div>

            <!-- Aperture Filter -->
            <div class="filter-wrapper">
              <label class="filter-label">Aperture</label>
              <n-select
                v-model:value="selectedAperture"
                disabled
                multiple
                placeholder="All f-stops..."
                :options="apertureOptions"
                size="small"
                clearable
                filterable
                class="compact-select"
              />
            </div>
          </div>

          <!-- Date Range Filter -->
          <div class="date-range-wrapper">
            <TimeRangeFilter
              :photos="photos"
              @time-range-change="handleTimeRangeChange"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Custom Weights Modal -->
    <n-modal
      class="custom-weights-modal"
      v-model:show="showCustomWeightsModal"
      preset="card"
      title="Custom Preset Configuration"
      :style="{ maxWidth: '90vw', width: '600px' }"
    >
      <CustomArtisticWeights
        v-model="customWeights"
        :format-criterion-name="formatCriterionName"
      />
      <template #footer>
        <div class="custom-weights-footer">
          <div class="footer-left">
            <n-button class="reset-button" @click="resetCustomWeights"
              >Reset</n-button
            >
          </div>
          <div class="footer-right">
            <n-button
              class="cancel-button"
              @click="showCustomWeightsModal = false"
              >Cancel</n-button
            >
            <n-button
              class="apply-button"
              type="primary"
              @click="saveCustomWeights"
              >Apply</n-button
            >
          </div>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, ref, reactive, watch, h, onMounted } from "vue";
import { visualAspectsOptions } from "@/stores/searchStore.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { useSearchTags } from "@/composables/useSearchTags.js";
import CustomArtisticWeights from "./CustomArtisticWeights.vue";
import TimeRangeFilter from "./TimeRangeFilter.vue";
import VisualFiltersPanel from "@/components/photos-grid/VisualFiltersPanel.vue";
import { api } from "@/utils/axios";
import {
  NButton,
  NSelect,
  NIcon,
  NRadioGroup,
  NRadio,
  NModal,
  NTag,
  NTooltip,
  NInput,
  NSwitch,
  useMessage,
} from "naive-ui";
import {
  BookOpen16Regular,
  Camera20Regular,
  Info16Regular,
  Search20Regular,
  Settings20Regular,
  Trophy20Regular,
} from "@vicons/fluent";
import { PaletteOutlined } from "@vicons/material";
import { Walk, WalkOutline } from "@vicons/ionicons5";

const emit = defineEmits([
  "filters-change",
  "sorting-change",
  "sort-order-change",
  "criteria-change",
  "genre-change",
  "sorting-type-change",
  "custom-weights-change",
  "filename-search-change",
  "time-range-change",
  "file-type-change",
  "iso-change",
  "flash-change",
  "aperture-change",
  "tag-search",
  "artistic-scores-change",
]);

// Genre definitions for rendering
const genres = [
  { value: "street", label: "Street", icon: WalkOutline },
  { value: "documentary", label: "Documentary", icon: BookOpen16Regular },
  { value: "abstract", label: "Artistic", icon: PaletteOutlined },
  { value: "custom", label: "Custom", icon: Settings20Regular },
];

const props = defineProps({
  basicSortActive: {
    type: Boolean,
    default: false,
  },
  photos: {
    type: Array,
    default: () => [],
  },
});

// Mobile detection
const { isMobile } = useIsMobile();

// Message instance
const message = useMessage();

// Use search tags composable
const {
  includedTagSuggestions,
  excludedTagSuggestions,
  onSearchInputIncluded,
  onSearchInputExcluded,
} = useSearchTags();

// Tags filter state (local to this component)
const includedTags = ref([]);
const excludedTags = ref([]);
const includedTagsDropdownShow = ref(false);
const excludedTagsDropdownShow = ref(false);
const isSearchingTags = ref(false);
const isOrMode = ref(true); // true = OR (Any), false = AND (All)

const tagsMode = computed(() => (isOrMode.value ? "OR" : "AND"));

// Filename Search
const filenameSearch = ref("");

// File Type Filter
const selectedFileTypes = ref([]);
const fileTypeOptions = [
  { label: "JPEG", value: "jpg" },
  { label: "PNG", value: "png" },
  { label: "HEIC", value: "heic" },
  { label: "RAW", value: "raw" },
  { label: "TIFF", value: "tiff" },
  { label: "WebP", value: "webp" },
];

// ISO Filter
const selectedISO = ref([]);
const isoOptions = [
  { label: "100", value: 100 },
  { label: "200", value: 200 },
  { label: "400", value: 400 },
  { label: "800", value: 800 },
  { label: "1600", value: 1600 },
  { label: "3200", value: 3200 },
  { label: "6400", value: 6400 },
  { label: "12800", value: 12800 },
];

// Flash Filter
const selectedFlash = ref(null);
const flashOptions = [
  { label: "Off", value: "off" },
  { label: "On", value: "on" },
  { label: "Auto", value: "auto" },
];

// Aperture Filter
const selectedAperture = ref([]);
const apertureOptions = [
  { label: "f/1.0", value: 1.0 },
  { label: "f/1.4", value: 1.4 },
  { label: "f/1.8", value: 1.8 },
  { label: "f/2.0", value: 2.0 },
  { label: "f/2.8", value: 2.8 },
  { label: "f/4.0", value: 4.0 },
  { label: "f/5.6", value: 5.6 },
  { label: "f/8.0", value: 8.0 },
  { label: "f/11", value: 11.0 },
  { label: "f/16", value: 16.0 },
];

// Visual Aspects Filters
const selectedFilters = ref({});
const isFiltersExpanded = ref(false); // Will be set based on mobile on mount

// Date Range Filter
const isDateRangeExpanded = ref(false);

// Quality Sorting
const sortingType = ref("criteria"); // 'criteria' or 'genre'
const selectedCriteria = ref([]); // Start empty (no sorting initially)
const selectedGenre = ref("street");
const sortOrder = ref("desc"); // 'asc', 'desc'
const isSortingExpanded = ref(false); // Will be set based on mobile on mount

// Get dynamic criteria from useArtisticScores
const {
  artisticScores,
  genrePresets,
  formatCriterionName,
  formatGenreTooltip,
  criterionIcons,
} = useArtisticScores();

// Create grouped criteria options for n-select
const availableCriteria = Object.entries(artisticScores).map(
  ([groupKey, group]) => ({
    type: "group",
    label: group.label,
    key: groupKey,
    children: group.criteria.map((criterion) => ({
      value: criterion.value,
      label: criterion.label,
      group: groupKey, // Add group information for styling
    })),
  }),
);

// Helper function to get group for a criterion
const getCriterionGroup = (criterionValue) => {
  for (const [groupKey, group] of Object.entries(artisticScores)) {
    if (group.criteria.some((c) => c.value === criterionValue)) {
      return groupKey;
    }
  }
  return null;
};

// Artistic Score Filters
const artisticScoreFilters = ref({});

const hasActiveScoreFilters = computed(
  () => Object.keys(artisticScoreFilters.value).length > 0,
);

const handleArtisticScoreChange = (key, filterVal) => {
  if (!filterVal) {
    const updated = { ...artisticScoreFilters.value };
    delete updated[key];
    artisticScoreFilters.value = updated;
  } else {
    artisticScoreFilters.value = {
      ...artisticScoreFilters.value,
      [key]: filterVal,
    };
  }
  emit("artistic-scores-change", { ...artisticScoreFilters.value });
};

const clearArtisticScores = () => {
  artisticScoreFilters.value = {};
  emit("artistic-scores-change", {});
};

// Custom weights modal
const showCustomWeightsModal = ref(false);
const customWeights = ref({});

// Initialize custom weights with default values (1.0 for all criteria)
const initializeCustomWeights = () => {
  const weights = {};
  Object.values(artisticScores).forEach((group) => {
    group.criteria.forEach((criterion) => {
      weights[criterion.value] = 0.5;
    });
  });
  return weights;
};

customWeights.value = initializeCustomWeights();

// Function to render criterion tags with group-specific colors
const renderCriterionTag = ({ option, handleClose }) => {
  const group = getCriterionGroup(option.value);
  const tagColor = group.color; // Blue for fundamentals, amber for bonus

  return h(
    NTag,
    {
      style: {
        backgroundColor: tagColor + "20", // Add transparency
        borderColor: tagColor,
        color: tagColor,
      },
      closable: true,
      onClose: (e) => {
        e.stopPropagation();
        handleClose();
      },
    },
    {
      default: () => option.label,
    },
  );
};

// Genre options for the select (no longer needed but keeping for compatibility)
const genreOptions = [
  { value: "street", label: "Street" },
  { value: "documentary", label: "Documentary" },
  { value: "abstract", label: "Abstract" },
];

// Initialize selectedFilters with empty arrays for each category
visualAspectsOptions.forEach((group) => {
  selectedFilters.value[group.key] = [];
});

// Computed for checking if there are active filters
const hasActiveFilters = computed(() => {
  return Object.values(selectedFilters.value).some(
    (filters) => filters.length > 0,
  );
});

// Computed for total count of active filters
const totalActiveFilters = computed(() => {
  const aspectsCount = Object.values(selectedFilters.value).reduce(
    (total, filters) => total + filters.length,
    0,
  );
  const scoreFiltersCount = Object.keys(artisticScoreFilters.value).length;
  return aspectsCount + scoreFiltersCount;
});

// Computed for checking if sorting is active
const hasActiveSorting = computed(() => {
  if (sortingType.value === "none") {
    return false; // No sorting when "none" is selected
  } else if (sortingType.value === "criteria") {
    return selectedCriteria.value.length > 0;
  } else if (sortingType.value === "genre") {
    return true; // Genre sorting is always active when selected
  }
  return false;
});

// Functions
const clearAllFilters = () => {
  Object.keys(selectedFilters.value).forEach((key) => {
    selectedFilters.value[key] = [];
  });
};

const toggleCriterion = (criterionValue) => {
  const index = selectedCriteria.value.indexOf(criterionValue);
  if (index === -1) {
    // Add criterion
    selectedCriteria.value.push(criterionValue);
  } else {
    // Remove criterion
    selectedCriteria.value.splice(index, 1);
  }
  handleCriteriaChange();
};

const handleSortingTypeChange = () => {
  // Reset criteria when switching modes
  if (sortingType.value === "none") {
    selectedCriteria.value = []; // Clear criteria when none is selected
  } else if (sortingType.value === "criteria") {
    // Keep current criteria or start empty - don't force default criteria
    // This allows the user to start with "no sorting" until they add criteria
  }
  emit("sorting-type-change", sortingType.value);
};

const handleGenreChange = () => {
  emit("genre-change", selectedGenre.value);
};

const handleGenreSelect = (genre) => {
  if (genre === "custom") {
    // Open custom weights modal
    showCustomWeightsModal.value = true;
  } else {
    selectedGenre.value = genre;
    handleGenreChange();
  }
};

const resetCustomWeights = () => {
  customWeights.value = initializeCustomWeights();
};

const saveCustomWeights = () => {
  selectedGenre.value = "custom";
  showCustomWeightsModal.value = false;

  // Emit custom weights to parent
  emit("custom-weights-change", customWeights.value);
  handleGenreChange();
};

const clearSorting = () => {
  sortingType.value = "none";
  selectedCriteria.value = [];
};

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === "desc" ? "asc" : "desc";
};

// Toggle functions for exclusive accordion behavior on mobile
const toggleFilters = () => {
  // Close other sections when opening this one
  if (!isFiltersExpanded.value) {
    isSortingExpanded.value = false;
    isDateRangeExpanded.value = false;
  }
  isFiltersExpanded.value = !isFiltersExpanded.value;
};

const toggleSorting = () => {
  // Close other sections when opening this one
  if (!isSortingExpanded.value) {
    isFiltersExpanded.value = false;
    isDateRangeExpanded.value = false;
  }
  isSortingExpanded.value = !isSortingExpanded.value;
};

const toggleDateRange = () => {
  // Close other sections when opening this one
  if (!isDateRangeExpanded.value) {
    isFiltersExpanded.value = false;
    isSortingExpanded.value = false;
  }
  isDateRangeExpanded.value = !isDateRangeExpanded.value;
};

const handleFilterChange = () => {
  emit("filters-change", selectedFilters.value);
};

const handleVisualAspectsPanelChange = (newFilters) => {
  selectedFilters.value = newFilters;
  handleFilterChange();
};

const handleScoreFiltersPanelChange = (newScoreFilters) => {
  artisticScoreFilters.value = newScoreFilters;
  emit("artistic-scores-change", { ...newScoreFilters });
};

const handleCriteriaChange = () => {
  emit("criteria-change", selectedCriteria.value);
};

const handleFilenameSearchChange = (value) => {
  emit("filename-search-change", value);
};

const handleTimeRangeChange = (range) => {
  emit("time-range-change", range);
};

// Tag filtering functions - use composable handlers
const handleIncludedTagSearch = (query) => {
  onSearchInputIncluded(query);
};

const handleExcludedTagSearch = (query) => {
  onSearchInputExcluded(query);
};

const handleIncludedTagsUpdate = async (value) => {
  includedTags.value = value;
  includedTagsDropdownShow.value = false; // Cerrar dropdown al seleccionar
  await executeTagSearch();
};

const handleExcludedTagsUpdate = async (value) => {
  excludedTags.value = value;
  excludedTagsDropdownShow.value = false; // Cerrar dropdown al seleccionar
  await executeTagSearch();
};

const executeTagSearch = async () => {
  // If no tags selected, clear the filter
  if (includedTags.value.length === 0 && excludedTags.value.length === 0) {
    emit("tag-search", null);
    return;
  }

  try {
    isSearchingTags.value = true;
    const { data: response } = await api.post("/api/search/tags/direct", {
      included: includedTags.value,
      excluded: excludedTags.value,
      mode: tagsMode.value,
      semantic: false,
    });

    // Emit the search results to parent
    emit("tag-search", response);

    console.log(`✅ Tag search completed: ${response.length} photos matched`);
  } catch (error) {
    console.error("Error searching by tags:", error);
    message.error("Failed to search by tags");
  } finally {
    setTimeout(() => {
      isSearchingTags.value = false;
    }, 500);
  }
};

const includedTagSuggestionsFormatted = computed(() => {
  // Filter out already selected tags to avoid duplicates in n-select dropdown
  const selectedSet = new Set(includedTags.value);
  return includedTagSuggestions.value.filter(
    (tag) => !selectedSet.has(tag.value),
  );
});

const excludedTagSuggestionsFormatted = computed(() => {
  // Filter out already selected tags to avoid duplicates in n-select dropdown
  const selectedSet = new Set(excludedTags.value);
  return excludedTagSuggestions.value.filter(
    (tag) => !selectedSet.has(tag.value),
  );
});

// Watch for tags mode changes and re-trigger search if tags are selected
watch(
  () => isOrMode.value,
  () => {
    if (includedTags.value.length > 0 || excludedTags.value.length > 0) {
      executeTagSearch();
    }
  },
);

// Watchers to emit changes
watch(
  sortingType,
  (newValue) => {
    emit("sorting-type-change", newValue);
  },
  { immediate: true },
);

watch(
  sortOrder,
  (newValue) => {
    emit("sort-order-change", newValue);
  },
  { immediate: true },
);

watch(
  selectedGenre,
  (newGenre) => {
    emit("genre-change", newGenre);
  },
  { immediate: true },
);

// Combined watcher for overall sorting state
watch(
  [sortingType, selectedCriteria, selectedGenre],
  () => {
    emit("sorting-change", hasActiveSorting.value);
  },
  { immediate: true },
); // Emitir inmediatamente al montar

// Emitir estado inicial de filtros y criterios
watch(
  selectedFilters,
  (newFilters) => {
    emit("filters-change", newFilters);
  },
  { immediate: true, deep: true },
);

watch(
  selectedCriteria,
  (newCriteria) => {
    emit("criteria-change", newCriteria);
  },
  { immediate: true },
);

// Watch for basic sort activation to deactivate scores sorting
watch(
  () => props.basicSortActive,
  (isBasicSortActive) => {
    if (isBasicSortActive) {
      // When basic sort is activated, deactivate scores sorting
      sortingType.value = "none";
      selectedCriteria.value = [];
    }
  },
);
</script>

<style scoped>
.photos-grid-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Filters Section */
.filters-section {
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

/* Sorting Section */
.sorting-section {
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.sorting-wrapper {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0 12px 8px 12px;
}

.sorting-type-row {
  display: flex;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 4px;
}

.inline-radios {
  margin-left: 0;
}

.sorting-radio {
  font-size: 13px;
}

.sort-order-btn {
  color: var(--text-secondary);
  transition: all 0.2s ease;
  opacity: 0.7;
  padding: 4px;
}

.sort-order-btn:hover {
  opacity: 1;
  color: var(--warning-color);
  transform: scale(1.05);
}

/* Criteria and Genre Rows */
.genre-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  padding-top: 4px;
}

/* Desktop: single row */
@media (min-width: 1024px) {
  .genre-row {
    flex-wrap: nowrap;
  }
}

/* Tablet and below: wrap */
@media (max-width: 1023px) {
  .genre-row {
    flex-wrap: wrap;
  }
}

.criteria-select {
  flex: 1;
  min-width: 280px;
}

.genre-button {
  flex: 1 1 auto;
  min-width: 100px;
  transition: all 0.2s ease;
  font-size: 13px;
}

.genre-button:hover {
  transform: translateY(-1px);
}

.genre-button.custom-button {
  border: 1px dashed var(--border-color);
}

/* More Filters Section */
.date-range-section {
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.filters-tab-container {
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.more-filters-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.tags-filter-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.metadata-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.date-range-wrapper,
.filter-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.compact-select {
  width: 100%;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.filter-header-row {
  display: flex;
  align-items: center;
  /* justify-content: space-between; */
  margin-bottom: 8px;
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
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  opacity: 0.6;
  transition: opacity 0.2s;
  cursor: default;
}

.tag-mode-label.active {
  opacity: 1;
}

.tags-mode-switch :deep(.n-switch) {
  --n-height: 16px;
  --n-width: 28px;
}

.tags-mode-switch :deep(.n-switch__rail) {
  background: rgba(255, 255, 255, 0.1);
}

.tags-mode-switch :deep(.n-switch.n-switch--checked .n-switch__rail) {
  background: var(--primary-color);
}

.filename-input {
  width: 100%;
  max-width: 400px;
}

/* Mobile styles */
@media (max-width: 767px) {
  .filter-controls-section-header {
    padding: 10px 12px;
  }

  .filter-controls-section-label {
    font-size: 12px;
  }

  .filter-controls-toggle-icon {
    display: block;
  }

  .sorting-header .filter-controls-header-left {
    flex-wrap: wrap;
    width: 100%;
  }

  .inline-radios {
    width: 100%;
    margin-left: 0;
  }

  .criteria-select {
    width: 100%;
  }

  .criterion-button,
  .genre-button {
    flex: 1 1 calc(50% - 4px);
    min-width: 0;
  }

  .filename-input {
    max-width: 100%;
    width: 100%;
  }

  .tags-filter-row,
  .metadata-row {
    flex-direction: column;
    gap: 12px;
  }

  .filter-wrapper {
    width: 100%;
  }
}

/* Desktop: hide toggle icon */
@media (min-width: 1024px) {
  .section-header:hover {
    background-color: transparent;
  }
}

/* Sorting header button event handling */
.sorting-header .sort-order-btn,
.sorting-header .clear-action-btn {
  pointer-events: auto;
}

/* Custom tooltip styling */
:deep(.n-tooltip__content) {
  background-color: var(--bg-body) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 8px !important;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
  max-width: 280px !important;
  padding: 12px !important;
}

/* Artistic Scores Filter */
.filters-expanded-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 12px 12px;
}

.score-slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.score-slider-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.score-slider-value {
  font-size: 11px;
  font-weight: 500;
  color: var(--warning-color);
}

.score-slider :deep(.n-slider) {
  --n-fill-color: var(--primary-color);
  --n-fill-color-hover: var(--primary-color-hover, var(--primary-color));
}

/* Custom modal footer responsiveness */
.custom-weights-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 12px;
  flex-wrap: nowrap;
}
.custom-weights-footer .footer-left {
  flex: 1 1 auto;
}
.custom-weights-footer .footer-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* On small screens stack buttons vertically and make them full width */
@media (max-width: 600px) {
  .custom-weights-modal {
    max-width: 92vw !important;
    width: 100% !important;
    padding: 0 8px;
  }
  .custom-weights-footer {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .custom-weights-footer .footer-left,
  .custom-weights-footer .footer-right {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .custom-weights-footer .footer-left {
    flex: 0 0 auto;
  }
  .custom-weights-footer .footer-right {
    flex: 1 0 auto;
    justify-content: flex-end;
  }
  .custom-weights-footer n-button {
    padding: 6px 12px;
    font-size: 14px;
    line-height: 1;
    min-width: 84px;
    border-radius: 6px;
  }
  .custom-weights-footer n-button.reset-button,
  .custom-weights-footer n-button.cancel-button {
    min-width: 84px;
    padding: 6px 12px;
  }
  .custom-weights-footer n-button.apply-button {
    min-width: 96px;
    padding: 8px 16px;
  }
  /* If space becomes tight, keep content on one line */
  .custom-weights-footer n-button .n-button__content {
    white-space: nowrap;
  }
}
</style>
