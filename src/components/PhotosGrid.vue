<template>
  <div ref="gridContainerRef" class="photos-grid-container">
    <!-- Photos Grid Controls -->
    <PhotosGridControls
      v-if="!props.hideControls"
      :basic-sort-active="basicSortActive"
      :photos="props.photos"
      :scroll-collapsed="false"
      @filters-change="handleFiltersChange"
      @sorting-change="handleSortingChange"
      @sort-order-change="handleSortOrderChange"
      @criteria-change="handleCriteriaChange"
      @genre-change="handleGenreChange"
      @sorting-type-change="handleSortingTypeChange"
      @custom-weights-change="handleCustomWeightsChange"
      @filename-search-change="handleFilenameSearchChange"
      @time-range-change="handleTimeRangeChange"
      @metadata-filters-change="handleMetadataFiltersChange"
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
          <!-- Find Duplicates Dropdown Button -->
          <n-dropdown
            v-if="findDuplicatesEnabled"
            :options="duplicateCheckOptions"
            :disabled="isDemoUser || isCheckingDuplicates"
            trigger="click"
            placement="bottom-start"
            @select="handleDuplicateCheckSelect"
          >
            <n-button
              type="info"
              size="small"
              secondary
              :disabled="isDemoUser"
              :loading="isCheckingDuplicates"
            >
              <template #icon v-if="!isCheckingDuplicates">
                <n-icon>
                  <TheaterComedyOutlined />
                </n-icon>
              </template>
              Check duplicates
            </n-button>
          </n-dropdown>

          <!-- Duplicates filter (only show if duplicates were reviewed and found) -->
          <div
            v-if="duplicatesReviewed && hasDuplicates"
            class="filter-duplicates-checkbox"
          >
            <n-radio-group
              :value="filterDuplicates"
              @update:value="handleFilterDuplicatesChange"
              size="small"
              name="duplicates-filter"
            >
              <n-radio-button value="all">All</n-radio-button>
              <n-radio-button value="duplicates">Duplicates</n-radio-button>
              <n-radio-button value="non-duplicates">Unique</n-radio-button>
            </n-radio-group>
          </div>

          <!-- Bulk delete actions (only when filtering duplicates) -->
          <template v-if="filterDuplicates === 'duplicates' && hasDuplicates">
            <n-dropdown
              v-if="props.context === 'lightbox'"
              :options="lightboxCleanOptions"
              @select="handleLightboxCleanSelect"
              trigger="click"
            >
              <n-button
                type="info"
                size="small"
                secondary
                :loading="isDeletingBulkDuplicates"
              >
                <template #icon>
                  <n-icon><TrashOutline /></n-icon>
                </template>
                Clean duplicates
              </n-button>
            </n-dropdown>
            <n-button
              v-else
              type="info"
              size="small"
              secondary
              :loading="isDeletingBulkDuplicates"
              @click="handleDeleteAllDuplicates"
            >
              <template #icon>
                <n-icon><TrashOutline /></n-icon>
              </template>
              Clean duplicates
            </n-button>
          </template>
        </div>

        <!-- Extra controls slot (e.g. upload buttons from parent) -->
        <slot name="row1-extra" />
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
          :type="showSource ? 'primary' : 'default'"
          @click="showSource = !showSource"
          class="source-toggle-btn"
          title="Toggle source icons (Lightroom, Google Photos)"
        >
          <template #icon>
            <n-icon><CloudOutline /></n-icon>
          </template>
          <span>Source</span>
        </n-button>

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

    <!-- Scrollable photo area (wraps grid + pagination when scrollable=true) -->
    <div
      ref="scrollAreaRef"
      :class="{ 'photos-scroll-area': props.scrollable }"
      :style="
        props.scrollable && scrollAreaHeight
          ? { height: scrollAreaHeight + 'px' }
          : null
      "
    >
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
        :style="{ '--grid-cols': gridColumns }"
      >
        <!-- Grouped band view when filtering duplicates -->
        <template v-if="filterDuplicates && groupedPhotoChunks.length > 0">
          <div
            v-for="chunk in groupedPhotoChunks"
            :key="chunk.groupIndex"
            class="dup-group-band"
            :class="`dup-group-color-${chunk.groupIndex % 2}`"
          >
            <PhotoCardHub
              v-for="photo in chunk.photos"
              :key="photo.id"
              :data-photo-id="photo.id"
              :photo="photo"
              :selected="selectedPhotosRecord[photo.id]"
              :focused="
                focusedByKeyboard && String(photo.id) === String(focusedPhotoId)
              "
              @info="showPhotoInfo"
              @select="
                (id, evt) =>
                  handlePhotoSelect(
                    id,
                    evt,
                    displayedPhotos.map((p) => p.id),
                  )
              "
              @swap-photo="handleSwapPhoto"
              :show-delete="true"
              :show-name="true"
              :show-footer="false"
              :showDuplicate="true"
              :show-source="showSource"
              :artistic-score="getPhotoArtisticScore(photo)"
              :matched-tags="photo.matchedTags"
            />
          </div>
        </template>

        <!-- Normal flat view -->
        <template v-else>
          <!-- Suggest Photos Button -->
          <div
            v-if="props.showSuggestButton && displayedPhotos.length > 0"
            class="suggest-photos-card"
            @click="emit('suggest-photos')"
            title="Suggest similar photos to add"
          >
            <n-icon size="48" color="var(--primary-color)">
              <AddOutline />
            </n-icon>
            <span class="suggest-label">Suggest Photos</span>
          </div>
          <PhotoCardHub
            v-for="photo in displayedPhotos"
            :key="photo.id"
            :data-photo-id="photo.id"
            :photo="photo"
            :selected="selectedPhotosRecord[photo.id]"
            :focused="
              focusedByKeyboard && String(photo.id) === String(focusedPhotoId)
            "
            @info="showPhotoInfo"
            @select="
              (id, evt) =>
                handlePhotoSelect(
                  id,
                  evt,
                  displayedPhotos.map((p) => p.id),
                )
            "
            @swap-photo="handleSwapPhoto"
            :show-delete="true"
            :show-name="true"
            :show-footer="false"
            :showDuplicate="true"
            :show-source="showSource"
            :artistic-score="getPhotoArtisticScore(photo)"
            :matched-tags="photo.matchedTags"
          />
        </template>
      </div>

      <!-- Loading indicator for infinite scroll -->
      <div v-if="hasMorePhotos && isLoadingMore" class="loading-more-container">
        <SpiralGridLoader variant="primary" :size="40" />
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
    </div>
    <!-- end photos-scroll-area -->

    <!-- Dialogs -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
      :all-photos="displayedPhotos"
      :current-photo-index="currentPhotoIndex"
      @photo-navigate="handlePhotoNavigate"
      @change-photo="selectedDialogPhoto = $event"
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

    <!-- Checking Duplicates Modal -->
    <n-modal
      :show="isCheckingDuplicates"
      :mask-closable="false"
      :close-on-esc="false"
    >
      <div class="dup-check-modal">
        <span class="dup-check-title">Finding duplicates</span>
        <SpiralGridLoader variant="primary" :size="48" />
        <p class="dup-check-subtitle">
          {{
            lastDuplicateType === "similar"
              ? "Analyzing visual similarity for duplicates"
              : "Analyzing"
          }}
          {{ props.photos.length }} photos for duplicates...
        </p>
        <n-button @click="cancelDuplicatesCheck">Cancel</n-button>
      </div>
    </n-modal>

    <!-- EXIF Warning Modal -->
    <n-modal
      v-model:show="showExifWarningModal"
      preset="dialog"
      :closable="true"
    >
      <template #header>
        <div style="font-size: 18px; font-weight: 600">
          Insufficient EXIF Data
        </div>
      </template>
      <div style="padding: 16px 0">
        <p style="margin-bottom: 16px; font-size: 15px; line-height: 1.6">
          Your photos don't have enough EXIF data for exact duplicate checking
          (less than 90% have a capture date). Would you like to perform a
          similarity check instead?
        </p>
      </div>
      <template #action>
        <div style="display: flex; gap: 8px; justify-content: flex-end">
          <n-button @click="showExifWarningModal = false">Cancel</n-button>
          <n-button type="info" @click="handleExifWarningProceedSimilar">
            Check similarity
          </n-button>
          <n-button
            type="default"
            secondary
            @click="handleExifWarningProceedExact"
          >
            Run exact anyway
          </n-button>
        </div>
      </template>
    </n-modal>

    <!-- Delete Duplicates Confirmation Modal -->
    <n-modal
      v-model:show="showDeleteDuplicatesConfirmDialog"
      preset="dialog"
      title="Confirm Deletion"
    >
      <template #header>
        <div style="font-size: 18px; font-weight: 600">Confirm Deletion</div>
      </template>
      <div style="padding: 16px 0">
        <p style="margin-bottom: 16px; font-size: 16px">
          Are you sure you want to delete
          <strong>{{ duplicatesToDeleteCount }}</strong>
          {{ duplicatesToDeleteCount === 1 ? "photo" : "photos" }}?
        </p>
        <p style="color: #d03050; font-size: 14px; margin: 0">
          This action cannot be undone.
        </p>
      </div>
      <template #action>
        <div style="display: flex; gap: 8px; justify-content: flex-end">
          <n-button @click="showDeleteDuplicatesConfirmDialog = false">
            Cancel
          </n-button>
          <n-button type="error" @click="confirmDeleteDuplicates">
            Delete
          </n-button>
        </div>
      </template>
    </n-modal>

    <!-- Swap Photo Dialog -->
    <SwapPhotoDialog
      v-model="showSwapDialog"
      :new-photo-id="swapNewPhotoId"
      :target-ids="swapTargetIds"
      @swap-complete="handleSwapComplete"
    />

    <!-- Floating Action Bar -->
    <FloatingActionBar
      :selected-ids="selectedPhotoIds"
      :show-delete="true"
      :show-delete-options="!!collectionId"
      :show-add-to-collection="displayAddToCollection"
      :show-move-to-tool="displayMoveToTool"
      :show-send-to-chat="displaySendToChat"
      :is-deleting="isDeletingPhotos"
      :is-downloading="isDownloading"
      @clear-selection="clearAllSelections"
      @delete="handleDeleteMultiple"
      @remove-from-collection="handleRemoveFromCollection"
      @download="handleDownloadMultiple"
      @add-to-collection="handleAddToCollection"
      @move-to-tool="openToolSelector"
      @send-to-chat="handleSendToChat"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick, h } from "vue";
