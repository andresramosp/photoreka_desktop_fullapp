<template>
  <div ref="scrollContainer" class="search-container view-container">
    <!-- Desktop Layout -->
    <SearchDesktopLayout
      v-if="!isMobile"
      :is-toolbar-collapsed="isToolbarCollapsed"
      :included-tag-suggestions-formatted="includedTagSuggestionsFormatted"
      :excluded-tag-suggestions-formatted="excludedTagSuggestionsFormatted"
      :show-more-filters="showMoreFilters"
      @search-included-tags="onSearchInputIncluded"
      @search-excluded-tags="onSearchInputExcluded"
      @update:show-more-filters="(v) => (showMoreFilters = v)"
      @search="performSearch"
      @clear="clearSearch"
    />

    <!-- Mobile Layout -->
    <SearchMobileLayout
      v-else
      :included-tag-suggestions-formatted="includedTagSuggestionsFormatted"
      :excluded-tag-suggestions-formatted="excludedTagSuggestionsFormatted"
      @search-included-tags="onSearchInputIncluded"
      @search-excluded-tags="onSearchInputExcluded"
      @search="performSearch"
      @clear="clearSearch"
      @reset="handleMobileReset"
    />

    <!-- Search Results / Empty State -->
    <div class="search-results-container">
      <div
        v-if="!isSearching && !searchStore.hasSearched"
        class="search-inspiration"
      >
        <!-- Empty State -->
        <SearchPlaceHolder
          :searchType="searchStore.activeSearchType"
          :searchMode="searchStore.searchMode"
          :onExampleClick="handleSearchExampleClick"
        />
      </div>

      <div v-else-if="isSearching" class="search-loading">
        <!-- Search Loading Message -->
        <div class="loading-message">
          <n-spin size="large" />
          <p class="loading-text">Searching through your photos...</p>
        </div>

        <!-- Skeleton Grid -->
        <div
          class="photo-grid photo-grid-base"
          :class="`grid-cols-${gridColumns}`"
        >
          <div
            v-for="n in skeletonCount"
            :key="`search-skeleton-${n}`"
            class="photo-skeleton"
          >
            <n-skeleton height="100%" />
          </div>
        </div>
      </div>

      <div v-else-if="searchStore.hasSearched" class="search-results">
        <!-- Grid Controls -->
        <div class="grid-controls grid-controls-base">
          <div class="controls-left">
            <div class="results-info results-info-base">
              <span class="results-count results-count-base">
                {{ filteredSearchResults.length }} photos found
                <span v-if="showOnlyHighMatches" class="filter-applied">
                  ({{ filteredSearchResults.length }} of
                  {{ searchResults.length }} high-quality matches)
                </span>
                <span v-else-if="minStarRating > 0" class="filter-applied">
                  ({{ filteredSearchResults.length }} of
                  {{ searchResults.length }} with {{ minStarRating }}+ stars)
                </span>
              </span>
            </div>
          </div>

          <div class="controls-right">
            <!-- High Matches Filter -->
            <div class="high-matches-filter">
              <span class="filter-label">High matches:</span>
              <n-tooltip
                trigger="hover"
                placement="top"
                :disabled="withInsights"
              >
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
                        { active: showOnlyHighMatches && withInsights },
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
                  v-model:value="minStarRating"
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
              <span class="grid-label grid-label-base">Columns:</span>
              <n-button-group>
                <n-button
                  v-for="size in isMobile ? [1, 2] : [3, 4, 5, 6]"
                  :key="size"
                  :type="gridColumns === size ? 'primary' : 'default'"
                  size="small"
                  @click="setGridColumns(size)"
                >
                  {{ size }}
                </n-button>
              </n-button-group>
            </div>
          </div>
        </div>

        <!-- Photo Grid -->
        <div
          class="photo-grid photo-grid-base"
          :class="`grid-cols-${gridColumns}`"
        >
          <!-- Photo Cards -->
          <PhotoCard
            v-for="photo in filteredSearchResults"
            :key="photo.id"
            :photo="photo"
            :computed-stars="photo.computedStars"
            :show-low-relevance-icon="photo.showLowRelevanceIcon"
            :high-match="photo.highMatch"
            :selected="localSelectedPhotoIds.includes(photo.id)"
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
            @click="
              shouldShowTryAdaptive ? handleBeAdaptiveClick() : loadMorePhotos()
            "
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
            {{ shouldShowTryAdaptive ? "Try Adaptive" : "Load More Photos" }}
          </n-button>
        </div>
      </div>
    </div>

    <!-- Dialogs -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
    />
    <!-- Collection Selection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="localSelectedPhotoIds.length"
      :photo-ids="localSelectedPhotoIds"
      @add-to-collection="handleCollectionAdded"
      @add-to-series="handleCollectionAdded"
      @cancel="cancelCollectionModal"
    />
    <!-- Photo Tool Selector Modal -->
    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="localSelectedPhotoIds.length"
      :tools="availableTools"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />

    <!-- Floating Action Bar -->
    <FloatingActionBar
      :selected-count="localSelectedPhotoIds.length"
      :show-delete="false"
      :show-add-to-collection="true"
      :show-move-to-tool="true"
      :is-downloading="isDownloading"
      @clear-selection="localClearAllSelections"
      @download="handleDownloadMultiple"
      @add-to-collection="handleAddToCollection"
      @move-to-tool="openToolSelector"
    />
  </div>
