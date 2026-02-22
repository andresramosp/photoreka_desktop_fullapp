<template>
  <div class="photos-grid-container">
    <!-- Photos Grid Controls -->
    <PhotosGridControls
      v-if="!props.hideControls"
      :basic-sort-active="basicSortActive"
      :photos="props.photos"
      @filters-change="handleFiltersChange"
      @sorting-change="handleSortingChange"
      @sort-order-change="handleSortOrderChange"
      @criteria-change="handleCriteriaChange"
      @genre-change="handleGenreChange"
      @sorting-type-change="handleSortingTypeChange"
      @custom-weights-change="handleCustomWeightsChange"
      @filename-search-change="handleFilenameSearchChange"
      @time-range-change="handleTimeRangeChange"
      @tag-search="handleTagSearch"
      @artistic-scores-change="handleArtisticScoresChange"
    />

    <!-- Grid Controls -->
    <div class="grid-controls grid-controls-base">
      <!-- Row 1: Photos count + Duplicates button -->
      <div class="controls-row-1">
        <div class="results-info results-info-base">
          <span class="results-count results-count-base">
            <span class="desktop-count">
              {{ displayedPhotos.length }}{{ hasMorePhotos ? "+" : "" }} of
              {{ filteredAndSortedPhotos.length }} photos
            </span>
          </span>
        </div>

        <div class="duplicates-controls-container desktop-only">
          <!-- Review Duplicates Button -->
          <n-tooltip placement="bottom" trigger="hover">
            <template #trigger>
              <n-button
                type="primary"
                size="small"
                secondary
                @click="handleReviewDuplicates"
                :disabled="duplicatesReviewed || isDemoUser"
                :loading="isCheckingDuplicates"
              >
                <template #icon v-if="!isCheckingDuplicates">
                  <n-icon>
                    <DuplicateOutline />
                  </n-icon>
                </template>
                {{ "Find duplicates" }}
              </n-button>
            </template>
            <span>{{
              isDemoUser
                ? "Not available in demo mode"
                : "Review duplicate photos in your selection"
            }}</span>
          </n-tooltip>

          <!-- Filter Duplicates Checkbox (only show if duplicates were reviewed and found) -->
          <div
            v-if="duplicatesReviewed && hasDuplicates"
            class="filter-duplicates-checkbox"
          >
            <n-checkbox
              :checked="filterDuplicates"
              @update:checked="handleFilterDuplicatesChange"
              size="small"
            >
              Filter duplicates
            </n-checkbox>
          </div>
        </div>
      </div>

      <!-- Row 2: Columns + Sort (Desktop) -->
      <div v-if="!isMobile" class="controls-row-2-desktop">
        <div class="grid-size-controls">
          <span class="grid-label">Columns:</span>
          <n-button-group>
            <n-button
              v-for="size in columnOptions"
              :key="size"
              :type="gridColumns === size ? 'primary' : 'default'"
              size="small"
              @click="setGridColumns(size)"
            >
              {{ size }}
            </n-button>
          </n-button-group>
        </div>

        <div class="sort-controls">
          <span class="sort-label">Sort:</span>
          <n-select
            v-model:value="basicSortType"
            :options="sortOptions"
            size="small"
            style="width: 120px"
            clearable
            placeholder="Sort"
            :disabled="sortByQuality"
            @update:value="handleBasicSortChange"
            :filterable="false"
          />
          <n-button
            v-if="basicSortActive"
            text
            size="tiny"
            @click="toggleBasicSortOrder"
            class="sort-order-icon"
            :disabled="sortByQuality"
            :title="
              basicSortOrder === 'desc'
                ? 'Descending (click for Ascending)'
                : 'Ascending (click for Descending)'
            "
          >
            <n-icon size="18">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px">
                <path
                  v-if="basicSortOrder === 'desc'"
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
        </div>

        <n-button
          size="small"
          :type="allSelected ? 'primary' : 'default'"
          @click="handleSelectAllToggle"
          class="select-all-btn"
        >
          <template #icon>
            <n-icon>
              <template v-if="allSelected">
                <SelectAllOn24Regular />
              </template>
              <template v-else>
                <SelectAllOn24Regular />
              </template>
            </n-icon>
          </template>
          <span>{{ allSelected ? "Deselect All" : "Select All" }}</span>
        </n-button>
      </div>

      <!-- Row 2: Controls (Mobile) -->
      <div v-else class="controls-row-2-mobile">
        <div class="mobile-control mobile-sort-control">
          <n-button
            text
            size="tiny"
            @click="toggleBasicSortOrder"
            class="sort-order-icon mobile-sort-icon"
            :disabled="sortByQuality"
            :title="
              basicSortOrder === 'desc'
                ? 'Descending (click for Ascending)'
                : 'Ascending (click for Descending)'
            "
          >
            <n-icon size="18">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px">
                <path
                  v-if="basicSortOrder === 'desc'"
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
          <n-select
            v-model:value="basicSortType"
            :options="sortOptions"
            size="small"
            style="width: 100%; flex: 1"
            clearable
            placeholder="None"
            :disabled="sortByQuality"
            @update:value="handleBasicSortChange"
          />
        </div>

        <div class="mobile-control">
          <n-button-group style="width: 100%">
            <n-button
              v-for="size in columnOptions"
              :key="size"
              :type="gridColumns === size ? 'primary' : 'default'"
              size="small"
              @click="setGridColumns(size)"
              style="flex: 1"
            >
              {{ size }}
            </n-button>
          </n-button-group>
        </div>

        <div class="mobile-control">
          <n-button
            size="small"
            :type="allSelected ? 'primary' : 'default'"
            @click="handleSelectAllToggle"
            style="width: 100%"
          >
            <template #icon>
              <n-icon>
                <template v-if="allSelected">
                  <SelectAllOn24Regular />
                </template>
                <template v-else>
                  <SelectAllOn24Regular />
                </template>
              </n-icon>
            </template>
          </n-button>
        </div>

        <!-- <div class="mobile-control">
          <span class="mobile-photo-count">
            {{ filteredAndSortedPhotos.length }} photos
          </span>
        </div> -->
      </div>
    </div>

    <!-- Select All Banner -->
    <div v-if="showSelectAllBanner" class="select-all-banner">
      <span class="banner-text">
        {{ displayedPhotos.length }} photos selected.
        <a @click="handleSelectAllFiltered" class="select-all-link">
          Select all {{ filteredAndSortedPhotos.length }} photos?
        </a>
      </span>
      <n-button
        text
        size="tiny"
        @click="showSelectAllBanner = false"
        class="banner-close"
      >
        <n-icon size="18">
          <CloseOutline />
        </n-icon>
      </n-button>
    </div>

    <!-- Photo Grid -->
    <div
      class="photos-grid photo-grid-base"
      :class="`grid-cols-${gridColumns}`"
    >
      <PhotoCardHub
        v-for="photo in displayedPhotos"
        :key="photo.id"
        :photo="photo"
        :selected="selectedPhotosRecord[photo.id]"
        @info="showPhotoInfo"
        @select="togglePhotoSelection"
        @show-duplicates="showDuplicates"
        :show-delete="true"
        :show-name="true"
        :show-footer="false"
        :showDuplicate="true"
        :artistic-score="getPhotoArtisticScore(photo)"
        :matched-tags="photo.matchedTags"
      />
    </div>

    <!-- Loading indicator for infinite scroll -->
    <div v-if="hasMorePhotos && isLoadingMore" class="loading-more-container">
      <n-spin size="medium">
        <template #description>Loading more photos...</template>
      </n-spin>
    </div>

    <!-- End of results indicator -->
    <div
      v-else-if="
        !hasMorePhotos && filteredAndSortedPhotos.length > PHOTOS_PER_PAGE
      "
      class="end-of-results"
    >
      <span>You've reached the end of your photos</span>
    </div>

    <!-- Dialogs -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
      :all-photos="displayedPhotos"
      :current-photo-index="currentPhotoIndex"
      @photo-navigate="handlePhotoNavigate"
    />
    <DuplicatePhotosDialog
      v-model="showDuplicatesDialog"
      :duplicates="selectedDuplicatesData"
    />

    <!-- Collection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="selectedPhotoIds.length"
      :photo-ids="selectedPhotoIds"
      @add-to-collection="handleCollectionAdded"
      @add-to-series="handleCollectionAdded"
      @cancel="handleCollectionModalCancel"
    />

    <!-- Photo Tool Selector Modal -->
    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="selectedPhotoIds.length"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />

    <!-- Delete Confirmation Modal -->
    <n-modal
      v-model:show="showDeleteConfirmDialog"
      preset="dialog"
      title="Confirm Deletion"
    >
      <template #header>
        <div style="font-size: 18px; font-weight: 600">Confirm Deletion</div>
      </template>
      <div style="padding: 16px 0">
        <p style="margin-bottom: 16px; font-size: 16px">
          Are you sure you want to delete
          <strong>{{ selectedPhotoIds.length }}</strong>
          {{ selectedPhotoIds.length === 1 ? "foto" : "fotos" }}?
        </p>
        <p style="color: #d03050; font-size: 14px; margin: 0">
          This action cannot be undone.
        </p>
      </div>
      <template #action>
        <div style="display: flex; gap: 8px; justify-content: flex-end">
          <n-button @click="showDeleteConfirmDialog = false">
            Cancelar
          </n-button>
          <n-button type="error" @click="confirmDeletePhotos">
            Delete
          </n-button>
        </div>
      </template>
    </n-modal>

    <!-- Floating Action Bar -->
    <FloatingActionBar
      :selected-count="selectedPhotoIds.length"
      :show-delete="true"
      :show-add-to-collection="displayAddToCollection"
      :show-move-to-tool="displayMoveToTool"
      :show-send-to-chat="displaySendToChat"
      :is-deleting="isDeletingPhotos"
      :is-downloading="isDownloading"
      @clear-selection="clearAllSelections"
      @delete="handleDeleteMultiple"
      @download="handleDownloadMultiple"
      @add-to-collection="handleAddToCollection"
      @move-to-tool="openToolSelector"
      @send-to-chat="handleSendToChat"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import {
  NButton,
  NButtonGroup,
  NIcon,
  NSpin,
  NCheckbox,
  NModal,
  NCard,
  NSelect,
  useMessage,
  NTooltip,
} from "naive-ui";
import { DuplicateOutline, CloseOutline } from "@vicons/ionicons5";
import { SquareOutline } from "@vicons/ionicons5";
import { useRouter } from "vue-router";
import PhotoCardHub from "./photoCards/PhotoCardHub.vue";
import PhotoInfoDialog from "./PhotoInfoDialog.vue";
import DuplicatePhotosDialog from "./DuplicatePhotosDialog.vue";
import CollectionModal from "./CollectionModal.vue";
import PhotosGridControls from "./PhotosGridControls.vue";
import PhotoToolSelector from "./PhotoToolSelector.vue";
import FloatingActionBar from "./FloatingActionBar.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useUserStore } from "@/stores/userStore";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { usePhotoUpload } from "@/composables/usePhotoUpload.js";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { CheckmarkSquare24Filled, SelectAllOn24Regular } from "@vicons/fluent";

