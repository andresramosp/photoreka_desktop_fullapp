<template>
  <n-modal
    v-model:show="dialog"
    preset="dialog"
    :style="modalStyle"
    class="photos-dialog-modal"
    :on-mask-click="selectionOnly ? undefined : close"
    :closable="false"
    :bordered="false"
  >
    <template #header>
      <div class="dialog-header">
        <h2 class="dialog-title">
          {{ title || (isTrash ? "Restore Photos" : "Add Photos to Canvas") }}
        </h2>
      </div>
    </template>

    <div class="dialog-content">
      <!-- Una sola grilla para los cuatro modos (sugerencias / catálogo
           desktop / catálogo mobile / papelera). Lo que cambia entre modos
           está resuelto en computeds: containerClass, showSearch,
           displayedPhotos, photosCountLabel y emptyState. -->
      <div :class="containerClass">
        <!-- Loading state (sólo aplica al modo sugerencias) -->
        <div v-if="loadingSuggestions" class="suggestions-loading">
          <SpiralGridLoader
            variant="primary"
            :size="64"
            text="Looking for similar photos..."
          />
        </div>

        <template v-else>
          <!-- Search and Stats Bar -->
          <div class="stats-bar">
            <div v-if="showSearch" class="search-section">
              <n-input
                v-model:value="searchQuery"
                placeholder="Search photos..."
                size="small"
                :clearable="!isSearching"
                class="text-search"
                @input="onSearchChange"
                @clear="clearSearch"
              >
                <template #prefix>
                  <n-icon size="16">
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"
                      />
                    </svg>
                  </n-icon>
                </template>
                <template #suffix>
                  <n-spin
                    size="small"
                    class="spinner-search spinner-medium spinner-centered"
                    v-if="isSearching"
                  />
                </template>
              </n-input>
            </div>
            <div class="stats-section">
              <div class="stats-info">
                <span class="stats-text">
                  {{ photosCountLabel }}
                  <span
                    v-if="!readOnly && selectedIds.length > 0"
                    class="selected-count"
                  >
                    • {{ selectedIds.length }} selected
                  </span>
                </span>
              </div>
              <div class="stats-actions">
                <n-button
                  v-if="!readOnly && selectedIds.length > 0"
                  text
                  type="primary"
                  @click="selectAll"
                >
                  Select All
                </n-button>
                <n-button
                  v-if="!readOnly && selectedIds.length > 0"
                  text
                  type="warning"
                  @click="clearSelection"
                >
                  Clear Selection
                </n-button>
              </div>
            </div>
          </div>

          <!-- Photos Grid -->
          <div
            v-if="displayedPhotos.length > 0"
            ref="photosGridRef"
            class="photos-grid photo-grid-base grid-cols-6"
            @scroll.passive="handleGridScroll"
          >
            <PhotoCard
              v-for="photo in visiblePhotos"
              :key="photo.id"
              :photo="photo"
              :selected="!readOnly && selectedSet.has(photo.id)"
              mode="default"
              @select="toggleSelection"
              @info="showPhotoInfo"
              :show-stars="showCardMeta"
              :show-tags="showCardMeta"
              :show-info-button="false"
              hide-fullscreen
              :require-long-press="false"
            />

            <!-- Sentinela de scroll infinito: ocupa la fila entera -->
            <div v-if="hasMorePhotos" class="grid-load-more">
              <n-spin size="small" />
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="empty-state">
            <div class="empty-state-content">
              <n-icon size="64" class="empty-state-icon">
                <component :is="emptyState.icon" />
              </n-icon>
              <h3 class="empty-state-title">{{ emptyState.title }}</h3>
              <p class="empty-state-description">
                {{ emptyState.description }}
              </p>
            </div>
          </div>
        </template>
      </div>
    </div>

    <template #action>
      <div class="dialog-actions">
        <div class="dialog-actions-left">
          <n-button
            v-if="isTrash && trashPhotos.length > 0"
            type="error"
            ghost
            @click="clearTrash"
          >
            <template #icon>
              <n-icon><DeleteIcon /></n-icon>
            </template>
            Empty Trash
          </n-button>
        </div>
        <div class="dialog-actions-right">
          <n-button @click="close">{{
            readOnly ? "Close" : "Cancel"
          }}</n-button>
          <n-button
            v-if="!readOnly && !selectionOnly"
            type="primary"
            :disabled="totalSelectedCount === 0"
            @click="confirmSelection"
            :loading="isSubmitting"
          >
            <template #icon>
              <n-icon>
                <ArrowUndoIcon v-if="isTrash" />
                <AddIcon v-else />
              </n-icon>
            </template>
            {{
              isTrash
                ? isMobile
                  ? `Restore (${selectedIds.length})`
                  : `Restore ${selectedIds.length} ${
                      selectedIds.length === 1 ? "Photo" : "Photos"
                    }`
                : props.singleSelection
                  ? isMobile
                    ? "Select"
                    : "Select Photo"
                  : isMobile
                    ? `Add (${totalSelectedCount})`
                    : `Add ${totalSelectedCount} ${
                        totalSelectedCount === 1 ? "Photo" : "Photos"
                      }`
            }}
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, markRaw, onMounted, watch } from "vue";
import { usePhotosStore } from "@/stores/photos";
import { useCanvasStore } from "@/stores/canvas";
import { useIsMobile } from "@/composables/useIsMobile";
import PhotoCard from "@/components/photoCards/PhotoCard.vue";
import { usePaginatedPhotoGrid } from "@/composables/usePaginatedPhotoGrid";

