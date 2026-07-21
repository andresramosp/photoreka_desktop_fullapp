<template>
  <div class="photos-search-grid">
    <!-- Grid Controls -->
    <div class="grid-controls grid-controls-base">
      <div class="controls-left">
        <div class="results-info results-info-base">
          <!-- <span class="results-count results-count-base">
            {{ displayedPhotosCount }} photos found
            <span v-if="localShowOnlyHighMatches" class="filter-applied">
              ({{ displayedPhotosCount }} of {{ totalPhotosCount }} high-quality
              matches)
            </span>
            <span v-else-if="localMinStarRating > 0" class="filter-applied">
              ({{ displayedPhotosCount }} of {{ totalPhotosCount }} with
              {{ localMinStarRating }}+ stars)
            </span>
          </span> -->
        </div>
      </div>

      <div class="controls-right">
        <!-- Curator View Toggle (Desktop Only) -->
        <div v-if="false" class="curator-toggle">
          <span class="filter-label">Curator:</span>
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <div
                class="curator-button"
                :class="{ active: curatorMode }"
                @click="toggleCuratorMode"
              >
                <n-icon size="18" class="curator-icon">
                  <GridOutline />
                </n-icon>
              </div>
            </template>
            {{
              curatorMode
                ? "Exit Curator View"
                : "Enter Curator View - organize photos by moving them between panels"
            }}
          </n-tooltip>
        </div>

        <!-- High Matches Filter -->
        <div class="high-matches-filter">
          <span class="filter-label">High matches:</span>
          <n-tooltip trigger="hover" placement="top" :disabled="withInsights">
            <template #trigger>
              <div
                class="diamond-button"
                :class="{ disabled: !withInsights }"
                @click="withInsights && toggleHighMatchesFilter()"
              >
                <n-icon
                  size="18"
                  :class="[
                    'diamond-filter-icon',
                    { active: localShowOnlyHighMatches && withInsights },
                  ]"
                >
                  <DiamondOutline />
                </n-icon>
              </div>
            </template>
            Enable Insights and click search to use High Matches filter
          </n-tooltip>
        </div>

        <!-- Star Filter -->
        <div class="star-filter">
          <span class="filter-label">Min. Rating:</span>
          <div class="star-buttons">
            <n-rate
              v-model:value="localMinStarRating"
              :readonly="isSearching || isLoadingMore"
              :count="3"
              size="small"
              clearable
              @update:value="onStarFilterChange"
              class="star-rating"
              :allow-half="false"
            />
          </div>
        </div>

        <div class="grid-size-controls grid-size-controls-base">
          <span v-if="!isMobile" class="grid-label grid-label-base"
            >Columns:</span
          >
          <n-button-group>
            <n-button
              v-for="size in columnOptions"
              :key="size"
              :type="gridColumns === size ? 'primary' : 'default'"
              size="small"
              :disabled="curatorMode"
              @click="setGridColumns(size)"
            >
              {{ size }}
            </n-button>
          </n-button-group>
        </div>

        <!-- Select All Button -->
        <n-button
          size="small"
          :type="allSelected ? 'primary' : 'default'"
          @click="handleSelectAll"
          class="select-all-btn"
        >
          <template #icon>
            <n-icon>
              <SelectAllOn24Regular />
            </n-icon>
          </template>
          <span v-if="!isMobile">{{
            allSelected ? "Deselect All" : "Select All"
          }}</span>
        </n-button>
      </div>
    </div>

    <!-- Normal Grid View -->
    <div
      v-if="!curatorMode"
      ref="normalViewRef"
      class="normal-view"
      @scroll="onNormalViewScroll"
    >
      <div
        class="photo-grid photo-grid-base"
        :class="`grid-cols-${gridColumns}`"
      >
        <PhotoCard
          v-for="photo in filteredPhotos"
          :key="photo.id"
          :photo="photo"
          :all-photos="filteredPhotos"
          :computed-stars="photo.computedStars"
          :show-low-relevance-icon="photo.showLowRelevanceIcon"
          :high-match="photo.highMatch"
          :selected="selectedPhotoIds.includes(photo.id)"
          @select="togglePhotoSelection"
          @info="showPhotoInfo"
          :show-info-button="true"
        />

        <!-- Skeleton Loading for Load More -->
        <template v-if="isLoadingMore">
          <div
            v-for="n in pageSize"
            :key="`skeleton-${n}`"
            class="photo-skeleton"
          >
            <n-skeleton height="100%" />
          </div>
        </template>
      </div>

      <!-- Load More Button -->
      <div
        class="load-more-container"
        v-if="hasMoreIterations || shouldShowTryAdaptive"
      >
        <n-button
          size="large"
          :loading="isLoadingMore || isBeAdaptiveLoading"
          @click="handleLoadMoreClick"
          :type="shouldShowTryAdaptive ? 'info' : 'default'"
          class="load-more-button"
        >
          <template #icon>
            <n-icon>
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                />
              </svg>
            </n-icon>
          </template>
          {{ shouldShowTryAdaptive ? "Try Broad Mode" : "Load More Photos" }}
        </n-button>
      </div>
    </div>

    <!-- Curator View -->
    <div v-else class="curator-view">
      <!-- Left Panel - Source Photos -->
      <div class="curator-panel curator-panel-left">
        <div class="panel-header">
          <span class="panel-title">Search Results</span>
          <span class="panel-count">{{ leftPanelPhotos.length }} photos</span>
        </div>

        <div ref="leftPanelContentRef" class="panel-content">
          <div
            class="photo-grid photo-grid-base"
            :class="`grid-cols-${curatorColumns}`"
          >
            <div
              v-for="photo in leftPanelPhotos"
              :key="photo.id"
              class="curator-photo-wrapper"
            >
              <PhotoCard
                :photo="photo"
                :all-photos="leftPanelPhotos"
                :computed-stars="photo.computedStars"
                :show-low-relevance-icon="photo.showLowRelevanceIcon"
                :high-match="photo.highMatch"
                :selected="false"
                @info="showPhotoInfo"
                :show-info-button="true"
              />
              <div class="curator-overlay">
                <n-button
                  circle
                  type="primary"
                  size="small"
                  class="move-button move-right"
                  @click="movePhotoToRight(photo)"
                >
                  <template #icon>
                    <n-icon>
                      <ChevronForwardOutline />
                    </n-icon>
                  </template>
                </n-button>
              </div>
            </div>

            <!-- Skeleton Loading for Load More -->
            <template v-if="isLoadingMore">
              <div
                v-for="n in pageSize"
                :key="`skeleton-${n}`"
                class="photo-skeleton"
              >
                <n-skeleton height="100%" />
              </div>
            </template>
          </div>

          <!-- Load More Button -->
          <div
            class="load-more-container"
            v-if="hasMoreIterations || shouldShowTryAdaptive"
          >
            <n-button
              size="large"
              :loading="isLoadingMore || isBeAdaptiveLoading"
              @click="handleLoadMoreClick"
              :type="shouldShowTryAdaptive ? 'info' : 'default'"
              class="load-more-button"
            >
              <template #icon>
                <n-icon>
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                    />
                  </svg>
                </n-icon>
              </template>
              {{ shouldShowTryAdaptive ? "Try Broad Mode" : "Load More Photos" }}
            </n-button>
          </div>
        </div>
      </div>

      <!-- Right Panel - Curated Selection -->
      <div class="curator-panel curator-panel-right">
        <div class="panel-header">
          <span class="panel-title">Curated Selection</span>
          <span class="panel-count">{{ curatedPhotos.length }} photos</span>
        </div>

        <div class="panel-content">
          <div
            v-if="curatedPhotos.length > 0"
            class="photo-grid photo-grid-base"
            :class="`grid-cols-${curatorColumns}`"
          >
            <div
              v-for="photo in curatedPhotos"
              :key="photo.id"
              class="curator-photo-wrapper"
            >
              <PhotoCard
                :photo="photo"
                :all-photos="curatedPhotos"
                :computed-stars="photo.computedStars"
                :show-low-relevance-icon="photo.showLowRelevanceIcon"
                :high-match="photo.highMatch"
                :selected="false"
                @info="showPhotoInfo"
                :show-info-button="true"
              />
              <div class="curator-overlay">
                <n-button
                  circle
                  type="warning"
                  size="small"
                  class="move-button move-left"
                  @click="movePhotoToLeft(photo)"
                >
                  <template #icon>
                    <n-icon>
                      <ChevronBackOutline />
                    </n-icon>
                  </template>
                </n-button>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="curated-empty-state">
            <n-icon size="48" class="empty-icon">
              <ImagesOutline />
            </n-icon>
            <p class="empty-text">Move photos here to curate your selection</p>
            <p class="empty-hint">
              Use the arrow buttons on photos to move them
            </p>
          </div>

          <!-- Curator Actions -->
          <div class="curator-actions" v-if="curatedPhotos.length > 0">
            <n-button
              type="info"
              size="large"
              @click="handleAddCuratedToCollection"
              class="curator-action-button"
            >
              <template #icon>
                <n-icon>
                  <AlbumsOutline />
                </n-icon>
              </template>
              Add to Collection
            </n-button>
            <n-button
              type="info"
              size="large"
              @click="handleTakeCuratedToTool"
              class="curator-action-button"
            >
              <template #icon>
                <n-icon>
                  <ConstructOutline />
                </n-icon>
              </template>
              Take to Tool
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { NTooltip, NRate } from "naive-ui";
import PhotoCard from "@/components/photoCards/PhotoCard.vue";
import {
  DiamondOutline,
  GridOutline,
  ChevronForwardOutline,
  ChevronBackOutline,
  AlbumsOutline,
  ConstructOutline,
  ImagesOutline,
} from "@vicons/ionicons5";
import { SelectAllOn24Regular } from "@vicons/fluent";