const emit = defineEmits(["refreshCollection", "selection-change"]);
const props = defineProps({
  photos: {
    type: Array,
    default: () => [],
  },
  collectionId: {
    type: [String, Number, null],
    default: null,
  },
  displayAddToCollection: {
    type: Boolean,
    default: true,
  },
  displayMoveToTool: {
    type: Boolean,
    default: true,
  },
  displaySendToChat: {
    type: Boolean,
    default: true,
  },
  hideControls: {
    type: Boolean,
    default: false,
  },
});

const message = useMessage();
const router = useRouter();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const userStore = useUserStore();
const { downloadPhoto, downloadPhotosZip, isDownloading } = usePhotoDownload();
const { preprocessPhotos } = usePhotoUpload();
const {
  selectedPhotosRecord,
  selectedPhotoIds,
  togglePhotoSelection,
  selectAllPhotos,
  deselectAllPhotos,
  clearAllSelections,
} = useLocalPhotoSelection();

const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  takeToChat,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

const { isMobile } = useIsMobile();

// Check if user is demo
const isDemoUser = computed(() => {
  return userStore.user?.email === "demo@photorekatest.com";
});

// Grid columns state
const gridColumns = ref(8);
const filterDuplicates = ref(false);
const isCheckingDuplicates = ref(false);
const duplicatesReviewed = ref(false);
const hasDuplicates = ref(false);