</template>

<script setup>
// Nombre del componente
defineOptions({ name: "SearchView" });

// Imports básicos
import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from "vue";
import { api } from "@/utils/axios";
import { NTooltip, NRate, NTreeSelect, NCheckbox } from "naive-ui";

// Layout Components
import SearchDesktopLayout from "@/components/search/layouts/SearchDesktopLayout.vue";
import SearchMobileLayout from "@/components/search/layouts/SearchMobileLayout.vue";

// Componentes e íconos
import PhotoCard from "@/components/photoCards/PhotoCard.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";

// Composable de tags y ejemplos
import { useSearchTags } from "@/composables/useSearchTags";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection";
import { useIsMobile } from "@/composables/useIsMobile";

import { DiamondOutline } from "@vicons/ionicons5";
import { usePhotosStore } from "@/stores/photos";
import { useSearchStore } from "@/stores/searchStore";
import { useCollectionsStore } from "@/stores/collections";
import { usePhotoScored } from "@/composables/usePhotoScored";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection";
import { usePhotoDownload } from "@/composables/usePhotoDownload";

const photoStore = usePhotosStore();
const searchStore = useSearchStore();
const collectionsStore = useCollectionsStore();
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref();

// Mobile detection
const { isMobile } = useIsMobile();

// Photo scoring utilities
const { computePhotoStars, shouldShowLowRelevanceIcon } = usePhotoScored();