const props = defineProps({
  photos: {
    type: Array,
    required: true,
  },
  selectedPhotoIds: {
    type: Array,
    default: () => [],
  },
  isSearching: {
    type: Boolean,
    default: false,
  },
  isLoadingMore: {
    type: Boolean,
    default: false,
  },
  isBeAdaptiveLoading: {
    type: Boolean,
    default: false,
  },
  hasMoreIterations: {
    type: Boolean,
    default: false,
  },
  shouldShowTryAdaptive: {
    type: Boolean,
    default: false,
  },
  withInsights: {
    type: Boolean,
    default: false,
  },
  isMobile: {
    type: Boolean,
    default: false,
  },
  pageSize: {
    type: Number,
    default: 12,
  },
  initialGridColumns: {
    type: Number,
    default: 6,
  },
  minStarRating: {
    type: Number,
    default: 0,
  },
  showOnlyHighMatches: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "select",
  "info",
  "load-more",
  "try-adaptive",
  "update:minStarRating",
  "update:showOnlyHighMatches",
  "update:gridColumns",
  "add-to-collection",
  "take-to-tool",
  "curator-mode-changed",
  "select-all",
  "deselect-all",
  "scroll-down",
]);

// Local state
const gridColumns = ref(props.initialGridColumns);
const curatorMode = ref(false);
const curatedPhotoIds = ref(new Set());
const localMinStarRating = ref(props.minStarRating);
const localShowOnlyHighMatches = ref(props.showOnlyHighMatches);