// Select all banner state
const showSelectAllBanner = ref(false);
const allFilteredSelected = ref(false);

// Responsive state for column options
const windowWidth = ref(
  typeof window !== "undefined" ? window.innerWidth : 1200,
);

// Column options based on screen width
const columnOptions = computed(() => {
  if (windowWidth.value < 480) {
    return [1, 2]; // Very small screens: 1 or 2 columns
  } else if (windowWidth.value < 768) {
    return [2, 3, 4]; // Mobile: 2, 3, or 4 columns
  } else {
    return [4, 6, 8, 10]; // Desktop: original options
  }
});

// Adjust gridColumns if current value is not in available options
watch(
  columnOptions,
  (newOptions) => {
    if (!newOptions.includes(gridColumns.value)) {
      // Set to the closest available option
      gridColumns.value = newOptions[Math.min(1, newOptions.length - 1)];
    }
  },
  { immediate: true },
);

// Infinite scroll state
const PHOTOS_PER_PAGE = 50; // Número de fotos a cargar por página
const currentPage = ref(1);
const isLoadingMore = ref(false);

// State for filters and sorting (managed by PhotosGridControls)
const selectedFilters = ref({});
const filenameSearch = ref("");
const timeRange = ref(null);
const tagFilterResults = ref(null); // Array of photo IDs from tag search
const artisticScoreFilters = ref({}); // Minimum score thresholds per criterion
const sortingType = ref("none"); // 'none', 'criteria' or 'genre'
const selectedCriteria = ref([]);
const selectedGenre = ref("street");
const customWeights = ref({});
const sortOrder = ref("desc"); // 'asc', 'desc'

// Basic sorting state (date, name) - separate from scores sorting
const basicSortType = ref(null); // null initially, no sort selected
const basicSortOrder = ref("desc"); // 'asc', 'desc'
const basicSortActive = ref(false); // whether basic sorting is currently active

// Sort options for the dropdown
const sortOptions = [
  { label: "Date", value: "date" },
  { label: "Name", value: "name" },
];

// Derived state for backward compatibility
const sortByQuality = computed(() => {
  // Only allow scores sorting if basic sorting is not active
  if (basicSortActive.value) {
    return false;
  }

  if (sortingType.value === "none") {
    return false; // No sorting when "none" is selected
  } else if (sortingType.value === "criteria") {
    return selectedCriteria.value.length > 0;
  } else if (sortingType.value === "genre") {
    return true;
  }
  return false;
});