import {
  NButton,
  NButtonGroup,
  NIcon,
  NRadioGroup,
  NRadioButton,
  NModal,
  NCard,
  NSelect,
  NDropdown,
  useMessage,
  NTooltip,
} from "naive-ui";
import SpiralGridLoader from "./SpiralGridLoader.vue";
import {
  CloseOutline,
  AddOutline,
  SparklesOutline,
  TrashOutline,
  FingerPrintOutline,
  EyeOutline,
  CloudOutline,
} from "@vicons/ionicons5";
import { SquareOutline } from "@vicons/ionicons5";
import { useRouter } from "vue-router";
import PhotoCardHub from "./photoCards/PhotoCardHub.vue";
import PhotoInfoDialog from "./PhotoInfoDialog.vue";
import CollectionModal from "./CollectionModal.vue";
import PhotosGridControls from "./PhotosGridControls.vue";
import PhotoToolSelector from "./PhotoToolSelector.vue";
import FloatingActionBar from "./FloatingActionBar.vue";
import SwapPhotoDialog from "./SwapPhotoDialog.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useUserStore } from "@/stores/userStore";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { usePhotoRangeSelection } from "@/composables/usePhotoRangeSelection.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { useActivityLogger } from "@/composables/useActivityLogger";
import {
  photoMatchesMetadataFilters,
  createEmptyMetadataFilters,
  countActiveMetadataFilters,
} from "@/utils/metadataFilters.js";
import { CheckmarkSquare24Filled, SelectAllOn24Regular } from "@vicons/fluent";
import { TheaterComedyOutlined } from "@vicons/material";