import { NModal, NButton, NIcon, NInput } from "naive-ui";
import SpiralGridLoader from "./SpiralGridLoader.vue";
import { api } from "@/utils/axios";

// Import @vicons icons from ionicons5 for reliability
import {
  TrashOutline as DeleteIcon,
  ImageOutline as ImageIcon,
  ArrowUndoOutline as ArrowUndoIcon,
  AddOutline as AddIcon,
} from "@vicons/ionicons5";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  isTrash: {
    type: Boolean,
    default: false,
  },
  singleSelection: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: "",
  },
  displaySearch: {
    type: Boolean,
    default: true,
  },
  suggestedPhotos: {
    type: Array,
    default: null,
  },
  loadingSuggestions: {
    type: Boolean,
    default: false,
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
  suggestedPhotosSingularLabel: {
    type: String,
    default: "suggestion",
  },
  suggestedPhotosPluralLabel: {
    type: String,
    default: "suggestions",
  },
  selectionOnly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "update:modelValue",
  "add-photos",
  "selection-change",
  "photo-info",
]);

// Reactive dialog state
const dialog = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

// Stores
const photosStore = usePhotosStore();
const canvasStore = useCanvasStore();
const { isMobile } = useIsMobile();

// Computed modal style
const modalStyle = computed(() => {
  if (isMobile.value) {
    return {
      width: "100vw",
      height: "100vh",
      maxWidth: "100vw",
      maxHeight: "100vh",
      margin: 0,
      "--n-border-radius": 0,
    };
  }
  return { maxWidth: "90vw", width: "1000px", maxHeight: "90vh" };
});

// Component state
const selectedIds = ref([]);
const isSubmitting = ref(false);
const searchQuery = ref("");
const isSearching = ref(false);
const searchResults = ref([]);
const allCatalogPhotos = ref([]);

// El diálogo muestra sugerencias cuando el padre pasa `suggestedPhotos`
// (aunque venga vacío) o mientras las está buscando.
const isSuggestedMode = computed(
  () => props.suggestedPhotos !== null || props.loadingSuggestions,
);

// IDs ya presentes en el canvas o descartados. Como Set: el filtrado del
// catálogo era O(n·m) con .find() anidado dentro de un .filter().
const excludedPhotoIds = computed(() => {
  const ids = new Set();
  for (const photo of canvasStore.photos) ids.add(photo.id);
  for (const photo of canvasStore.discardedPhotos) ids.add(photo.id);
  return ids;
});