// Get dynamic criteria from useArtisticScores
const { artisticScores, formatCriterionName, calculateArtisticScore } =
  useArtisticScores();
const availableCriteria = [];
Object.values(artisticScores).forEach((group) => {
  group.criteria.forEach((criterion) => {
    availableCriteria.push({
      value: criterion.value,
      label: criterion.label,
    });
  });
});

// Initialize with no criteria selected (matching PhotosGridControls starting with "none")
selectedCriteria.value = [];

// Function to calculate artistic score for a single photo
const getPhotoArtisticScore = (photo) => {
  if (!sortByQuality.value || !photo.descriptions?.artistic_scores) {
    return null;
  }

  if (sortingType.value === "criteria") {
    // Criteria-based sorting
    if (selectedCriteria.value.length === 0) {
      return null;
    }

    // Create custom weights object from selected criteria
    const customWeights = {};
    selectedCriteria.value.forEach((criterion) => {
      customWeights[criterion] = 1.0; // Equal weight for all selected criteria
    });

    const scoreResult = calculateArtisticScore(
      photo.descriptions.artistic_scores,
      "custom",
      customWeights,
    );

    return scoreResult.average;
  } else if (sortingType.value === "genre") {
    // Genre-based sorting
    if (selectedGenre.value === "custom") {
      // Use custom weights
      const scoreResult = calculateArtisticScore(
        photo.descriptions.artistic_scores,
        "custom",
        customWeights.value,
      );
      return scoreResult.average;
    } else {
      // Use genre preset
      const scoreResult = calculateArtisticScore(
        photo.descriptions.artistic_scores,
        selectedGenre.value,
      );
      return scoreResult.average;
    }
  }

  return null;
};

// Dialog states
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref();
const showDuplicatesDialog = ref(false);
const selectedDuplicatesData = ref([]);
const showCollectionModal = ref(false);
const showDeleteConfirmDialog = ref(false);
const isDeletingPhotos = ref(false);

// Watch for selection changes and emit to parent
watch(
  selectedPhotoIds,
  (newSelection) => {
    emit("selection-change", {
      selectedCount: newSelection.length,
      selectedIds: [...newSelection],
    });

    // Hide banner if selection is cleared
    if (newSelection.length === 0) {
      showSelectAllBanner.value = false;
      allFilteredSelected.value = false;
    }
  },
  { immediate: true, deep: true },
);

// Watch for photos changes to reset duplicate review state
watch(
  () => props.photos.length,
  (newLength, oldLength) => {
    // Reset duplicate review state when photos are added
    if (newLength > (oldLength || 0)) {
      duplicatesReviewed.value = false;
      hasDuplicates.value = false;
      filterDuplicates.value = false;
    }
  },
);

// Grid functions
const setGridColumns = (columns) => {
  gridColumns.value = columns;
};

// Basic sort order toggle
const toggleBasicSortOrder = () => {
  basicSortOrder.value = basicSortOrder.value === "desc" ? "asc" : "desc";
};

// Handle basic sort selection change
const handleBasicSortChange = (value) => {
  if (value === null || value === undefined) {
    // Cleared the select - deactivate basic sort
    basicSortActive.value = false;
    basicSortType.value = null; // keep it null
  } else {
    // Selected a sort type - activate basic sort and deactivate scores sorting
    basicSortType.value = value;
    basicSortActive.value = true;
    // Deactivate scores sorting
    sortingType.value = "none";
    selectedCriteria.value = [];
  }
};

// Activate basic sort (and deactivate scores sorting if active)
const activateBasicSort = () => {
  basicSortActive.value = true;
  // Optionally, you could reset scores sorting here if needed
  // sortingType.value = "none";
};

// Handle select all toggle
const handleSelectAllToggle = () => {
  if (allSelected.value || allFilteredSelected.value) {
    // Deselect all
    clearAllSelections();
    showSelectAllBanner.value = false;
    allFilteredSelected.value = false;
  } else {
    // Select all displayed photos
    const photoIds = displayedPhotos.value.map((photo) => photo.id);
    selectAllPhotos(photoIds);

    // Show banner if there are more photos to select
    if (displayedPhotos.value.length < filteredAndSortedPhotos.value.length) {
      showSelectAllBanner.value = true;
      allFilteredSelected.value = false;
    } else {
      allFilteredSelected.value = true;
    }
  }
};

// Handle select all filtered photos
const handleSelectAllFiltered = () => {
  const photoIds = filteredAndSortedPhotos.value.map((photo) => photo.id);
  selectAllPhotos(photoIds);
  allFilteredSelected.value = true;
  showSelectAllBanner.value = false;
};

// Handler functions for PhotosGridControls events
const handleFiltersChange = (newFilters) => {
  selectedFilters.value = newFilters;
};

const handleSortingChange = (isActive) => {
  // This now receives whether sorting is active, but we use computed sortByQuality
  // No direct action needed as sortByQuality is computed from sortingType and criteria
};