const emit = defineEmits([
  "refreshCollection",
  "selection-change",
  "suggest-photos",
  "duplicates-filter-change",
  "scroll-direction",
]);
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
  findDuplicatesEnabled: {
    type: Boolean,
    default: true,
  },
  context: {
    type: String,
    default: "workspace",
    validator: (v) => ["workspace", "lightbox"].includes(v),
  },
  showSuggestButton: {
    type: Boolean,
    default: false,
  },
  scrollable: {
    type: Boolean,
    default: false,
  },
});

const scrollAreaRef = ref(null);
const gridContainerRef = ref(null);
const scrollAreaHeight = ref(null);
let scrollAreaResizeObserver = null;

const message = useMessage();
const router = useRouter();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const userStore = useUserStore();
const { downloadPhoto, downloadPhotosZip, isDownloading } = usePhotoDownload();
const {
  selectedPhotosRecord,
  selectedPhotoIds,
  togglePhotoSelection,
  selectAllPhotos,
  deselectAllPhotos,
  clearAllSelections,
  handlePhotoSelect,
  resetRangeState,
  focusedPhotoId,
  focusedByKeyboard,
  attachKeyboardListeners,
  detachKeyboardListeners,
} = usePhotoRangeSelection();

const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  takeToChat,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

const { isMobile } = useIsMobile();
const { logActivity } = useActivityLogger();

// Check if user is demo
const isDemoUser = computed(() => {
  return userStore.user?.email === "demo@photorekatest.com";
});

// Grid columns state
const gridColumns = ref(8);
const filterDuplicates = ref("all"); // 'all' | 'duplicates' | 'non-duplicates'
const isCheckingDuplicates = ref(false);
const isDeletingBulkDuplicates = ref(false);
const duplicatesReviewed = ref(false);
const hasDuplicates = ref(false);
const lastDuplicateType = ref(null); // 'exact' or 'similar'
const duplicatesCheckCancelled = ref(false);
const showExifWarningModal = ref(false);
const showDeleteDuplicatesConfirmDialog = ref(false);
const duplicatesToDeleteCount = ref(0);
let pendingDeleteAction = null;

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
const metadataFilters = ref(createEmptyMetadataFilters());
const timeRange = ref(null);
const tagFilterResults = ref(null); // Array of photo IDs from tag search
const artisticScoreFilters = ref({}); // Minimum score thresholds per criterion
const sortingType = ref("none"); // 'none', 'criteria' or 'genre'
const selectedCriteria = ref([]);
const selectedGenre = ref(null); // null = nothing selected in the genre tab
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
    // Only active when a genre is actually selected in the genre tab
    return !!selectedGenre.value;
  }
  return false;
});

// Get dynamic criteria from useArtisticScores
const { artisticScores, formatCriterionName, calculateArtisticScore } =
  useArtisticScores({ profile: () => userStore.user?.profiles });
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
    if (!selectedGenre.value) {
      return null;
    }
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
const showCollectionModal = ref(false);
const showDeleteConfirmDialog = ref(false);
const isDeletingPhotos = ref(false);

// Swap dialog state
const showSwapDialog = ref(false);
const swapNewPhotoId = ref(null);
const swapTargetIds = ref([]);

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
      filterDuplicates.value = "all";
    }
  },
);

// Emit event when duplicates filter changes
watch([filterDuplicates, duplicatesReviewed], ([newFilter, newReviewed]) => {
  const activeFilter = newFilter !== "all" && newReviewed ? newFilter : "all";
  const filteredIds =
    activeFilter === "non-duplicates"
      ? filteredAndSortedPhotos.value.map((p) => p.id)
      : [];
  emit("duplicates-filter-change", { filter: activeFilter, filteredIds });
});