// Refs for scroll containers
const normalViewRef = ref(null);
const leftPanelContentRef = ref(null);

// Track scroll direction to emit scroll-down
let lastScrollTop = 0;
function onNormalViewScroll(e) {
  const st = e.target.scrollTop;
  if (st > lastScrollTop && st > 50) {
    emit("scroll-down");
  }
  lastScrollTop = st;
}

// Computed: column options based on mobile
const columnOptions = computed(() => (props.isMobile ? [1, 2] : [3, 4, 5, 6]));

// Computed: curator columns (half of regular)
const curatorColumns = computed(() =>
  Math.max(1, Math.floor(gridColumns.value / 2)),
);

// Computed: total and displayed photo counts
const totalPhotosCount = computed(() => props.photos.length);

// Computed: filtered photos based on star rating and high matches
const filteredPhotos = computed(() => {
  if (localShowOnlyHighMatches.value) {
    return props.photos.filter((photo) => photo.highMatch === true);
  }

  if (localMinStarRating.value === 0) {
    return props.photos;
  }
  return props.photos.filter(
    (photo) => photo.computedStars >= localMinStarRating.value,
  );
});

const displayedPhotosCount = computed(() => filteredPhotos.value.length);

// Computed: whether all filtered photos are selected
const allSelected = computed(() => {
  if (filteredPhotos.value.length === 0) return false;
  return filteredPhotos.value.every((photo) =>
    props.selectedPhotoIds.includes(photo.id),
  );
});