const handleSortOrderChange = (newSortOrder) => {
  sortOrder.value = newSortOrder;
};

const handleCriteriaChange = (newCriteria) => {
  selectedCriteria.value = newCriteria;
  // If criteria are selected (activating scores sorting), deactivate basic sorting
  if (newCriteria.length > 0) {
    basicSortActive.value = false;
    basicSortType.value = null;
  }
};

const handleGenreChange = (newGenre) => {
  selectedGenre.value = newGenre;
};

const handleSortingTypeChange = (newType) => {
  sortingType.value = newType;
  // If activating scores sorting, deactivate basic sorting
  if (newType !== "none") {
    basicSortActive.value = false;
    basicSortType.value = null;
  }
};

const handleCustomWeightsChange = (newWeights) => {
  customWeights.value = newWeights;
};

const handleFilenameSearchChange = (searchValue) => {
  filenameSearch.value = searchValue;
};

const handleTimeRangeChange = (range) => {
  timeRange.value = range;
};

const handleTagSearch = (results) => {
  tagFilterResults.value = results;
};

const handleArtisticScoresChange = (filters) => {
  artisticScoreFilters.value = filters;
};

// Handle review duplicates (preprocess and check)
const handleReviewDuplicates = async () => {
  isCheckingDuplicates.value = true;
  try {
    // First, get all photo IDs that need preprocessing
    const photoIds = props.photos.map((photo) => photo.id);

    // Call preprocessPhotos first (this is idempotent if already processed)
    await preprocessPhotos(photoIds);

    // Then check for duplicates
    await photosStore.checkDuplicates(photoIds);

    // Count how many duplicates we found
    const duplicatesCount = props.photos.filter(
      (photo) => photo.isDuplicate,
    ).length;

    duplicatesReviewed.value = true;
    hasDuplicates.value = duplicatesCount > 0;

    if (duplicatesCount > 0) {
      message.info(
        `Found ${duplicatesCount} duplicate photos. Use the filter checkbox to view them.`,
      );
    } else {
      message.success("No duplicate photos found.");
    }
  } catch (error) {
    console.error("Error reviewing duplicates:", error);
  } finally {
    isCheckingDuplicates.value = false;
  }
};

// Handle filter duplicates change (just toggle the filter)
const handleFilterDuplicatesChange = (checked) => {
  filterDuplicates.value = checked;
};

// Function to group duplicates (same as WorkspacePhotos)
function groupDuplicates(photos) {
  const groupMap = new Map();
  const added = new Set();
  photos.forEach((photo) => {
    if (!photo.isDuplicate) return;
    const groupIds = [photo.id, ...(photo.duplicates || [])].sort((a, b) =>
      String(a).localeCompare(String(b)),
    );
    const groupKey = groupIds.join("-");
    if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
    groupMap.get(groupKey).push(photo);
  });

  const result = [];
  photos.forEach((photo) => {
    if (!photo.isDuplicate) return;
    const groupIds = [photo.id, ...(photo.duplicates || [])].sort((a, b) =>
      String(a).localeCompare(String(b)),
    );
    const groupKey = groupIds.join("-");
    if (groupMap.has(groupKey) && !added.has(groupKey)) {
      result.push(...groupMap.get(groupKey));
      added.add(groupKey);
    }
  });
  return result;
}