// Photo tool selection utilities
const {
  isProcessing: isProcessingTool,
  showToolSelector,
  availableTools,
  takeToTool,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

// Photo download utilities
const { downloadPhotosZip, isDownloading, downloadPhoto } = usePhotoDownload();

// Estado local de selección de fotos (independiente del store global)
const {
  selectedPhotosRecord: localSelectedPhotosRecord,
  selectedPhotoIds: localSelectedPhotoIds,
  togglePhotoSelection: localTogglePhotoSelection,
  clearAllSelections: localClearAllSelections,
} = useLocalPhotoSelection();

// Estado del toolbar colapsable
const isToolbarCollapsed = ref(false);
const lastScrollY = ref(0);

// Estado del modal de colecciones
const showCollectionModal = ref(false);

// Usar el store para el estado de búsqueda
const isSearching = computed(() => searchStore.isSearching);
const isLoadingMore = computed(() => searchStore.isLoadingMore);
const searchResults = computed(() => searchStore.searchResults);

const hasMoreIterations = computed(
  () => searchStore.currentSearchState.hasMoreIterations,
);

// Computed properties for photos with pre-computed stars and filtering
const photosWithComputedStars = computed(() => {
  return searchResults.value.map((photo) => ({
    ...photo,
    computedStars: computePhotoStars(photo),
    showLowRelevanceIcon: shouldShowLowRelevanceIcon(photo),
    highMatch: photo.highMatch || false,
  }));
});

const filteredSearchResults = computed(() => {
  // High matches filter takes priority over star rating
  if (showOnlyHighMatches.value) {
    return photosWithComputedStars.value.filter(
      (photo) => photo.highMatch === true,
    );
  }

  if (minStarRating.value === 0) {
    return photosWithComputedStars.value;
  }
  return photosWithComputedStars.value.filter(
    (photo) => photo.computedStars >= minStarRating.value,
  );
});

// Computed para determinar cuándo mostrar el botón "Try Adaptive"
const shouldShowTryAdaptive = computed(() => {
  return (
    searchStore.searchMode === "precise" &&
    !hasMoreIterations.value &&
    !isSearching.value &&
    !isLoadingMore.value
  );
});

// Computed properties eliminados - los layouts acceden directamente al store

// Tags - mantener el composable para las sugerencias
const {
  includedTagSuggestions,
  excludedTagSuggestions,
  onSearchInputIncluded,
  onSearchInputExcluded,
} = useSearchTags();

// Control de carga y paginación
const pageSize = computed(() => gridColumns.value * 2); // 2 rows by default
const isBeAdaptiveLoading = ref(false);

// Warm up composable
import { useWarmUp } from "@/composables/useWarmUp";
import SearchPlaceHolder from "@/components/SearchPlaceHolder.vue";
const { warmedUp, ensureWarmUp } = useWarmUp();

const scrollContainer = ref(null);

const includedTagSuggestionsFormatted = computed(() =>
  includedTagSuggestions.value.map((tagName) => ({
    label: tagName,
    value: tagName,
  })),
);

const excludedTagSuggestionsFormatted = computed(() =>
  excludedTagSuggestions.value.map((tagName) => ({
    label: tagName,
    value: tagName,
  })),
);

// Handlers de cambio de tags eliminados - ahora manejados por los layouts

// Helpers
const skeletonCount = computed(() => pageSize.value);

// Función simple para manejar el scroll del toolbar
function handleScroll() {
  if (!scrollContainer.value) return;

  const currentScrollY = scrollContainer.value.scrollTop;

  // Solo aplicar si hay contenido de búsqueda
  if (searchResults.value.length > 0 && !isSearching.value) {
    // Si hacemos scroll hacia abajo y pasamos cierto punto, ocultar
    if (currentScrollY > lastScrollY.value && currentScrollY > 100) {
      isToolbarCollapsed.value = true;
    }
    // Si hacemos scroll hacia arriba, mostrar
    else if (currentScrollY < lastScrollY.value && currentScrollY < 500) {
      isToolbarCollapsed.value = false;
    }
  } else {
    // Sin contenido, siempre mostrar
    isToolbarCollapsed.value = false;
  }

  lastScrollY.value = currentScrollY;
}

// Columnas del grid y paginación
const gridColumns = ref(isMobile.value ? 2 : 6);

// Watch for mobile changes and update grid columns default
watch(isMobile, (newIsMobile) => {
  // Set appropriate default when switching between mobile/desktop
  gridColumns.value = newIsMobile ? 2 : 6;
});

// Star filter for minimum rating
const minStarRating = ref(0);

// High matches filter
const showOnlyHighMatches = ref(false);

// Insights from store
const withInsights = computed(
  () => searchStore.currentSearchState.withInsights || false,
);

// Filters visibility state
const showMoreFilters = ref(false);

function setGridColumns(n) {
  // NO resetear cursor - el usuario quiere seguir viendo los mismos resultados
  // solo con diferente layout de columnas
  gridColumns.value = n;
}

// Star filter handler
function onStarFilterChange(rating) {
  minStarRating.value = rating || 0;
  // Clear high matches filter when setting star rating
  if (rating > 0) {
    showOnlyHighMatches.value = false;
  }
  console.log("Min star rating filter set to:", minStarRating.value);
}

// High matches filter handler
function toggleHighMatchesFilter() {
  showOnlyHighMatches.value = !showOnlyHighMatches.value;
  // Clear star filter when activating high matches
  if (showOnlyHighMatches.value) {
    minStarRating.value = 0;
  }
  console.log("High matches filter:", showOnlyHighMatches.value);
}

function togglePhotoSelection(id) {
  localTogglePhotoSelection(id);
}
function clearSelection() {
  localClearAllSelections();
}

const showPhotoInfo = async (photo) => {
  const fullPhoto = await photoStore.fetchPhoto(photo.id);
  selectedDialogPhoto.value = {
    ...fullPhoto,
    matchingChunks: photo.matchingChunks,
  };
  showPhotoInfoDialog.value = true;
};

function handleAddToCollection() {
  showCollectionModal.value = true;
}

const cancelCollectionModal = () => {
  showCollectionModal.value = false;
};

const handleCollectionAdded = (data) => {
  showCollectionModal.value = false;
  // Clear selections after adding to collection
  localClearAllSelections();
};

const handleToolSelected = async (toolId) => {
  await takeToTool(
    toolId,
    localSelectedPhotoIds.value,
    localClearAllSelections,
  );
  closeToolSelector();
};

const handleDownloadMultiple = async () => {
  try {
    const photosToDownload = localSelectedPhotoIds.value
      .map((id) => photoStore.photos.find((p) => p.id == id))
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

// Limpia inputs de búsqueda solo del tipo actual
function clearSearch() {
  searchStore.clearCurrentSearch();

  // Reset star filter
  minStarRating.value = 0;

  // Reset high matches filter
  showOnlyHighMatches.value = false;

  // Resetear estado del toolbar
  isToolbarCollapsed.value = false;
  lastScrollY.value = 0;
}

// Ejecución de búsqueda
async function performSearch() {
  clearSelection();
  searchStore.resetCurrentIteration();
  searchStore.setSearching(true);

  await searchPhotos();
  searchStore.setSearching(false);
}

// Cargar más resultados
async function loadMorePhotos() {
  searchStore.setLoadingMore(true);

  // Scroll cuando aparecen los skeletons
  nextTick(() => {
    scrollToLast();
  });

  await searchPhotos();
  searchStore.setLoadingMore(false);
}

// Llamada a la API
async function searchPhotos() {
  try {
    const currentState = searchStore.currentSearchState;
    const options = {
      iteration: currentState.iteration,
      pageSize: pageSize.value,
      searchMode: searchStore.searchMode,
      collections: searchStore.selectedCollections || [],
      visualAspects: searchStore.selectedVisualAspects,
      artisticScores: searchStore.selectedArtisticScores,
      cursor: currentState.lastCursor, // Add cursor for pagination
      withInsights: withInsights.value,
    };

    let payload;
    let endpoint;

    if (searchStore.activeSearchType === "semantic") {
      payload = { description: currentState.query || "", options };
      endpoint = `/api/search/semantic/sync`;
    } else if (searchStore.activeSearchType === "tags") {
      payload = {
        included: currentState.includedTags || [],
        excluded: currentState.excludedTags || [],
        options,
      };
      endpoint = `/api/search/tags/sync`;
    }

    const { data: response } = await api.post(endpoint, payload);

    if (response.data) {
      searchStore.updateSearchResults(response.data);

      // Auto-scroll después de actualizar los resultados
      setTimeout(() => {
        scrollToLast();
      }, 0);

      // Verificar si hay más iteraciones disponibles
      if (response.data.hasMore === false) {
        searchStore.setMaxPageAttempts();
      }
    }
  } catch (err) {
    console.error("Error al buscar fotos:", err);
  }
}

function scrollToLast() {
  nextTick(() => {
    const el = scrollContainer.value;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  });
}

// Función para manejar el click en "Try Adaptive"
async function handleBeAdaptiveClick() {
  isBeAdaptiveLoading.value = true;

  try {
    // Cambiar a modo adaptive
    searchStore.setSearchMode("adaptive");

    // Resetear la búsqueda y ejecutar desde 0
    clearSelection();
    searchStore.resetCurrentIteration();
    searchStore.setSearching(true);

    await searchPhotos();
    searchStore.setSearching(false);
  } catch (error) {
    console.error("Error al cambiar a modo adaptive:", error);
    searchStore.setSearching(false);
  } finally {
    isBeAdaptiveLoading.value = false;
  }
}

// Manejo de respuestas en tiempo real
onMounted(() => {
  ensureWarmUp("logic_gpu");

  // Fetch collections when component mounts
  collectionsStore.getOrFetch();

  // Añadir scroll listener después de que el DOM esté completamente montado
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.addEventListener("scroll", handleScroll, {
        passive: true,
      });
    }
  });
});