// Grid functions
const setGridColumns = (columns) => {
  gridColumns.value = columns;
};

// Source indicator toggle
const showSource = ref(false);

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
    logActivity("filter_apply", {
      context: props.context,
      filter: "basic_sort",
      sortType: value,
    });
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
  const active = Object.keys(newFilters).filter((k) => {
    const v = newFilters[k];
    return (
      v !== null &&
      v !== undefined &&
      v !== false &&
      !(Array.isArray(v) && v.length === 0)
    );
  });
  if (active.length > 0) {
    logActivity("filter_apply", { context: props.context, filters: active });
  }
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
    logActivity("filter_apply", {
      context: props.context,
      filter: "criteria",
      criteria: newCriteria,
    });
  }
};

const handleGenreChange = (newGenre) => {
  selectedGenre.value = newGenre;
  logActivity("filter_apply", {
    context: props.context,
    filter: "genre",
    genre: newGenre,
  });
};

const handleSortingTypeChange = (newType) => {
  sortingType.value = newType;
  // If activating scores sorting, deactivate basic sorting
  if (newType !== "none") {
    basicSortActive.value = false;
    basicSortType.value = null;
    logActivity("filter_apply", {
      context: props.context,
      filter: "sort_type",
      sortingType: newType,
    });
  }
};

const handleCustomWeightsChange = (newWeights) => {
  customWeights.value = newWeights;
};

const handleFilenameSearchChange = (searchValue) => {
  filenameSearch.value = searchValue;
};