// Filter and sort ALL photos (without pagination limit)
const filteredAndSortedPhotos = computed(() => {
  let filtered = props.photos;

  // Apply tag filter first (if active)
  if (
    tagFilterResults.value !== null &&
    Array.isArray(tagFilterResults.value)
  ) {
    // Filter photos to only include those in tagFilterResults
    const tagPhotoIds = new Set(tagFilterResults.value.map((p) => p.photoId));
    filtered = filtered.filter((photo) => tagPhotoIds.has(photo.id));
  }

  // Apply filename search filter
  if (filenameSearch.value && filenameSearch.value.trim() !== "") {
    const searchTerm = filenameSearch.value.toLowerCase().trim();
    filtered = filtered.filter((photo) => {
      const filename = (photo.originalFileName || "").toLowerCase();
      return filename.includes(searchTerm);
    });
  }

  // Apply time range filter
  if (timeRange.value && timeRange.value.length === 2) {
    filtered = filtered.filter((photo) => {
      const photoDate = new Date(photo.descriptions?.EXIF?.dateTaken).getTime();
      if (isNaN(photoDate)) return false;
      return photoDate >= timeRange.value[0] && photoDate <= timeRange.value[1];
    });
  }

  // Apply artistic score minimum filters
  if (Object.keys(artisticScoreFilters.value).length > 0) {
    filtered = filtered.filter((photo) => {
      const scores = photo.descriptions?.artistic_scores;
      if (!scores) return false;
      return Object.entries(artisticScoreFilters.value).every(
        ([criterion, minValue]) => {
          const score = scores[criterion];
          return score !== undefined && score !== null && score >= minValue;
        },
      );
    });
  }

  // Apply visual aspects filters
  const hasActiveFilters = Object.values(selectedFilters.value).some(
    (filters) => filters.length > 0,
  );

  if (hasActiveFilters) {
    filtered = filtered.filter((photo) => {
      // Check if photo has visualAspects property
      if (!photo.descriptions.visual_aspects) {
        return false;
      }

      // Apply AND logic: photo must match ALL selected filters
      return Object.entries(selectedFilters.value).every(
        ([category, selectedValues]) => {
          // If no filters selected for this category, it passes
          if (selectedValues.length === 0) {
            return true;
          }

          // Check if photo has this visual aspect category
          const photoAspects = photo.descriptions.visual_aspects[category];
          if (!photoAspects || !Array.isArray(photoAspects)) {
            return false;
          }

          // Photo must have at least one of the selected values in this category
          return selectedValues.some((selectedValue) =>
            photoAspects.includes(selectedValue),
          );
        },
      );
    });
  }

  // Apply duplicates filter
  if (filterDuplicates.value) {
    filtered = groupDuplicates(filtered.filter((photo) => photo.isDuplicate));
  }

  // Apply sorting by artistic score
  // Explicitly reference all sorting-related reactive variables to ensure reactivity
  const currentSortByQuality = sortByQuality.value;
  const currentSortOrder = sortOrder.value;

  const currentBasicSortType = basicSortType.value;
  const currentBasicSortOrder = basicSortOrder.value;
  const currentBasicSortActive = basicSortActive.value;

  // SORTING LOGIC - Two mutually exclusive modes

  // Apply basic sorting (date, name) when active
  if (currentBasicSortActive && currentBasicSortType) {
    filtered = [...filtered].sort((a, b) => {
      let compareResult = 0;

      if (currentBasicSortType === "date") {
        // Sort by date using EXIF dateTaken
        const dateA = new Date(a.descriptions?.EXIF?.dateTaken || 0);
        const dateB = new Date(b.descriptions?.EXIF?.dateTaken || 0);
        compareResult = dateA.getTime() - dateB.getTime();
      } else if (currentBasicSortType === "name") {
        // Sort by originalFileName
        const nameA = (a.originalFileName || "").toLowerCase();
        const nameB = (b.originalFileName || "").toLowerCase();
        compareResult = nameA.localeCompare(nameB);
      }

      // Apply sort order
      return currentBasicSortOrder === "desc" ? -compareResult : compareResult;
    });
  }
  // Apply artistic score sorting when no basic sorting is active
  else if (currentSortByQuality) {
    filtered = [...filtered].sort((a, b) => {
      const scoreA = getPhotoArtisticScore(a);
      const scoreB = getPhotoArtisticScore(b);

      // Handle null scores (photos without scores go to the end)
      if (scoreA === null && scoreB === null) return 0;
      if (scoreA === null) return 1;
      if (scoreB === null) return -1;

      if (currentSortOrder === "desc") {
        return scoreB - scoreA;
      } else {
        return scoreA - scoreB;
      }
    });
  }

  return filtered;
});

// Display only the photos for the current pages (with infinite scroll)
const displayedPhotos = computed(() => {
  const totalPhotosToShow = currentPage.value * PHOTOS_PER_PAGE;
  const result = filteredAndSortedPhotos.value.slice(0, totalPhotosToShow);

  // If there are tag filter results, enrich photos with matchedTags
  if (
    tagFilterResults.value !== null &&
    Array.isArray(tagFilterResults.value)
  ) {
    const tagMap = new Map(
      tagFilterResults.value.map((item) => [
        item.photoId,
        item.matchedIncluded,
      ]),
    );

    return result.map((photo) => {
      const matchedTags = tagMap.get(photo.id);
      if (matchedTags && matchedTags.length > 0) {
        return {
          ...photo,
          matchedTags: matchedTags,
        };
      }
      return photo;
    });
  }

  return result;
});

// Check if all photos are selected
const allSelected = computed(() => {
  if (allFilteredSelected.value) {
    return true;
  }
  return (
    displayedPhotos.value.length > 0 &&
    displayedPhotos.value.every((photo) => selectedPhotosRecord.value[photo.id])
  );
});

// Computed to check if there are more photos to load
const hasMorePhotos = computed(() => {
  return displayedPhotos.value.length < filteredAndSortedPhotos.value.length;
});

const handleScroll = (e) => {
  if (isLoadingMore.value || !hasMorePhotos.value) return;

  const container = document.querySelector(".view-container");
  if (!container) return;

  const scrollPosition = container.scrollTop + container.clientHeight;
  const documentHeight = container.scrollHeight;
  const threshold = 1000; // Load more when 1000px from bottom

  if (scrollPosition >= documentHeight - threshold) {
    loadMorePhotos();
  }
};

const loadMorePhotos = async () => {
  if (isLoadingMore.value || !hasMorePhotos.value) return;

  isLoadingMore.value = true;

  // Simulate a small delay to avoid too rapid loading
  await new Promise((resolve) => setTimeout(resolve, 200));

  currentPage.value += 1;
  isLoadingMore.value = false;
};