// Catálogo, filtrado por la búsqueda si hay resultados
const catalogPhotos = computed(() => {
  const hasSearch = searchQuery.value.trim();
  const results = searchResults.value;

  // Si hay búsqueda Y resultados, muestra solo los resultados (filtrados)
  if (hasSearch && results && results.length > 0) {
    const excluded = excludedPhotoIds.value;
    return results.filter((p) => !excluded.has(p.id));
  }

  // Si no hay búsqueda o la búsqueda no tiene resultados, muestra todo el catálogo
  return allCatalogPhotos.value;
});

const trashPhotos = computed(() => {
  // Return discarded photos that can be restored
  const byId = new Map(photosStore.processedPhotos.map((p) => [p.id, p]));
  return canvasStore.discardedPhotos
    .map((dp) => byId.get(dp.id))
    .filter(Boolean);
});

// Única fuente de verdad para la grilla
const displayedPhotos = computed(() => {
  if (isSuggestedMode.value) return props.suggestedPhotos ?? [];
  if (props.isTrash) return trashPhotos.value;
  return catalogPhotos.value;
});

// Scroll infinito: la grilla sólo monta las páginas cargadas en vez de las
// miles de PhotoCard del catálogo entero.
const {
  containerRef: photosGridRef,
  visiblePhotos,
  hasMore: hasMorePhotos,
  onScroll: handleGridScroll,
  reset: resetPagination,
} = usePaginatedPhotoGrid(displayedPhotos);

// Set para el test de pertenencia del template: con `selectedIds.includes()`
// cada render de la grilla costaba O(fotos × seleccionadas).
const selectedSet = computed(() => new Set(selectedIds.value));

// Total selected count
const totalSelectedCount = computed(() => selectedIds.value.length);

// ─── Configuración por modo ──────────────────────────────────────────────────

const containerClass = computed(() => {
  if (isSuggestedMode.value) return "suggested-container";
  if (props.isTrash) return "trash-container";
  return isMobile.value ? "mobile-catalog-container" : "catalog-container";
});

const showSearch = computed(() => {
  if (isSuggestedMode.value) return false;
  if (props.isTrash) return true;
  return props.displaySearch;
});

// Estrellas y tags sólo en la papelera (el resto de los modos los ocultaba)
const showCardMeta = computed(() => props.isTrash && !isSuggestedMode.value);

const photosCountLabel = computed(() => {
  const count = displayedPhotos.value.length;

  if (isSuggestedMode.value) {
    return `${count} ${
      count === 1
        ? props.suggestedPhotosSingularLabel
        : props.suggestedPhotosPluralLabel
    }`;
  }

  return `${count} ${count === 1 ? "photo" : "photos"} available`;
});

const emptyState = computed(() => {
  if (isSuggestedMode.value) {
    return {
      icon: markRaw(ImageIcon),
      title: "No suggestions found",
      description:
        "Could not find similar photos to suggest for this collection.",
    };
  }

  if (props.isTrash) {
    return {
      icon: markRaw(DeleteIcon),
      title: "No deleted photos",
      description:
        "All photos are currently on the canvas or in your collection.",
    };
  }

  return {
    icon: markRaw(ImageIcon),
    title: "No photos available",
    description:
      "You don't have any photos here. Import them to Lightbox and click Analyze Photos to start building your Workspace.",
  };
});

// Emit selection changes in real-time for parent components that don't use the Add button
// Sin `deep`: `selectedIds` siempre se reasigna, y recorrer en profundidad un
// array de miles de ids en cada cambio era carísimo.
watch(selectedIds, (newIds) => {
  emit("selection-change", [...newIds]);
});

// Selection methods
function toggleSelection(photoId) {
  if (props.readOnly) return;

  if (props.singleSelection) {
    // For single selection mode, directly select or deselect
    selectedIds.value = selectedSet.value.has(photoId) ? [] : [photoId];
    return;
  }

  // Multi-selection mode. Siempre reasignamos (en vez de push) para que el
  // watch de `selectedIds` funcione sin `deep: true`.
  selectedIds.value = selectedSet.value.has(photoId)
    ? selectedIds.value.filter((id) => id !== photoId)
    : [...selectedIds.value, photoId];
}

