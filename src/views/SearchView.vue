<template>
  <div ref="scrollContainer" class="search-container view-container">
    <!-- Desktop Layout -->
    <SearchPanelDesktopLayout
      v-if="!isMobile"
      :is-toolbar-collapsed="isToolbarCollapsed"
      :force-collapse-key="forceCollapseKey"
      :included-tag-suggestions-formatted="includedTagSuggestionsFormatted"
      :excluded-tag-suggestions-formatted="excludedTagSuggestionsFormatted"
      @search-included-tags="onSearchInputIncluded"
      @search-excluded-tags="onSearchInputExcluded"
      @search="performSearch"
      @clear="clearSearch"
    />

    <!-- Mobile Layout -->
    <SearchPanelMobileLayout
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
          <SpiralGridLoader variant="primary" :size="72" />
          <p class="loading-text">Searching through your photos...</p>
          <transition name="slide-fade" mode="out-in">
            <p
              v-if="currentReference"
              :key="currentRefIndex"
              class="search-reference"
            >
              "{{ currentReference }}"
            </p>
          </transition>
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
        <PhotosSearchGrid
          ref="photosSearchGridRef"
          :photos="photosWithComputedStars"
          :selected-photo-ids="localSelectedPhotoIds"
          :is-searching="isSearching"
          :is-loading-more="isLoadingMore"
          :is-be-adaptive-loading="isBeAdaptiveLoading"
          :has-more-iterations="hasMoreIterations"
          :should-show-try-adaptive="shouldShowTryAdaptive"
          :with-insights="withInsights"
          :is-mobile="isMobile"
          :page-size="pageSize"
          :initial-grid-columns="isMobile ? 2 : 6"
          v-model:min-star-rating="minStarRating"
          v-model:show-only-high-matches="showOnlyHighMatches"
          @update:grid-columns="gridColumns = $event"
          @select="togglePhotoSelection"
          @select-all="handleSelectAll"
          @deselect-all="handleDeselectAll"
          @info="showPhotoInfo"
          @load-more="loadMorePhotos"
          @try-adaptive="handleBeAdaptiveClick"
          @add-to-collection="handleCuratorAddToCollection"
          @take-to-tool="handleCuratorTakeToTool"
          @curator-mode-changed="handleCuratorModeChanged"
          @scroll-down="handleResultsScrollDown"
        />
      </div>
    </div>

    <!-- Dialogs -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
      :all-photos="photosWithComputedStars"
      :current-photo-index="currentPhotoIndex"
      @change-photo="selectedDialogPhoto = $event"
      @photo-navigate="handlePhotoNavigate"
    />
    <!-- Collection Selection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="activePhotoIdsForModal.length"
      :photo-ids="activePhotoIdsForModal"
      @add-to-collection="handleCollectionAdded"
      @add-to-series="handleCollectionAdded"
      @cancel="cancelCollectionModal"
    />
    <!-- Photo Tool Selector Modal -->
    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="activePhotoIdsForModal.length"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />

    <!-- Demo Safe-Search Warning Modal -->
    <DemoSearchWarningModal
      :show="showDemoWarningModal"
      :type="demoWarningType"
      @close="closeDemoWarningModal"
    />

    <!-- Floating Action Bar -->
    <FloatingActionBar
      :selected-ids="localSelectedPhotoIds"
      :show-delete="false"
      :show-add-to-collection="true"
      :show-move-to-tool="true"
      :show-send-to-chat="true"
      :is-downloading="isDownloading"
      @clear-selection="localClearAllSelections"
      @download="handleDownloadMultiple"
      @add-to-collection="handleAddToCollection"
      @move-to-tool="openToolSelector"
      @send-to-chat="handleSendToChat"
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
import { useRoute, useRouter } from "vue-router";
import { api } from "@/utils/axios";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";

// Layout Components
import SearchPanelDesktopLayout from "@/components/search/layouts/SearchPanelDesktopLayout.vue";
import SearchPanelMobileLayout from "@/components/search/layouts/SearchPanelMobileLayout.vue";

// Componentes e íconos
import PhotosSearchGrid from "@/components/search/PhotosSearchGrid.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";

// Composable de tags y ejemplos
import { useSearchTags } from "@/composables/useSearchTags";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection";
import { useIsMobile } from "@/composables/useIsMobile";

import { usePhotosStore } from "@/stores/photos";
import { useSearchStore } from "@/stores/searchStore";
import { useCollectionsStore } from "@/stores/collections";
import { usePhotoScored } from "@/composables/usePhotoScored";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection";
import { usePhotoDownload } from "@/composables/usePhotoDownload";
import { useDemoSafeSearch } from "@/composables/useDemoSafeSearch";
import DemoSearchWarningModal from "@/components/DemoSearchWarningModal.vue";

