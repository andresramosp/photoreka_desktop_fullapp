<template>
  <div class="photos-grid-controls">
    <!-- Visual Filters Compact Row -->
    <div class="filters-section">
      <div
        class="section-header"
        @click="isFiltersExpanded = !isFiltersExpanded"
      >
        <div class="header-left">
          <n-icon
            size="16"
            class="section-icon"
            :color="`var(--primary-color)`"
          >
            <Camera20Regular />
          </n-icon>
          <span class="section-label">Filter by visual aspects</span>
          <span
            v-if="hasActiveFilters && !isFiltersExpanded"
            class="active-badge"
          >
            {{ totalActiveFilters }}
          </span>
        </div>
        <n-icon
          size="14"
          class="toggle-icon"
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
      <div v-if="isFiltersExpanded" class="filters-row filters-tab-container">
        <div
          v-for="aspectGroup in visualAspectsOptions"
          :key="aspectGroup.key"
          class="filter-item"
        >
          <n-select
            v-model:value="selectedFilters[aspectGroup.key]"
            multiple
            :placeholder="`${
              aspectGroup.label.charAt(0).toUpperCase() +
              aspectGroup.label.slice(1)
            }`"
            :options="aspectGroup.children"
            :max-tag-count="1"
            clearable
            filterable
            class="filter-select"
            size="small"
            @update:value="handleFilterChange"
          />
        </div>
      </div>
    </div>

    <!-- Sorting Section -->
    <div class="sorting-section">
      <div
        class="section-header sorting-header"
        @click="isSortingExpanded = !isSortingExpanded"
      >
        <div class="header-left">
          <n-icon
            size="16"
            class="section-icon"
            :color="`var(--warning-color)`"
          >
            <Trophy20Regular />
          </n-icon>
          <span class="section-label">Rank by artistic scores</span>
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
            class="active-badge"
          >
            Active
          </span>
        </div>
        <n-icon
          size="14"
          class="toggle-icon"
          :class="{ rotated: isSortingExpanded }"
          @click="isSortingExpanded = !isSortingExpanded"
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
        class="sorting-wrapper filters-tab-container"
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
        <div v-if="sortingType === 'criteria'" class="criteria-row">
          <template
            v-for="[groupKey, group] in Object.entries(artisticScores)"
            :key="groupKey"
          >
            <n-button
              v-for="criterion in group.criteria"
              :key="criterion.value"
              :type="
                selectedCriteria.includes(criterion.value)
                  ? groupKey === 'fundamentals'
                    ? 'primary'
                    : 'warning'
                  : 'default'
              "
              size="small"
              @click="toggleCriterion(criterion.value)"
              class="criterion-button"
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
      <div
        class="date-range-toggle"
        @click="isDateRangeExpanded = !isDateRangeExpanded"
      >
        <span class="date-range-label">More filters</span>
        <n-icon
          size="12"
          class="toggle-icon"
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
      <div v-if="isDateRangeExpanded" class="filters-tab-container">
        <div class="more-filters-content">
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
        <div style="display: flex; justify-content: space-between; width: 100%">
          <n-button @click="resetCustomWeights"> Reset to Default </n-button>
          <div style="display: flex">
            <n-button @click="showCustomWeightsModal = false">
              Cancel
            </n-button>
            <n-button type="primary" @click="saveCustomWeights">
              Apply Custom Preset
            </n-button>
          </div>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, ref, watch, h, onMounted } from "vue";
import { visualAspectsOptions } from "@/stores/searchStore.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import CustomArtisticWeights from "./CustomArtisticWeights.vue";
import TimeRangeFilter from "./TimeRangeFilter.vue";
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
} from "naive-ui";
import {
  BookOpen16Regular,
  Camera20Regular,
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
  return Object.values(selectedFilters.value).reduce(
    (total, filters) => total + filters.length,
    0,
  );
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

const handleFilterChange = () => {
  emit("filters-change", selectedFilters.value);
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

/* Unified Section Header */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  user-select: none;
}

.section-header:hover {
  background-color: var(--bg-hover);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.active-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--primary-color);
  background-color: var(--primary-color-hover);
  padding: 2px 6px;
  border-radius: 10px;
}

/* Filters Row - Responsive grid */
.filters-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
  padding: 4px 12px 8px 12px;
}

/* Desktop: force single row */
@media (min-width: 1200px) {
  .filters-row {
    grid-template-columns: repeat(9, minmax(0, 1fr));
  }
}

/* Tablet/Medium screens: flexible columns */
@media (min-width: 768px) and (max-width: 1199px) {
  .filters-row {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
}

.filter-item {
  min-width: 0;
}

.filter-select {
  width: 100%;
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
.criteria-row,
.genre-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  padding-top: 4px;
}

/* Desktop: single row */
@media (min-width: 1024px) {
  .criteria-row,
  .genre-row {
    flex-wrap: nowrap;
  }
}

/* Tablet and below: wrap */
@media (max-width: 1023px) {
  .criteria-row,
  .genre-row {
    flex-wrap: wrap;
  }
}

.criteria-select {
  flex: 1;
  min-width: 280px;
}

.criterion-button {
  flex: 1 1 auto;
  min-width: 120px;
  transition: all 0.2s ease;
  font-size: 13px;
}

.criterion-button:hover {
  transform: translateY(-1px);
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
  margin-top: 4px;
}

.date-range-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.date-range-toggle:hover {
  background-color: var(--bg-hover);
}

.date-range-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--primary-color);
}

.toggle-icon {
  color: var(--primary-color);
  transition: transform 0.3s ease;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
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

.filename-input {
  width: 100%;
  max-width: 400px;
}

.section-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

/* Mobile styles */
@media (max-width: 767px) {
  .section-header {
    padding: 10px 12px;
  }

  .section-label {
    font-size: 12px;
  }

  .toggle-icon {
    display: block;
  }

  .filters-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .sorting-header .header-left {
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
</style>