const handleMetadataFiltersChange = (filters) => {
  metadataFilters.value = filters;
  const activeCount = countActiveMetadataFilters(filters);
  if (activeCount > 0) {
    logActivity("filter_apply", {
      context: props.context,
      filter: "metadata",
      count: activeCount,
    });
  }
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

// Dropdown options for duplicate check methods
const duplicateCheckOptions = computed(() => [
  {
    label: "Exact timestamp",
    key: "exact",
    icon: () => h(NIcon, null, { default: () => h(FingerPrintOutline) }),
  },
  {
    label: "Visual similarity",
    key: "similar",
    icon: () => h(NIcon, null, { default: () => h(EyeOutline) }),
  },
]);

const handleDuplicateCheckSelect = (key) => {
  if (key === "exact") {
    // Check if >90% of photos have dateTaken in EXIF
    const total = props.photos.length;
    if (total > 0) {
      const withDate = props.photos.filter(
        (p) => !!p.descriptions?.EXIF?.dateTaken,
      ).length;
      if (withDate / total < 0.9) {
        showExifWarningModal.value = true;
        return;
      }
    }
  }
  handleReviewDuplicates(key);
};

const handleExifWarningProceedSimilar = () => {
  showExifWarningModal.value = false;
  handleReviewDuplicates("similar");
};

const handleExifWarningProceedExact = () => {
  showExifWarningModal.value = false;
  handleReviewDuplicates("exact");
};

// Handle review duplicates (preprocess and check)
const handleReviewDuplicates = async (type = "exact") => {
  isCheckingDuplicates.value = true;
  duplicatesCheckCancelled.value = false;
  lastDuplicateType.value = type;
  try {
    const photoIds = props.photos.map((photo) => photo.id);
    const scope = props.context === "workspace" ? "workspace" : "lightbox";

    if (type === "similar") {
      // Visual similarity duplicate detection
      await photosStore.checkSimilarDuplicates(photoIds, scope);
    } else {
      // File origin exact duplicate detection
      await photosStore.checkExactDuplicates(photoIds, scope);
    }

    if (duplicatesCheckCancelled.value) return;

    const duplicatesCount = props.photos.filter(
      (photo) => photo.isExactDuplicate || photo.isAlreadyAnalyzed,
    ).length;

    duplicatesReviewed.value = true;
    hasDuplicates.value = duplicatesCount > 0;

    if (duplicatesCount > 0) {
      filterDuplicates.value = "duplicates";
      message.info(`Found ${duplicatesCount} duplicate photos.`);
    } else {
      message.success("No duplicate photos found.");
    }
  } catch (error) {
    if (!duplicatesCheckCancelled.value) {
      console.error("Error reviewing duplicates:", error);
    }
  } finally {
    isCheckingDuplicates.value = false;
  }
};

const cancelDuplicatesCheck = () => {
  duplicatesCheckCancelled.value = true;
  isCheckingDuplicates.value = false;
};

// Handle filter duplicates change
const handleFilterDuplicatesChange = (value) => {
  filterDuplicates.value = value;
};

// Lightbox clean duplicates dropdown options (computed to show live counts)
const lightboxCleanOptions = computed(() => {
  const alreadyAnalyzedCount = props.photos.filter(
    (p) => p.isAlreadyAnalyzed,
  ).length;
  return [
    { label: "Within Lightbox", key: "within-upload" },
    {
      label: `Already in Workspace${alreadyAnalyzedCount > 0 ? ` (${alreadyAnalyzedCount})` : ""}`,
      key: "already-analyzed",
      disabled: alreadyAnalyzedCount === 0,
    },
  ];
});

const handleLightboxCleanSelect = (key) => {
  if (key === "within-upload") handleDeleteDuplicatesWithinUpload();
  else if (key === "already-analyzed") handleDeleteAlreadyAnalyzed();
};

// Helper to reset duplicate state after bulk delete
const resetDuplicateState = () => {
  duplicatesReviewed.value = false;
  hasDuplicates.value = false;
  filterDuplicates.value = "all";
  lastDuplicateType.value = null;
};

const showDeleteDuplicatesConfirm = (count, action) => {
  duplicatesToDeleteCount.value = count;
  pendingDeleteAction = action;
  showDeleteDuplicatesConfirmDialog.value = true;
};

const confirmDeleteDuplicates = async () => {
  showDeleteDuplicatesConfirmDialog.value = false;
  if (pendingDeleteAction) {
    await pendingDeleteAction();
    pendingDeleteAction = null;
  }
};

// Lightbox: delete duplicate non-processed photos, keeping one per group
const handleDeleteDuplicatesWithinUpload = () => {
  const lightboxPhotos = filteredAndSortedPhotos.value.filter(
    (p) =>
      p.status !== "processed" && (p.isExactDuplicate || p.isAlreadyAnalyzed),
  );

  const lightboxIdSet = new Set(lightboxPhotos.map((p) => p.id));
  const lightboxMap = new Map(lightboxPhotos.map((p) => [p.id, p]));
  const assigned = new Set();
  const groupsList = [];

  // Group by direct bidirectional exactDuplicates (lightbox-to-lightbox)
  lightboxPhotos.forEach((photo) => {
    if (assigned.has(photo.id)) return;
    const group = [photo.id];
    assigned.add(photo.id);
    (photo.exactDuplicates || []).forEach((dupId) => {
      if (!lightboxIdSet.has(dupId) || assigned.has(dupId)) return;
      const dupPhoto = lightboxMap.get(dupId);
      if (dupPhoto && (dupPhoto.exactDuplicates || []).includes(photo.id)) {
        group.push(dupId);
        assigned.add(dupId);
      }
    });
    if (group.length >= 2) groupsList.push(group);
  });

  const toDelete = [];
  for (const ids of groupsList) {
    if (ids.length > 1) toDelete.push(...ids.slice(1));
  }

  if (toDelete.length === 0) {
    message.info("No duplicates to remove within upload.");
    return;
  }

  showDeleteDuplicatesConfirm(toDelete.length, async () => {
    isDeletingBulkDuplicates.value = true;
    try {
      await photosStore.deletePhotos(toDelete);
      message.success(`Removed ${toDelete.length} duplicate(s) within upload.`);

      const deletedIds = new Set(toDelete);
      const remainingPhotos = props.photos.filter((p) => !deletedIds.has(p.id));
      const remainingIds = new Set(remainingPhotos.map((p) => p.id));
      const stillHasAlreadyAnalyzed = remainingPhotos.some(
        (p) => p.isAlreadyAnalyzed,
      );
      const stillHasWithinLightboxPairs = remainingPhotos.some(
        (p) =>
          p.isExactDuplicate &&
          (p.exactDuplicates || []).some((id) => remainingIds.has(id)),
      );
      if (!stillHasAlreadyAnalyzed && !stillHasWithinLightboxPairs) {
        resetDuplicateState();
      }
    } catch (error) {
      console.error("Error removing duplicates within upload:", error);
    } finally {
      isDeletingBulkDuplicates.value = false;
    }
  });
};

// Lightbox: delete non-processed photos that already exist as processed in workspace
const handleDeleteAlreadyAnalyzed = () => {
  const toDelete = props.photos
    .filter((photo) => photo.isAlreadyAnalyzed)
    .map((p) => p.id);

  if (toDelete.length === 0) {
    message.info("No uploaded photos already analyzed in workspace.");
    return;
  }

  showDeleteDuplicatesConfirm(toDelete.length, async () => {
    isDeletingBulkDuplicates.value = true;
    try {
      await photosStore.deletePhotos(toDelete);
      message.success(
        `Removed ${toDelete.length} photo(s) already analyzed in workspace.`,
      );

      const deletedIds = new Set(toDelete);
      const remainingPhotos = props.photos.filter((p) => !deletedIds.has(p.id));
      const remainingIds = new Set(remainingPhotos.map((p) => p.id));
      const stillHasWithinLightboxPairs = remainingPhotos.some(
        (p) =>
          p.isExactDuplicate &&
          (p.exactDuplicates || []).some((id) => remainingIds.has(id)),
      );
      if (!stillHasWithinLightboxPairs) {
        resetDuplicateState();
      }
    } catch (error) {
      console.error("Error removing already analyzed photos:", error);
    } finally {
      isDeletingBulkDuplicates.value = false;
    }
  });
};

// Workspace: delete all duplicate processed photos, keeping one per group
const handleDeleteAllDuplicates = () => {
  const dupPhotos = filteredAndSortedPhotos.value.filter(
    (p) => p.isExactDuplicate,
  );
  const dupIdSet = new Set(dupPhotos.map((p) => p.id));
  const assigned = new Set();

  // Build groups using direct bidirectional links only
  const groupsList = [];
  dupPhotos.forEach((photo) => {
    if (assigned.has(photo.id)) return;
    const group = [photo.id];
    assigned.add(photo.id);
    (photo.exactDuplicates || []).forEach((dupId) => {
      if (!dupIdSet.has(dupId) || assigned.has(dupId)) return;
      const dupPhoto = dupPhotos.find((p) => p.id === dupId);
      if (dupPhoto && (dupPhoto.exactDuplicates || []).includes(photo.id)) {
        group.push(dupId);
        assigned.add(dupId);
      }
    });
    if (group.length >= 2) groupsList.push(group);
  });

  const toDelete = [];
  for (const ids of groupsList) {
    if (ids.length > 1) toDelete.push(...ids.slice(1));
  }

  if (toDelete.length === 0) {
    message.info("No duplicates to remove.");
    return;
  }

  showDeleteDuplicatesConfirm(toDelete.length, async () => {
    isDeletingBulkDuplicates.value = true;
    try {
      await photosStore.deletePhotos(toDelete);
      message.success(
        `Removed ${toDelete.length} duplicate(s), keeping one per group.`,
      );

      const deletedIds = new Set(toDelete);
      const remainingPhotos = props.photos.filter((p) => !deletedIds.has(p.id));
      const remainingIds = new Set(remainingPhotos.map((p) => p.id));
      const stillHasPairs = remainingPhotos.some(
        (p) =>
          p.isExactDuplicate &&
          (p.exactDuplicates || []).some((id) => remainingIds.has(id)),
      );
      if (!stillHasPairs) {
        resetDuplicateState();
      }
    } catch (error) {
      console.error("Error removing all duplicates:", error);
    } finally {
      isDeletingBulkDuplicates.value = false;
    }
  });
};

// Function to group duplicates using direct links only (no transitive merging)
function groupDuplicates(photos, type = "similar") {
  const isDupKey = type === "exact" ? "isExactDuplicate" : "isDuplicate";
  const dupsKey = type === "exact" ? "exactDuplicates" : "duplicates";

  const photoSet = new Set(photos.map((p) => p.id));
  const photoMap = new Map(photos.map((p) => [p.id, p]));
  const assigned = new Set();
  const result = [];

  // For each duplicate photo, form a group with its direct visible duplicates
  photos.forEach((photo) => {
    if (!photo[isDupKey] || assigned.has(photo.id)) return;
    const directDups = (photo[dupsKey] || []).filter(
      (dupId) => photoSet.has(dupId) && !assigned.has(dupId),
    );
    if (directDups.length === 0 && assigned.has(photo.id)) return;

    // Build a group: this photo + its direct duplicates that also reference it back
    const group = [photo];
    assigned.add(photo.id);
    directDups.forEach((dupId) => {
      const dupPhoto = photoMap.get(dupId);
      if (dupPhoto && !assigned.has(dupId)) {
        // Only add if the other photo also references this one (bidirectional link)
        const backLinks = dupPhoto[dupsKey] || [];
        if (backLinks.includes(photo.id)) {
          group.push(dupPhoto);
          assigned.add(dupId);
        }
      }
    });

    if (group.length >= 2) {
      result.push(...group);
    }
  });
  return result;
}

// Maps each visible duplicate photo to its group index (for color coding)
const photoGroupMap = computed(() => {
  if (filterDuplicates.value !== "duplicates") return new Map();

  const photos = displayedPhotos.value.filter(
    (p) => p.isExactDuplicate || p.isAlreadyAnalyzed,
  );
  if (photos.length === 0) return new Map();

  const visibleIds = new Set(photos.map((p) => p.id));
  const assigned = new Set();
  const map = new Map();
  let nextIndex = 0;

  // Group by direct bidirectional links only — no transitive merging
  photos.forEach((photo) => {
    if (assigned.has(photo.id)) return;

    // Collect direct duplicates that are visible and link back to this photo
    const allDupIds = [
      ...(photo.exactDuplicates || []),
      ...(photo.alreadyAnalyzedIds || []),
    ];
    const groupMembers = [photo.id];
    assigned.add(photo.id);

    allDupIds.forEach((dupId) => {
      if (!visibleIds.has(dupId) || assigned.has(dupId)) return;
      // Check bidirectional: the other photo must also reference this one
      const dupPhoto = photos.find((p) => p.id === dupId);
      if (dupPhoto) {
        const backLinks = [
          ...(dupPhoto.exactDuplicates || []),
          ...(dupPhoto.alreadyAnalyzedIds || []),
        ];
        if (backLinks.includes(photo.id)) {
          groupMembers.push(dupId);
          assigned.add(dupId);
        }
      }
    });

    // Assign a group index if there are 2+ members OR if it's a single alreadyAnalyzed photo
    if (
      groupMembers.length >= 2 ||
      (groupMembers.length === 1 && photo.isAlreadyAnalyzed)
    ) {
      const groupIdx = nextIndex++;
      groupMembers.forEach((id) => map.set(id, groupIdx));
    }
  });

  return map;
});

// Groups displayed duplicate photos by group index for band rendering
const groupedPhotoChunks = computed(() => {
  if (filterDuplicates.value !== "duplicates" || photoGroupMap.value.size === 0)
    return [];

  const chunkMap = new Map(); // groupIndex → { groupIndex, photos: [] }
  for (const photo of displayedPhotos.value) {
    const groupIdx = photoGroupMap.value.get(photo.id);
    if (groupIdx === undefined) continue;
    if (!chunkMap.has(groupIdx))
      chunkMap.set(groupIdx, { groupIndex: groupIdx, photos: [] });
    chunkMap.get(groupIdx).photos.push(photo);
  }

  return Array.from(chunkMap.values());
});

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

  // Apply metadata filters (file type + EXIF: iso, aperture, focal length,
  // exposure, camera, white balance, flash)
  if (countActiveMetadataFilters(metadataFilters.value) > 0) {
    filtered = filtered.filter((photo) =>
      photoMatchesMetadataFilters(photo, metadataFilters.value),
    );
  }

  // Apply time range filter
  if (timeRange.value && timeRange.value.length === 2) {
    filtered = filtered.filter((photo) => {
      const photoDate = new Date(photo.descriptions?.EXIF?.dateTaken).getTime();
      if (isNaN(photoDate)) return false;
      return photoDate >= timeRange.value[0] && photoDate <= timeRange.value[1];
    });
  }

  // Apply artistic score filters
  if (Object.keys(artisticScoreFilters.value).length > 0) {
    filtered = filtered.filter((photo) => {
      const scores = photo.descriptions?.artistic_scores;
      if (!scores) return false;
      return Object.entries(artisticScoreFilters.value).every(
        ([criterion, filterVal]) => {
          const score = scores[criterion];
          if (score === undefined || score === null) return false;
          const value =
            typeof filterVal === "object" ? filterVal.value : filterVal;
          const operator =
            typeof filterVal === "object" ? (filterVal.operator ?? ">=") : ">=";
          return operator === ">=" ? score >= value : score <= value;
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
  if (filterDuplicates.value === "duplicates") {
    if (props.context === "workspace") {
      // Workspace: show all exact duplicates grouped
      filtered = groupDuplicates(
        filtered.filter((photo) => photo.isExactDuplicate),
        "exact",
      );
    } else {
      // Lightbox: show exact duplicates within lightbox + already analyzed photos
      const exactDuplicatePhotos = filtered.filter(
        (photo) => photo.isExactDuplicate,
      );
      const alreadyAnalyzedPhotos = filtered.filter(
        (photo) => photo.isAlreadyAnalyzed && !photo.isExactDuplicate,
      );
      filtered = [
        ...groupDuplicates(exactDuplicatePhotos, "exact"),
        ...alreadyAnalyzedPhotos,
      ];
    }
  } else if (filterDuplicates.value === "non-duplicates") {
    // Show only photos that are not duplicates
    filtered = filtered.filter(
      (photo) => !photo.isExactDuplicate && !photo.isAlreadyAnalyzed,
    );
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

let _lastScrollTop = 0;
let _isProgrammaticScroll = false;
const controlsScrollCollapsed = ref(false);

// Minimum scrollable overflow (px) required before toggling the header on
// scroll. Must comfortably exceed the height the header frees when it collapses
// (~110px max-height + bottom margin) so hiding it never removes the overflow
// and triggers a flicker loop.
const MIN_OVERFLOW_TO_TOGGLE_HEADER = 220;

const handleScroll = (e) => {
  const container = props.scrollable
    ? scrollAreaRef.value
    : document.querySelector(".view-container");
  if (!container) return;

  const currentScrollTop = container.scrollTop;
  if (Math.abs(currentScrollTop - _lastScrollTop) > 5) {
    if (!_isProgrammaticScroll) {
      const direction = currentScrollTop > _lastScrollTop ? "down" : "up";
      const nearTop = currentScrollTop <= 300;
      // Guard against a hide/show oscillation: collapsing the header frees up
      // vertical space, growing the scroll area. With only a couple of rows the
      // content can stop overflowing once the header is hidden, snapping
      // scrollTop back to 0 and re-showing the header — an endless flicker.
      // Only react when there is enough overflow that hiding the header cannot
      // remove it entirely.
      const overflow = container.scrollHeight - container.clientHeight;
      const hasEnoughOverflow = overflow > MIN_OVERFLOW_TO_TOGGLE_HEADER;
      if (hasEnoughOverflow) {
        if (direction === "down") {
          controlsScrollCollapsed.value = true;
        } else if (nearTop) {
          controlsScrollCollapsed.value = false;
        }
        emit("scroll-direction", { direction, scrollTop: currentScrollTop });
      }
    }
    _lastScrollTop = currentScrollTop;
  }

  if (isLoadingMore.value || !hasMorePhotos.value) return;

  const scrollPosition = currentScrollTop + container.clientHeight;
  const documentHeight = container.scrollHeight;
  const threshold = 1000; // Load more when 1000px from bottom

  if (scrollPosition >= documentHeight - threshold) {
    loadMorePhotos();
  }
};

// Measure the available height for the self-scrolling photo area so the
// controls above it stay fixed regardless of the parent layout. This makes
// the scrollable behavior centralized and robust across all views.
const updateScrollAreaHeight = () => {
  if (!props.scrollable || !scrollAreaRef.value) return;
  const rect = scrollAreaRef.value.getBoundingClientRect();
  const bottomGap = 24; // breathing room at the bottom of the viewport
  const available = window.innerHeight - rect.top - bottomGap;
  scrollAreaHeight.value = Math.max(Math.round(available), 200);
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

// Scroll the photo area back to top
const scrollToTop = () => {
  nextTick(() => {
    _isProgrammaticScroll = true;
    if (props.scrollable && scrollAreaRef.value) {
      scrollAreaRef.value.scrollTop = 0;
    } else {
      const container = document.querySelector(".view-container");
      if (container) container.scrollTop = 0;
    }
    // Reset flag after scroll events have fired
    requestAnimationFrame(() => {
      _isProgrammaticScroll = false;
    });
  });
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
    scrollToTop();
    showSelectAllBanner.value = false;
    allFilteredSelected.value = false;
  },
  { deep: true },
);

// Watch for props.photos changes to reset pagination and range anchor
watch(
  () => props.photos.length,
  (newLength, oldLength) => {
    resetPagination();
    resetRangeState();
  },
);

// Lifecycle hooks for scroll listener
watch(focusedPhotoId, (id) => {
  if (!focusedByKeyboard.value || !id) return;
  nextTick(() => {
    const el = document.querySelector(`[data-photo-id="${id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
});

onMounted(() => {
  nextTick(() => {
    if (props.scrollable) {
      updateScrollAreaHeight();
      scrollAreaRef.value?.addEventListener("scroll", handleScroll, {
        passive: true,
      });
      // Recompute available height whenever anything in the page layout above
      // the grid changes size (filter panels, banners, sibling sections, etc.)
      // without depending on the parent layout. Observing body catches both
      // internal control changes and external sibling toggles.
      if ("ResizeObserver" in window) {
        scrollAreaResizeObserver = new ResizeObserver(() => {
          updateScrollAreaHeight();
        });
        scrollAreaResizeObserver.observe(document.body);
        if (gridContainerRef.value) {
          scrollAreaResizeObserver.observe(gridContainerRef.value);
        }
      }
    } else {
      const container = document.querySelector(".view-container");
      if (container === document.documentElement) {
        window.addEventListener("scroll", handleScroll, { passive: true });
      } else {
        container.addEventListener("scroll", handleScroll, { passive: true });
      }
    }
  });

  // Add resize listener for responsive column options
  window.addEventListener("resize", handleResize);

  // Attach keyboard navigation listeners
  attachKeyboardListeners(
    () => displayedPhotos.value.map((p) => p.id),
    () => gridColumns.value,
  );
});

// Handle window resize for responsive columns
const handleResize = () => {
  windowWidth.value = window.innerWidth;
  updateScrollAreaHeight();
};

onUnmounted(() => {
  if (props.scrollable) {
    scrollAreaRef.value?.removeEventListener("scroll", handleScroll);
    scrollAreaResizeObserver?.disconnect();
    scrollAreaResizeObserver = null;
  } else {
    const container = document.querySelector(".view-container");
    if (container === document.documentElement) {
      window.removeEventListener("scroll", handleScroll);
    } else if (container && container.removeEventListener) {
      container.removeEventListener("scroll", handleScroll);
    }
  }

  // Remove resize listener
  window.removeEventListener("resize", handleResize);

  // Detach keyboard navigation listeners
  detachKeyboardListeners();
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

// Batch actions
const handleDeleteMultiple = async () => {
  // Always show confirmation dialog for permanent deletion
  showDeleteConfirmDialog.value = true;
};

const handleRemoveFromCollection = async () => {
  if (!props.collectionId) return;
  try {
    await collectionsStore.removePhotosFromCollection(
      props.collectionId,
      selectedPhotoIds.value,
    );
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

const handleToolSelected = async (toolId, canvasId = null) => {
  await takeToTool(
    toolId,
    selectedPhotoIds.value,
    clearAllSelections,
    canvasId,
  );
  closeToolSelector();
};

const handleSendToChat = async () => {
  await takeToChat(selectedPhotoIds.value, clearAllSelections);
};

const handleSwapPhoto = (newPhotoId, targetIds) => {
  swapNewPhotoId.value = newPhotoId;
  swapTargetIds.value = targetIds;
  showSwapDialog.value = true;
};

const handleSwapComplete = () => {
  // Reset duplicate state after swap
  resetDuplicateState();
};
</script>

<style scoped>
.photos-grid-container {
  width: 100%;
}

/* Self-scrolling photo area. Height is measured via JS so the controls
   above stay fixed regardless of the parent layout (centralized behavior). */
.photos-scroll-area {
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px; /* avoid scrollbar overlap */
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

/* Suggest Photos Card */
.suggest-photos-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border: 2px dashed var(--border-color, #e0e0e0);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: transparent;
  gap: 8px;
}

.suggest-photos-card:hover {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 5%, transparent);
}

.suggest-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
  text-align: center;
}

.suggest-photos-card:hover .suggest-label {
  color: var(--primary-color);
}

/* Checking duplicates modal */
.dup-check-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  width: 320px;
  padding: 40px 32px 32px;
  background: var(--bg-card);
  border-radius: 12px;
}

.dup-check-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.dup-check-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--text-color);
  opacity: 0.7;
  text-align: center;
  line-height: 1.5;
}

/* Duplicate group color indicators - alternating colors per group */
.dup-group-band {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(var(--grid-cols, 8), 1fr);
  gap: 17px;
  padding: 8px;
  border-radius: 8px;
}

.dup-group-color-0 {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
}
.dup-group-color-1 {
  background-color: color-mix(in srgb, var(--info-color) 10%, transparent);
}
</style>