const photoStore = usePhotosStore();
const searchStore = useSearchStore();
const collectionsStore = useCollectionsStore();
const route = useRoute();
const router = useRouter();

// Demo safe-search guard
const {
  checkQuery: demoCheckQuery,
  showWarningModal: showDemoWarningModal,
  warningType: demoWarningType,
  closeWarningModal: closeDemoWarningModal,
} = useDemoSafeSearch();
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref();

const currentPhotoIndex = computed(() => {
  if (!selectedDialogPhoto.value) return -1;
  return photosWithComputedStars.value.findIndex(
    (p) => String(p.id) === String(selectedDialogPhoto.value.id),
  );
});

// Mobile detection
const { isMobile } = useIsMobile();

// Photo scoring utilities
const { computePhotoStars, shouldShowLowRelevanceIcon } = usePhotoScored();

// Photo tool selection utilities
const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  takeToChat,
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
  selectAllPhotos: localSelectAllPhotos,
  deselectAllPhotos: localDeselectAllPhotos,
} = useLocalPhotoSelection();

// Estado del toolbar colapsable (ya no usado con scroll interno)
const isToolbarCollapsed = ref(false);
const forceCollapseKey = ref(0);

// Estado del modal de colecciones
const showCollectionModal = ref(false);

// Referencia al componente del grid
const photosSearchGridRef = ref(null);

// IDs de fotos para curator mode (se usan cuando se añade desde curator)
const curatorPhotoIds = ref([]);

// Usar el store para el estado de búsqueda
const isSearching = computed(() => searchStore.isSearching);
const isLoadingMore = computed(() => searchStore.isLoadingMore);
const searchResults = computed(() => searchStore.searchResults);

const hasMoreIterations = computed(
  () => searchStore.currentSearchState.hasMoreIterations,
);