// Computed: photos for left panel (filtered minus curated)
const leftPanelPhotos = computed(() =>
  filteredPhotos.value.filter((photo) => !curatedPhotoIds.value.has(photo.id)),
);

// Computed: photos for right panel (curated selection)
const curatedPhotos = computed(() =>
  filteredPhotos.value.filter((photo) => curatedPhotoIds.value.has(photo.id)),
);

// Watch for mobile changes and update grid columns default
watch(
  () => props.isMobile,
  (newIsMobile) => {
    gridColumns.value = newIsMobile ? 2 : 6;
  },
);

// Watch for prop changes to sync local state
watch(
  () => props.minStarRating,
  (val) => {
    localMinStarRating.value = val;
  },
);

watch(
  () => props.showOnlyHighMatches,
  (val) => {
    localShowOnlyHighMatches.value = val;
  },
);

// Watch for isLoadingMore to auto-scroll to bottom when loading more photos
watch(
  () => props.isLoadingMore,
  async (isLoading) => {
    if (isLoading) {
      // Wait for skeleton elements to render
      await nextTick();

      // Get the appropriate scroll container
      const scrollContainer = curatorMode.value
        ? leftPanelContentRef.value
        : normalViewRef.value;

      if (scrollContainer) {
        // Smooth scroll to bottom
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  },
);

// Methods
function setGridColumns(n) {
  gridColumns.value = n;
  emit("update:gridColumns", n);
}

function toggleCuratorMode() {
  curatorMode.value = !curatorMode.value;
  // Emit event to parent when curator mode is activated
  emit("curator-mode-changed", curatorMode.value);
  // Force 6 columns in curator mode
  if (curatorMode.value) {
    gridColumns.value = 6;
    emit("update:gridColumns", 6);
  }
  // Clear curated selection when exiting curator mode
  if (!curatorMode.value) {
    curatedPhotoIds.value = new Set();
  }
}

function onStarFilterChange(rating) {
  localMinStarRating.value = rating || 0;
  emit("update:minStarRating", localMinStarRating.value);
  // Clear high matches filter when setting star rating
  if (rating > 0) {
    localShowOnlyHighMatches.value = false;
    emit("update:showOnlyHighMatches", false);
  }
}

function toggleHighMatchesFilter() {
  localShowOnlyHighMatches.value = !localShowOnlyHighMatches.value;
  emit("update:showOnlyHighMatches", localShowOnlyHighMatches.value);
  // Clear star filter when activating high matches
  if (localShowOnlyHighMatches.value) {
    localMinStarRating.value = 0;
    emit("update:minStarRating", 0);
  }
}

function handleSelectAll() {
  if (allSelected.value) {
    emit("deselect-all");
  } else {
    const ids = filteredPhotos.value.map((photo) => photo.id);
    emit("select-all", ids);
  }
}

function togglePhotoSelection(id) {
  emit("select", id);
}

function showPhotoInfo(photo) {
  emit("info", photo);
}

function handleLoadMoreClick() {
  if (props.shouldShowTryAdaptive) {
    emit("try-adaptive");
  } else {
    emit("load-more");
  }
}

// Curator mode methods
function movePhotoToRight(photo) {
  curatedPhotoIds.value = new Set([...curatedPhotoIds.value, photo.id]);
}

function movePhotoToLeft(photo) {
  const newSet = new Set(curatedPhotoIds.value);
  newSet.delete(photo.id);
  curatedPhotoIds.value = newSet;
}

function handleAddCuratedToCollection() {
  const curatedIds = Array.from(curatedPhotoIds.value);
  emit("add-to-collection", curatedIds);
}

function handleTakeCuratedToTool() {
  const curatedIds = Array.from(curatedPhotoIds.value);
  emit("take-to-tool", curatedIds);
}

// Expose for parent component
defineExpose({
  curatorMode,
  curatedPhotoIds,
  clearCuratedSelection: () => {
    curatedPhotoIds.value = new Set();
  },
});
</script>

<style scoped>
.photos-search-grid {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

/* Controls right container */
.controls-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

/* Curator Toggle */
.curator-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.curator-button {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.curator-button:hover {
  background-color: rgba(96, 165, 250, 0.1);
}

.curator-button.active {
  background-color: rgba(96, 165, 250, 0.2);
  border-color: rgba(96, 165, 250, 0.5);
}

.curator-icon {
  color: rgba(96, 165, 250, 0.5);
  transition: all 0.3s ease;
}

.curator-button:hover .curator-icon,
.curator-button.active .curator-icon {
  color: #60a5fa;
}

/* High Matches Filter */
.high-matches-filter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.diamond-button {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.diamond-button:hover:not(.disabled) {
  background-color: rgba(96, 165, 250, 0.1);
}

.diamond-button.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.diamond-filter-icon {
  color: rgba(96, 165, 250, 0.3);
  transition: all 0.3s ease;
}

.diamond-filter-icon:hover {
  color: rgba(96, 165, 250, 0.6);
}

.diamond-filter-icon.active {
  color: #60a5fa;
  filter: drop-shadow(0 0 4px rgba(96, 165, 250, 0.6));
}

/* Star Filter */
.star-filter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.star-buttons {
  display: flex;
  align-items: center;
}

.star-rating {
  --n-item-color-active: #fbbf24;
  --n-item-color: rgba(255, 255, 255, 0.3);
}

.filter-applied {
  font-size: 12px;
  margin-left: 4px;
}

/* Normal View */
.normal-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-right: 6px;
  padding-left: 0px;
}

/* Load More */
.load-more-container {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.load-more-button {
  min-width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 500;
}

/* Curator View */
.curator-view {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.curator-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.curator-panel-left {
  border-color: var(--border-color);
}

.curator-panel-right {
  border-color: rgba(96, 165, 250, 0.3);
  background-color: rgba(96, 165, 250, 0.02);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-count {
  font-size: 14px;
  color: var(--text-secondary);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

/* Curator Photo Wrapper */
.curator-photo-wrapper {
  position: relative;
}

.curator-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.3);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
  border-radius: 8px;
}

.curator-photo-wrapper:hover .curator-overlay {
  opacity: 1;
  pointer-events: auto;
}

.move-button {
  transform: scale(1);
  transition: transform 0.2s ease;
}

.move-button:hover {
  transform: scale(1.1);
}

.move-right {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
}

.move-left {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
}

.curator-photo-wrapper:hover .move-right,
.curator-photo-wrapper:hover .move-left {
  transform: translateY(-50%) scale(1);
}

.curator-photo-wrapper:hover .move-right:hover,
.curator-photo-wrapper:hover .move-left:hover {
  transform: translateY(-50%) scale(1.1);
}

/* Curated Empty State */
.curated-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 12px;
  padding: 40px;
  text-align: center;
}

.empty-icon {
  color: var(--text-secondary);
  opacity: 0.5;
}

.empty-text {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.empty-hint {
  font-size: 14px;
  color: var(--text-secondary);
  opacity: 0.7;
  margin: 0;
}

/* Curator Actions */
.curator-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.curator-action-button {
  flex: 1;
  height: 48px;
}

/* Controls left */
.controls-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Responsive */
@media (max-width: 768px) {
  .controls-right {
    gap: 12px;
    width: 100%;
    justify-content: space-between;
  }

  .star-filter {
    gap: 6px;
  }

  .filter-label {
    font-size: 12px;
  }

  .curator-view {
    flex-direction: column;
    height: auto;
  }

  .curator-panel {
    min-height: 400px;
    height: auto;
    max-height: 60vh;
  }
}

@media (max-width: 480px) {
  .controls-right {
    gap: 8px;
    width: 100%;
    justify-content: space-between;
  }

  .star-filter {
    gap: 4px;
  }

  .filter-label {
    font-size: 10px;
  }

  .curator-actions {
    flex-direction: column;
  }

  .curator-panel {
    min-height: 300px;
    max-height: 50vh;
  }
}
</style>