function selectAll() {
  if (props.readOnly) return;

  selectedIds.value = displayedPhotos.value.map((p) => p.id);
}

function clearSelection() {
  if (props.readOnly) return;

  selectedIds.value = [];
}

function showPhotoInfo(photo) {
  emit("photo-info", photo);
}

// Main actions
async function confirmSelection() {
  if (props.readOnly) return;

  let photosToAdd = [];

  if (props.isTrash) {
    if (selectedIds.value.length === 0) return;

    // Remove from discarded photos (restore)
    canvasStore.discardedPhotos = canvasStore.discardedPhotos.filter(
      (dp) => !selectedIds.value.includes(dp.id),
    );
    photosToAdd = selectedIds.value;
  } else {
    photosToAdd = selectedIds.value;

    if (photosToAdd.length === 0) return;
  }

  isSubmitting.value = true;
  try {
    // Emit add-photos event with selected photo IDs
    emit("add-photos", photosToAdd);
    close();
  } catch (error) {
    console.error("Error adding photos:", error);
  } finally {
    isSubmitting.value = false;
  }
}

function clearTrash() {
  // Remove all photos from discardedPhotos so they can appear as similarity results again
  canvasStore.discardedPhotos.forEach((photo) => {
    if (photo.src && photo.src.startsWith("blob:")) {
      URL.revokeObjectURL(photo.src);
    }
    if (photo.thumbnailUrl && photo.thumbnailUrl.startsWith("blob:")) {
      URL.revokeObjectURL(photo.thumbnailUrl);
    }
  });
  canvasStore.discardedPhotos = [];
  selectedIds.value = [];
}

function close() {
  selectedIds.value = [];
  emit("update:modelValue", false);
}

// Search functionality
let searchTimeout = null;

function onSearchChange() {
  // Clear any existing timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // If search is empty, show all photos
  if (!searchQuery.value.trim()) {
    clearSearch();
    return;
  }

  // Debounce search to avoid too many API calls
  searchTimeout = setTimeout(async () => {
    await performSearch();
  }, 1000);
}

async function performSearch() {
  if (!searchQuery.value.trim()) {
    clearSearch();
    return;
  }

  isSearching.value = true;
  searchResults.value = [];

  try {
    const payload = {
      description: searchQuery.value.trim(),
      options: {
        iteration: 1,
        pageSize: 100,
        searchMode: "broad",
      },
    };

    const { data: response } = await api.post(
      "/api/search/semantic/sync",
      payload,
    );

    // Handle direct response from sync endpoint
    if (response.data && response.data.results) {
      const photos = [];
      Object.entries(response.data.results).forEach(([iter, items]) => {
        photos.push(...items.map((i) => i.photo));
      });
      searchResults.value = photos;
    } else {
      // If no results, show empty array
      searchResults.value = [];
    }
  } catch (error) {
    console.error("Error searching photos:", error);
    // On error, show all photos
    searchResults.value = [...allCatalogPhotos.value];
  } finally {
    isSearching.value = false;
  }
}

function clearSearch() {
  searchQuery.value = "";
  searchResults.value = [];
  isSearching.value = false;
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
}

// Ensure photos are loaded and initialize the catalog used for search filtering
async function loadCatalogPhotos() {
  await photosStore.getOrFetch();

  const excluded = excludedPhotoIds.value;
  allCatalogPhotos.value = photosStore.processedPhotos.filter(
    (p) => !excluded.has(p.id),
  );
}

// Watch for dialog open/close to fetch photos
watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      selectedIds.value = [];
      clearSearch();
      // El watcher interno del composable no se dispara si el conjunto no
      // cambió (p. ej. reabrir la papelera), así que medimos al montar la
      // grilla del diálogo recién abierto.
      resetPagination();

      // Trash mode only needs discardedPhotos which are already in memory
      if (props.isTrash) return;

      await loadCatalogPhotos();
    }
  },
);

// Fetch photos on mount
onMounted(async () => {
  // Ensure photos are loaded if dialog is already open (skip for trash mode)
  if (props.modelValue && !props.isTrash) {
    await loadCatalogPhotos();
  }
});
</script>