// Reset pagination when filters or sorting changes
const resetPagination = () => {
  currentPage.value = 1;
  isLoadingMore.value = false;
};

// Watch for filter/sort changes to reset pagination
watch(
  [
    selectedFilters,
    filenameSearch,
    timeRange,
    tagFilterResults,
    artisticScoreFilters,
    sortingType,
    selectedCriteria,
    selectedGenre,
    customWeights,
    sortOrder,
    filterDuplicates,
    basicSortType,
    basicSortOrder,
    basicSortActive,
  ],
  () => {
    resetPagination();
    showSelectAllBanner.value = false;
    allFilteredSelected.value = false;
  },
  { deep: true },
);

// Watch for props.photos changes to reset pagination
watch(
  () => props.photos.length,
  (newLength, oldLength) => {
    resetPagination();
  },
);

// Lifecycle hooks for scroll listener
onMounted(() => {
  nextTick(() => {
    const container = document.querySelector(".view-container");

    if (container === document.documentElement) {
      window.addEventListener("scroll", handleScroll, { passive: true });
    } else {
      container.addEventListener("scroll", handleScroll, { passive: true });
    }

    // Debug initial state
  });

  // Add resize listener for responsive column options
  window.addEventListener("resize", handleResize);
});

// Handle window resize for responsive columns
const handleResize = () => {
  windowWidth.value = window.innerWidth;
};

onUnmounted(() => {
  const container = document.querySelector(".view-container");
  if (container === document.documentElement) {
    window.removeEventListener("scroll", handleScroll);
  } else if (container && container.removeEventListener) {
    container.removeEventListener("scroll", handleScroll);
  }

  // Remove resize listener
  window.removeEventListener("resize", handleResize);
});

// Computed for current photo index in displayed photos
const currentPhotoIndex = computed(() => {
  if (!selectedDialogPhoto.value) return -1;
  return displayedPhotos.value.findIndex(
    (photo) => photo.id === selectedDialogPhoto.value.id,
  );
});

// Photo actions
const showPhotoInfo = async (photo) => {
  const fullPhoto = await photosStore.fetchPhoto(photo.id);
  selectedDialogPhoto.value = fullPhoto;
  showPhotoInfoDialog.value = true;
};

// Handle photo navigation in dialog
const handlePhotoNavigate = async (newIndex) => {
  if (newIndex < 0 || newIndex >= displayedPhotos.value.length) return;

  const photo = displayedPhotos.value[newIndex];
  const fullPhoto = await photosStore.fetchPhoto(photo.id);
  selectedDialogPhoto.value = fullPhoto;
};

const showDuplicates = (duplicates) => {
  selectedDuplicatesData.value = duplicates;
  showDuplicatesDialog.value = true;
};

// Batch actions
const handleDeleteMultiple = async () => {
  // Solo mostrar modal de confirmación si NO es una colección
  if (!props.collectionId) {
    showDeleteConfirmDialog.value = true;
    return;
  }

  // Para colecciones, eliminar directamente (comportamiento actual)
  try {
    await collectionsStore.removePhotosFromCollection(
      props.collectionId,
      selectedPhotoIds.value,
    );
    // Recargar la ruta actual para refrescar la colección (sin reload completo)
    emit("refreshCollection");
  } catch (e) {}
  clearAllSelections();
};

const confirmDeletePhotos = async () => {
  showDeleteConfirmDialog.value = false;
  isDeletingPhotos.value = true;

  try {
    await photosStore.deletePhotos(selectedPhotoIds.value);
    clearAllSelections();
  } catch (error) {
    console.error("Error deleting photos:", error);
  } finally {
    isDeletingPhotos.value = false;
  }
};

const handleAddToCollection = () => {
  if (selectedPhotoIds.value.length > 0) {
    showCollectionModal.value = true;
  }
};

const handleCollectionAdded = (data) => {
  // Clear selections after successfully adding to collection
  clearAllSelections();
  // Optionally emit an event to refresh the collection if we're viewing one
  if (props.collectionId) {
    emit("refreshCollection");
  }
};

const handleCollectionModalCancel = () => {
  showCollectionModal.value = false;
};

const handleDownloadMultiple = async () => {
  try {
    const photosToDownload = selectedPhotoIds.value
      .map((id) => photosStore.photos.find((p) => p.id == id))
      .filter(Boolean);

    if (photosToDownload.length === 1) {
      // Download single photo directly (not as ZIP)
      await downloadPhoto(photosToDownload[0]);
    } else {
      // Download multiple photos as ZIP
      await downloadPhotosZip(photosToDownload);
    }
  } catch (error) {
    console.error("Download multiple photos failed:", error);
  }
};

const handleToolSelected = async (toolId) => {
  await takeToTool(toolId, selectedPhotoIds.value, clearAllSelections);
  closeToolSelector();
};

const handleSendToChat = async () => {
  await takeToChat(selectedPhotoIds.value, clearAllSelections);
};
</script>

<style scoped>
.photos-grid-container {
  width: 100%;
}

/* Grid Controls */
.grid-controls-base {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
}