// Computed properties for photos with pre-computed stars
const photosWithComputedStars = computed(() => {
  return searchResults.value.map((photo) => ({
    ...photo,
    computedStars: computePhotoStars(photo),
    showLowRelevanceIcon: shouldShowLowRelevanceIcon(photo),
    highMatch: photo.highMatch || false,
  }));
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

// Computed para los IDs de fotos activos para modales (curator o selección normal)
const activePhotoIdsForModal = computed(() => {
  return curatorPhotoIds.value.length > 0
    ? curatorPhotoIds.value
    : localSelectedPhotoIds.value;
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

// Adaptive search references
const currentSearchId = ref(null);
const searchReferences = ref([]);
const currentRefIndex = ref(0);
let refPollingInterval = null;
let refCyclingInterval = null;

import SearchPlaceHolder from "@/components/SearchPlaceHolder.vue";

const scrollContainer = ref(null);

const includedTagSuggestionsFormatted = computed(() => {
  // Filter out already selected tags to avoid duplicates in n-select dropdown
  const selectedTags = searchStore.currentSearchState.includedTags || [];
  const selectedSet = new Set(selectedTags);
  return includedTagSuggestions.value.filter(
    (tag) => !selectedSet.has(tag.value),
  );
});

const excludedTagSuggestionsFormatted = computed(() => {
  // Filter out already selected tags to avoid duplicates in n-select dropdown
  const selectedTags = searchStore.currentSearchState.excludedTags || [];
  const selectedSet = new Set(selectedTags);
  return excludedTagSuggestions.value.filter(
    (tag) => !selectedSet.has(tag.value),
  );
});

// Handlers de cambio de tags eliminados - ahora manejados por los layouts

// Handler para colapsar toolbar cuando se activa curator mode
function handleCuratorModeChanged(isCuratorModeActive) {
  if (isCuratorModeActive) {
    isToolbarCollapsed.value = true;
  }
}

// Handler para colapsar toolbar al hacer scroll down en resultados
function handleResultsScrollDown() {
  if (isToolbarCollapsed.value) {
    forceCollapseKey.value++;
  }
}

// Helpers
const skeletonCount = computed(() => pageSize.value);

// Columnas del grid y paginación (mantenido para skeleton inicial)
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

// Filters visibility state removed - now local to SearchPanelDesktopLayout

function togglePhotoSelection(id) {
  localTogglePhotoSelection(id);
}

function handleSelectAll(ids) {
  localSelectAllPhotos(ids);
}

function handleDeselectAll() {
  localClearAllSelections();
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

const handlePhotoNavigate = async (index) => {
  const photo = photosWithComputedStars.value[index];
  if (!photo) return;
  const fullPhoto = await photoStore.fetchPhoto(photo.id);
  selectedDialogPhoto.value = {
    ...fullPhoto,
    matchingChunks: photo.matchingChunks,
  };
};

function handleAddToCollection() {
  showCollectionModal.value = true;
}

const cancelCollectionModal = () => {
  showCollectionModal.value = false;
  // Reset curator photo ids when canceling
  curatorPhotoIds.value = [];
};

const handleCollectionAdded = (data) => {
  showCollectionModal.value = false;
  // Clear selections after adding to collection
  localClearAllSelections();
  // Clear curated selection if in curator mode
  if (photosSearchGridRef.value?.curatorMode) {
    photosSearchGridRef.value.clearCuratedSelection();
  }
  // Reset curator photo ids
  curatorPhotoIds.value = [];
};

// Curator mode handlers
const handleCuratorAddToCollection = (photoIds) => {
  curatorPhotoIds.value = photoIds;
  showCollectionModal.value = true;
};

const handleCuratorTakeToTool = (photoIds) => {
  curatorPhotoIds.value = photoIds;
  openToolSelector();
};

const handleToolSelected = async (toolId, canvasId = null) => {
  // Use curator photo ids if available, otherwise use local selection
  const idsToUse =
    curatorPhotoIds.value.length > 0
      ? curatorPhotoIds.value
      : localSelectedPhotoIds.value;

  const clearCallback = () => {
    localClearAllSelections();
    if (photosSearchGridRef.value?.curatorMode) {
      photosSearchGridRef.value.clearCuratedSelection();
    }
    curatorPhotoIds.value = [];
  };

  await takeToTool(toolId, idsToUse, clearCallback, canvasId);
  closeToolSelector();
};

const handleSendToChat = async () => {
  await takeToChat(localSelectedPhotoIds.value, localClearAllSelections);
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

  // Expandir toolbar al limpiar búsqueda
  isToolbarCollapsed.value = false;

  // Stop references polling
  stopReferencesPolling();
  currentSearchId.value = null;
}

// Ejecución de búsqueda
async function performSearch() {
  // Demo safe-search: check query text (semantic) or included tags (tags search)
  const queryToCheck =
    searchStore.activeSearchType === "semantic"
      ? searchStore.currentSearchState.query || ""
      : (searchStore.currentSearchState.includedTags || []).join(" ");

  if (demoCheckQuery(queryToCheck)) return; // blocked – modal will open

  clearSelection();
  searchStore.resetCurrentIteration();
  stopReferencesPolling(); // Stop any previous polling
  searchStore.setSearching(true);

  if (!isMobile.value) {
    nextTick(() => {
      isToolbarCollapsed.value = true;
    });
  }

  await searchPhotos();
  searchStore.setSearching(false);
  stopReferencesPolling(); // Stop polling when search completes

  // Auto-colapsar toolbar después de búsqueda (solo desktop)
}

// Cargar más resultados
async function loadMorePhotos() {
  searchStore.setLoadingMore(true);

  // Scroll automático removido - el PhotosSearchGrid maneja su propio scroll

  await searchPhotos();
  searchStore.setLoadingMore(false);
}

// Generate unique search ID
function generateSearchId() {
  return `search_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Poll for search references
async function pollSearchReferences(searchId) {
  try {
    const { data } = await api.get(`/api/search/refs/${searchId}`);
    if (data && data.refs && data.refs.length > 0) {
      searchReferences.value = data.refs;
      currentRefIndex.value = 0;

      // Stop polling once we have the references
      if (refPollingInterval) {
        clearInterval(refPollingInterval);
        refPollingInterval = null;
      }

      // Start cycling through references ONLY if not already cycling
      if (!refCyclingInterval) {
        startReferenceCycling();
      }
    }
  } catch (error) {
    if (error.response?.status === 404) {
      // References not found yet, continue polling
      console.log("Search references not ready yet...");
    } else {
      console.error("Error polling search references:", error);
    }
  }
}

// Start polling interval
function startReferencesPolling(searchId) {
  // Clear any existing interval
  if (refPollingInterval) {
    clearInterval(refPollingInterval);
  }

  // Poll immediately
  pollSearchReferences(searchId);

  // Then poll every 500ms
  refPollingInterval = setInterval(() => {
    pollSearchReferences(searchId);
  }, 500);
}

// Cycle through references with animation
function startReferenceCycling() {
  if (searchReferences.value.length === 0) return;

  // Clear any existing cycling interval to prevent multiple intervals
  if (refCyclingInterval) {
    clearInterval(refCyclingInterval);
    refCyclingInterval = null;
  }

  refCyclingInterval = setInterval(() => {
    if (!isSearching.value || searchReferences.value.length === 0) {
      clearInterval(refCyclingInterval);
      refCyclingInterval = null;
      return;
    }

    currentRefIndex.value =
      (currentRefIndex.value + 1) % searchReferences.value.length;
  }, 2250); // Change reference every 3 seconds
}

// Stop all polling and cycling
function stopReferencesPolling() {
  if (refPollingInterval) {
    clearInterval(refPollingInterval);
    refPollingInterval = null;
  }
  if (refCyclingInterval) {
    clearInterval(refCyclingInterval);
    refCyclingInterval = null;
  }
  searchReferences.value = [];
  currentRefIndex.value = 0;
}

// Llamada a la API
async function searchPhotos() {
  try {
    const currentState = searchStore.currentSearchState;

    // Generate searchId for adaptive mode on first iteration
    if (searchStore.searchMode === "adaptive" && currentState.iteration === 1) {
      currentSearchId.value = generateSearchId();
      searchReferences.value = [];
      currentRefIndex.value = 0;

      // Start polling for references
      startReferencesPolling(currentSearchId.value);
    }

    const options = {
      iteration: currentState.iteration,
      pageSize: pageSize.value,
      searchMode: searchStore.searchMode,
      collections: searchStore.selectedCollections || [],
      visualAspects: searchStore.selectedVisualAspects,
      artisticScores: searchStore.selectedArtisticScores,
      cursor: currentState.lastCursor, // Add cursor for pagination
      withInsights: withInsights.value,
      ...(searchStore.searchMode === "adaptive" && currentSearchId.value
        ? { searchId: currentSearchId.value }
        : {}),
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

      // Scroll automático removido - ahora los scrolls son internos en PhotosSearchGrid

      // Verificar si hay más iteraciones disponibles
      if (response.data.hasMore === false) {
        searchStore.setMaxPageAttempts();
      }
    }
  } catch (err) {
    console.error("Error al buscar fotos:", err);
  }
}

// Computed for current visible reference
const currentReference = computed(() => {
  if (searchReferences.value.length === 0) return null;
  return searchReferences.value[currentRefIndex.value];
});

// Función para manejar el click en "Try Adaptive"
async function handleBeAdaptiveClick() {
  isBeAdaptiveLoading.value = true;

  try {
    // Cambiar a modo broad
    searchStore.setSearchMode("broad");

    // Resetear la búsqueda y ejecutar desde 0
    clearSelection();
    searchStore.resetCurrentIteration();
    searchStore.setSearching(true);

    await searchPhotos();
    searchStore.setSearching(false);
  } catch (error) {
    console.error("Error al cambiar a modo broad:", error);
    searchStore.setSearching(false);
  } finally {
    isBeAdaptiveLoading.value = false;
  }
}

// Deep-link entry: arriving with `?q=...` (e.g. from a ChatLab "search_photos"
// action) auto-runs a broad semantic search. Kept simple by contract — always
// broad + semantic, no filters.
function maybeRunQuerySearch(rawQuery) {
  const query = (rawQuery ?? "").toString().trim();
  if (!query) return;

  searchStore.setSearchType("semantic");
  searchStore.setSearchMode("broad");
  searchStore.updateSemanticQuery(query);

  // One-shot deep link: strip `q` immediately so the URL stops dictating the
  // search from here on (manual re-searches, back/forward, and repeat clicks of
  // the same action all behave). The query already lives in the store, so the
  // search we kick off below is unaffected. Stripping flips route.query.q to
  // undefined, which re-triggers the watch — harmless, the guard above bails.
  const { q, ...rest } = route.query;
  router.replace({ query: rest });

  performSearch();
}

// React to query changes even when the view is kept-alive (no natural remount).
watch(
  () => route.query.q,
  (q) => maybeRunQuerySearch(q),
);

// Manejo de respuestas en tiempo real
onMounted(() => {
  // Fetch collections when component mounts
  collectionsStore.getOrFetch();

  // Auto-run a deep-linked search if we arrived with ?q=...
  maybeRunQuerySearch(route.query.q);

  // Scroll listener removido - ahora los scrolls son internos en PhotosSearchGrid
});

// Watch for Insights toggle to disable High Matches filter if needed
watch(withInsights, (newValue) => {
  if (!newValue && showOnlyHighMatches.value) {
    showOnlyHighMatches.value = false;
  }
});

onUnmounted(() => {
  // Scroll listener ya no es necesario
  stopReferencesPolling();
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
  height: 100%;
  overflow: hidden;
}

/* Search Results Container */
.search-results-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-right: 16px;
  padding-bottom: 16px;
  padding-left: 16px;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 480px) {
  .search-results-container {
    padding: 0;
  }
}

/* Search Inspiration */
.search-inspiration {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  position: relative;
  z-index: 1;
  padding: var(--spacing-2xl) 0; /* Add padding instead of min-height */
}

@media (min-width: 481px) {
  .search-inspiration {
    flex: 1;
  }
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
  overflow-y: auto;
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

.search-reference {
  font-size: 14px;
  color: var(--primary-color);
  font-style: italic;
  margin: 0px 0 0 0;
  min-height: 24px;
}

/* Slide fade animation */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-fade-enter-from {
  transform: translateX(20px);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}

/* Search Results */
.search-results {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
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
</style>