// Watch for Insights toggle to disable High Matches filter if needed
watch(withInsights, (newValue) => {
  if (!newValue && showOnlyHighMatches.value) {
    showOnlyHighMatches.value = false;
  }
});

onUnmounted(() => {
  // Remover scroll listener
  if (scrollContainer.value) {
    scrollContainer.value.removeEventListener("scroll", handleScroll);
  }
});

// Carousel de ejemplos dinámico usando composable
function handleSearchExampleClick(exampleText, searchType) {
  if (searchType === "semantic") {
    searchStore.updateSemanticQuery(exampleText);
    performSearch();
  }
}

// Ya no usamos useQueryExamples aquí, lo usa SearchPlaceHolder internamente

// Funciones de cambio eliminadas - ahora manejadas por los layouts

// Handler for mobile reset action
function handleMobileReset() {
  searchStore.setSearchMode("broad");
  searchStore.setWithInsights(false);
}
</script>

<style scoped>
.search-container {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* Search Results Container */
.search-results-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  min-height: 0;
}

@media (max-width: 480px) {
  .search-results-container {
    padding: 0;
  }
}

/* Load More */
.load-more-container {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
}

.load-more-button {
  min-width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 500;
}

/* Controls right container */
.controls-right {
  display: flex;
  align-items: center;
  gap: 24px;
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
  /* color: var(--text-primary); */
  font-size: 12px;
  margin-left: 4px;
}