.desktop-count {
  display: inline;
}

.desktop-only {
  display: flex;
}

/* Row 1: Photos count + Duplicates */
.controls-row-1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* Row 2: Desktop Version */
.controls-row-2-desktop {
  display: flex;
  flex: 1;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}

/* Row 2: Mobile Version */
.controls-row-2-mobile {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr; /* Photo count | Columns | Sort | Select */
  /* CAMBIAR PROPORCIONES: Por ejemplo 1fr 0.6fr 1.4fr 1fr */
  gap: 8px;
  width: 100%;
  align-items: center;
}

.mobile-control {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mobile-photo-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  text-align: center;
  white-space: nowrap;
}

.results-info-base {
  display: flex;
  align-items: center;
  gap: 12px;
}

.results-count-base {
  font-weight: 500;
  color: var(--text-secondary);
}

.grid-size-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.grid-label {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-label {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.sort-order-icon {
  color: var(--text-primary);
  transition: all 0.2s ease;
  opacity: 0.7;
}

.sort-order-icon:hover {
  color: var(--accent-color);
  opacity: 1;
  transform: scale(1.1);
}

.mobile-sort-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mobile-sort-icon {
  flex-shrink: 0;
}

.select-all-btn {
  white-space: nowrap;
  margin-left: 8px;
}

/* Select All Banner */
.select-all-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: var(--primary-color);
  border-radius: 8px;
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.banner-text {
  font-size: 14px;
  font-weight: 500;
}

.select-all-link {
  color: white;
  text-decoration: underline;
  cursor: pointer;
  font-weight: 600;
  margin-left: 4px;
  transition: opacity 0.2s ease;
}

.select-all-link:hover {
  opacity: 0.85;
}

.banner-close {
  color: white;
  opacity: 0.9;
  transition: opacity 0.2s ease;
}

.banner-close:hover {
  opacity: 1;
}

.filter-duplicates-container {
  display: flex;
  align-items: center;
}

.duplicates-controls-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-duplicates-checkbox {
  display: flex;
  align-items: center;
}

/* Photo Grid */
.photo-grid-base {
  display: grid;
  gap: 17px;
}

.photo-grid-base.grid-cols-1 {
  grid-template-columns: 1fr;
}

.photo-grid-base.grid-cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.photo-grid-base.grid-cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

.photo-grid-base.grid-cols-4 {
  grid-template-columns: repeat(4, 1fr);
}

.photo-grid-base.grid-cols-5 {
  grid-template-columns: repeat(5, 1fr);
}

.photo-grid-base.grid-cols-6 {
  grid-template-columns: repeat(6, 1fr);
}

.photo-grid-base.grid-cols-8 {
  grid-template-columns: repeat(8, 1fr);
}

.photo-grid-base.grid-cols-10 {
  grid-template-columns: repeat(10, 1fr);
}

/* Loading and end of results indicators */
.loading-more-container,
.end-of-results {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  margin-top: 20px;
}

.end-of-results {
  color: var(--text-primary);
  font-size: 14px;
  opacity: 0.7;
}

.loading-more-container {
  color: var(--text-secondary);
}

/* Responsive */
@media (max-width: 1200px) {
  .photo-grid-base.grid-cols-6,
  .photo-grid-base.grid-cols-8 {
    grid-template-columns: repeat(5, 1fr);
  }
  .photo-grid-base.grid-cols-10 {
    grid-template-columns: repeat(7, 1fr);
  }
}

@media (max-width: 1024px) {
  .photo-grid-base.grid-cols-5,
  .photo-grid-base.grid-cols-6,
  .photo-grid-base.grid-cols-8,
  .photo-grid-base.grid-cols-10 {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 768px) {
  .desktop-only {
    display: none !important;
  }

  .desktop-count {
    display: none;
  }

  .grid-controls-base {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 16px;
  }

  .controls-row-1 {
    display: none !important;
  }

  .results-info-base {
    display: none;
  }

  .photo-grid-base {
    gap: 12px;
  }

  .photo-grid-base.grid-cols-1 {
    grid-template-columns: 1fr;
  }

  .photo-grid-base.grid-cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }

  .photo-grid-base.grid-cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }

  .photo-grid-base.grid-cols-4 {
    grid-template-columns: repeat(4, 1fr);
  }

  .photo-grid-base.grid-cols-5,
  .photo-grid-base.grid-cols-6,
  .photo-grid-base.grid-cols-8,
  .photo-grid-base.grid-cols-10 {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .mobile-photo-count {
    font-size: 13px;
  }

  .select-all-banner {
    flex-direction: row;
    padding: 10px 12px;
  }

  .banner-text {
    font-size: 13px;
    flex: 1;
  }

  .photo-grid-base {
    gap: 10px;
  }

  .photo-grid-base.grid-cols-3,
  .photo-grid-base.grid-cols-4,
  .photo-grid-base.grid-cols-5,
  .photo-grid-base.grid-cols-6,
  .photo-grid-base.grid-cols-8,
  .photo-grid-base.grid-cols-10 {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