<style scoped>
.suggestions-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  gap: 20px;
}

.suggestions-loading-text {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

/* Dialog Header */
.dialog-header {
  text-align: center;
}

.dialog-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
  line-height: var(--line-height-tight);
}

/* Dialog Content */
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  max-height: 60vh;
  overflow: hidden;
}

.catalog-container {
  flex: 1;
  overflow: hidden;
}

/* Search and Stats Bar */
.stats-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-md) var(--spacing-lg);
  background-color: var(--bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
}

.search-section {
  flex: 1;
  min-width: 200px;
}

.text-search {
  width: 100%;
}

.trash-info-note {
  margin: 0;
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--text-secondary);
}

.stats-section {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  flex-shrink: 0;
}

.stats-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.stats-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: nowrap;
}

.selected-count {
  color: var(--primary-color);
  font-weight: var(--font-weight-medium);
}

.stats-actions {
  display: flex;
  gap: var(--spacing-sm);
}

/* Photos Grid */
.photos-grid {
  overflow-y: auto;
  grid-auto-rows: min-content;
  padding: var(--spacing-sm);
  max-height: calc(60vh - 80px);
}

/* Las tarjetas fuera del viewport del grid no pagan layout ni paint.
   contain-intrinsic-size reserva su alto para que la barra de scroll
   no salte mientras se recorren miles de fotos. */
.photos-grid :deep(.photo-card) {
  content-visibility: auto;
  contain-intrinsic-size: auto 150px;
}

/* Indicador de carga del scroll infinito: fila completa al final de la grilla */
.grid-load-more {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md) 0;
}

/* Empty State */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  text-align: center;
}

.empty-state-content {
  max-width: 400px;
}

.empty-state-icon {
  margin-bottom: var(--spacing-lg);
  color: var(--icon-tertiary);
}

.empty-state-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.empty-state-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

/* Dialog Actions */
.dialog-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: space-between;
  width: 100%;
}

.dialog-actions-left {
  display: flex;
  gap: var(--spacing-md);
}

.dialog-actions-right {
  display: flex;
  gap: var(--spacing-md);
}

/* Responsive Design */
@media (max-width: 1024px) {
  .photos-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--spacing-md);
  }
}

@media (max-width: 768px) {
  :deep(.n-dialog.photos-dialog-modal) {
    width: 100vw !important;
    height: 100vh !important;
    max-height: 100vh !important;
    margin: 0 !important;
    border-radius: 0 !important;
    display: flex !important;
    flex-direction: column !important;
  }

  :deep(.n-dialog.photos-dialog-modal .n-dialog__content) {
    flex: 1 !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }

  .dialog-content {
    max-height: none !important;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    min-height: 0;
  }

  .empty-state {
    min-height: 200px;
  }

  .catalog-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .stats-bar {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .search-section {
    order: 1;
  }

  .stats-section {
    order: 2;
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-sm);
  }

  .stats-info {
    justify-content: center;
  }

  .stats-actions {
    justify-content: center;
  }

  .mobile-catalog-container,
  .trash-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  .mobile-catalog-container > .stats-bar,
  .trash-container > .stats-bar {
    flex-shrink: 0;
  }

  .photos-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: var(--spacing-xs);
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .dialog-actions {
    flex-direction: row;
    width: 100%;
    gap: var(--spacing-sm);
  }

  .dialog-actions .n-button {
    flex: 1;
  }
}

@media (max-width: 480px) {
  .photos-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-sm);
  }

  .dialog-title {
    font-size: var(--font-size-lg);
  }

  .text-search {
    max-width: none;
  }
}

/* Scrollbar styling for photos grid */
.photos-grid {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.photos-grid::-webkit-scrollbar {
  width: 6px;
}

.photos-grid::-webkit-scrollbar-track {
  background: transparent;
}

.photos-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-xs);
}

.photos-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
:deep(.n-input__suffix) {
  display: flex !important;
  align-items: center !important;
  height: 100%;
}
</style>