/* Search Inspiration */
.search-inspiration {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  position: relative;
  z-index: 1;
  padding: var(--spacing-2xl) 0; /* Add padding instead of min-height */
}

.inspiration-content {
  max-width: 600px;
  position: relative;
  z-index: 2;
}

.inspiration-icon {
  margin-bottom: var(--spacing-lg); /* 16px instead of 24px */
}

.inspiration-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
}

.inspiration-subtitle {
  font-size: 18px;
  color: var(--text-secondary);
  margin: 0 0 40px 0;
}

.search-examples {
  text-align: left;
}

.example-card {
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  width: 100%;
  background: transparent;
  border: none;
  padding: 0;
}

.example-card:hover .example-text {
  color: var(--primary-color);
  transform: scale(1.02);
}

.example-text {
  font-size: 16px;
  color: var(--text-secondary);
  line-height: 1.4;
  text-align: center;
  font-style: italic;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Search Loading */
.search-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.loading-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 16px;
}

.loading-text {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

/* Search Results */
.search-results {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.results-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 12px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 40px;
  min-height: 200px;
}

.results-text {
  font-size: 18px;
  color: var(--text-secondary);
  margin: 0;
}

.results-query {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  text-align: center;
}

/* Star filter responsive - Tablet */
@media (max-width: 768px) {
  .controls-right {
    gap: 12px;
  }

  .star-filter {
    gap: 6px;
  }

  .filter-label {
    font-size: 12px;
  }

  .selection-info {
    bottom: 16px;
    left: 16px;
    right: 16px;
    transform: none;
    border-radius: 16px;
  }
}

/* Star filter mobile responsive */
@media (max-width: 480px) {
  .controls-right {
    gap: 8px;
  }

  .star-filter {
    gap: 4px;
  }

  .filter-label {
    font-size: 10px;
  }

  .selection-info {
    bottom: 12px;
    left: 12px;
    right: 12px;
    transform: none;
    padding: 10px 16px;
    font-size: 13px;
  }
}

/* Tablet Responsive */
@media (min-width: 768px) and (max-width: 1024px) {
  /* Grid controls responsive handled above */
}
.controls-left {
  display: flex;
  align-items: center;
}
</style>
