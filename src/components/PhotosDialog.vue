<template>
  <n-modal
    v-model:show="dialog"
    preset="dialog"
    :show-icon="false"
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

    <div
      class="dialog-content"
      :class="{ 'dialog-content--fill': showFilters }"
    >
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
          <!-- Search and Stats Bar. Con el panel de filtros la búsqueda vive en
               su pestaña y el recuento baja al pie del diálogo, así que esta
               barra sólo la montan los modos sin filtros (papelera,
               sugerencias). -->
          <div v-if="!showFilters" class="stats-bar">
            <!-- <div v-if="showSearch" class="search-section">
              <PhotoSearchInput
                v-model="searchQuery"
                :loading="isSearching"
                @input="onSearchChange"
                @clear="clearSearch"
              />
            </div> -->
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
                  v-if="showSelectAll"
                  size="small"
                  :type="allSelected ? 'primary' : 'default'"
                  class="select-all-btn"
                  @click="toggleSelectAll"
                >
                  <template #icon>
                    <n-icon><SelectAllIcon /></n-icon>
                  </template>
                  <span>{{ allSelected ? "Deselect All" : "Select All" }}</span>
                </n-button>
              </div>
            </div>
          </div>

          <!-- Filtros (sólo catálogo: sugerencias y papelera son conjuntos ya
               acotados por el padre) -->
          <PhotoFiltersPanel
            v-if="showFilters"
            v-model="photoFilters"
            :photos="filterablePhotos"
            :hide-scores="hideScoreFilters"
            show-collections
          >
            <template #suffix>
              <span class="stats-text">{{ photosCountLabel }}</span>
            </template>
            <template v-if="showSearch" #search>
              <PhotoSearchInput
                v-model="searchQuery"
                :loading="isSearching"
                @input="onSearchChange"
                @clear="clearSearch"
              />
            </template>
          </PhotoFiltersPanel>

          <!-- Photos Grid -->
          <div
            v-if="displayedPhotos.length > 0"
            ref="photosGridRef"
            class="photos-grid photo-grid-base grid-cols-8"
            @scroll.passive="handleGridScroll"
          >
            <PhotoCard
              v-for="photo in visiblePhotos"
              :key="photo.id"
              :photo="photo"
              :selected="!readOnly && selectedSet.has(photo.id)"
              :is-selection-mode="!readOnly && selectedIds.length > 0"
              :selectable="!readOnly"
              mode="default"
              @select="toggleSelection"
              @info="showPhotoInfo"
              :show-stars="showCardMeta"
              :show-tags="showCardMeta"
              :show-info-button="showInfoButton"
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
        <div v-if="showActionsLeft" class="dialog-actions-left">
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

          <!-- Acciones de selección: en el modo con filtros viven aquí, en el
               extremo opuesto al botón de añadir (el recuento de fotos va en el
               nav del panel de filtros) -->
          <template v-if="showFilters">
            <n-button
              v-if="showSelectAll"
              size="small"
              :type="allSelected ? 'primary' : 'default'"
              class="select-all-btn"
              @click="toggleSelectAll"
            >
              <template #icon>
                <n-icon><SelectAllIcon /></n-icon>
              </template>
              <span>{{ allSelected ? "Deselect All" : "Select All" }}</span>
            </n-button>
            <span
              v-if="!readOnly && selectedIds.length > 0"
              class="stats-text selected-count"
            >
              {{ selectedIds.length }} selected
            </span>
          </template>
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
import { useCollectionsStore } from "@/stores/collections";
import { useIsMobile } from "@/composables/useIsMobile";
import PhotoCard from "@/components/photoCards/PhotoCard.vue";
import PhotoFiltersPanel from "@/components/photos-grid/PhotoFiltersPanel.vue";
import PhotoSearchInput from "@/components/photos-grid/PhotoSearchInput.vue";
import { usePaginatedPhotoGrid } from "@/composables/usePaginatedPhotoGrid";
import {
  applyPhotoFilters,
  createEmptyPhotoFilters,
  countActivePhotoFilters,
} from "@/utils/photoFilters.js";

import { NModal, NButton, NIcon } from "naive-ui";
import SpiralGridLoader from "./SpiralGridLoader.vue";
import { api } from "@/utils/axios";

// Import @vicons icons from ionicons5 for reliability
import {
  TrashOutline as DeleteIcon,
  ImageOutline as ImageIcon,
  ArrowUndoOutline as ArrowUndoIcon,
  AddOutline as AddIcon,
  FunnelOutline as FilterIcon,
} from "@vicons/ionicons5";
import { SelectAllOn24Regular as SelectAllIcon } from "@vicons/fluent";

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
  /** Oculta los sliders de artistic scores en el panel de filtros (p. ej. en
   *  contextos donde elegir por score no aporta, como añadir contexto al chat) */
  hideScoreFilters: {
    type: Boolean,
    default: false,
  },
  /** Lets a click open the info panel (emits `photo-info`) instead of just
   *  toggling selection. Off by default: most callers use this dialog as a
   *  pure picker. */
  showInfoButton: {
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
const collectionsStore = useCollectionsStore();
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
  // Ancho dictado por la fila de 9 selects de visual aspects: por debajo de
  // ~1350px las etiquetas ("Depth of Field", "Orientation") se truncan.
  return { maxWidth: "90vw", width: "1260px", maxHeight: "92vh" };
});

// Component state
const selectedIds = ref([]);
const isSubmitting = ref(false);
const searchQuery = ref("");
const isSearching = ref(false);
const searchResults = ref([]);
const allCatalogPhotos = ref([]);
const photoFilters = ref(createEmptyPhotoFilters());

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

// Los filtros sólo tienen sentido sobre el catálogo completo: las sugerencias
// vienen ya curadas por el padre y la papelera es un puñado de fotos.
// Declarado aquí (y no junto al resto de computeds de modo) porque
// `catalogPhotos` lo lee, y esa cadena se evalúa durante el setup: el watcher
// de `usePaginatedPhotoGrid` la recorre nada más crearse.
const showFilters = computed(
  () => !isSuggestedMode.value && !props.isTrash && !props.readOnly,
);

// Catálogo tras la búsqueda semántica, pero antes de los filtros: es la lista
// sobre la que se dibuja el histograma de fechas del panel.
const filterablePhotos = computed(() => {
  const hasSearch = searchQuery.value.trim();
  const results = searchResults.value;

  // Si hay búsqueda Y resultados, muestra solo los resultados (filtrados)
  if (hasSearch && results && results.length > 0) {
    const excluded = excludedPhotoIds.value;
    // Los resultados del endpoint semántico no siempre traen `descriptions`
    // completas; rehidratamos desde el store para que los filtros por aspectos,
    // scores y fecha tengan datos con los que trabajar.
    const byId = new Map(allCatalogPhotos.value.map((p) => [p.id, p]));
    return results
      .filter((p) => !excluded.has(p.id))
      .map((p) => byId.get(p.id) ?? p);
  }

  // Si no hay búsqueda o la búsqueda no tiene resultados, muestra todo el catálogo
  return allCatalogPhotos.value;
});

// Catálogo con los filtros del panel aplicados
const catalogPhotos = computed(() =>
  showFilters.value
    ? applyPhotoFilters(
        filterablePhotos.value,
        photoFilters.value,
        collectionsStore.allCollections,
      )
    : filterablePhotos.value,
);

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

// Toggle de selección masiva: visible siempre que haya algo que seleccionar (no
// sólo con selección previa) y la selección múltiple tenga sentido. En el
// catálogo se exige además que la lista esté acotada (filtros o búsqueda):
// comparar el recuento mostrado con el del catálogo completo cubre ambos casos
// sin inspeccionar los filtros uno a uno, y evita ofrecer "seleccionar las
// miles de fotos del usuario" de un clic.
const showSelectAll = computed(() => {
  if (props.readOnly || props.singleSelection) return false;
  if (displayedPhotos.value.length === 0) return false;
  if (!showFilters.value) return true;

  return displayedPhotos.value.length < allCatalogPhotos.value.length;
});

const allSelected = computed(
  () =>
    displayedPhotos.value.length > 0 &&
    displayedPhotos.value.every((p) => selectedSet.value.has(p.id)),
);

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

// El bloque izquierdo del pie sólo se monta si tiene contenido: vacío rompería
// la alineación a la derecha de Cancel/Add (ver `.dialog-actions`).
const showActionsLeft = computed(
  () => showFilters.value || (props.isTrash && trashPhotos.value.length > 0),
);

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

  // Con filtros activos el total sin filtrar sigue siendo información útil
  if (showFilters.value && countActivePhotoFilters(photoFilters.value) > 0) {
    return `${count} of ${filterablePhotos.value.length} photos`;
  }

  return `${count} ${count === 1 ? "photo" : "photos"}`;
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

  // Sin resultados por culpa de los filtros: el mensaje de catálogo vacío
  // ("importa fotos…") sería desorientador.
  if (
    showFilters.value &&
    countActivePhotoFilters(photoFilters.value) > 0 &&
    filterablePhotos.value.length > 0
  ) {
    return {
      icon: markRaw(FilterIcon),
      title: "No photos match your filters",
      description:
        "Try relaxing the filters above, or clear them to see the whole catalog again.",
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

function toggleSelectAll() {
  if (props.readOnly) return;

  selectedIds.value = allSelected.value
    ? []
    : displayedPhotos.value.map((p) => p.id);
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
      photoFilters.value = createEmptyPhotoFilters();
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

/* Con el panel de filtros el alto deja de ser libre: se fija el contenido para
   que la grilla ceda espacio al desplegar los filtros en vez de recortarse
   contra el `overflow: hidden` del diálogo. */
@media (min-width: 769px) {
  /* Más alto que el resto de modos: los filtros ocupan una franja fija y sin
     esto la grilla se quedaba en una fila y media. El `max-height` hay que
     subirlo también: el de `.dialog-content` es un tope duro que anula el
     `height` por mucho que se suba. */
  .dialog-content--fill {
    height: 78vh;
    max-height: 78vh;
  }

  .dialog-content--fill .catalog-container {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    min-height: 0;
  }

  .dialog-content--fill .photos-grid {
    flex: 1;
    min-height: 0;
    max-height: none;
  }

  .dialog-content--fill .empty-state {
    flex: 1;
    min-height: 0;
  }
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

.select-all-btn {
  white-space: nowrap;
}

.select-all-btn span {
  font-size: 13px;
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
  /* `margin-right: auto` en el bloque izquierdo en vez de `space-between`: así
     Cancel/Add siguen pegados a la derecha aunque no haya bloque izquierdo. */
  justify-content: flex-end;
  align-items: center;
  width: 100%;
}

.dialog-actions-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-right: auto;
  min-width: 0;
}

.dialog-actions-right {
  display: flex;
  gap: var(--spacing-md);
}

/* Responsive Design */
@media (max-width: 1024px) {
  .photos-grid.grid-cols-8 {
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
    gap: var(--spacing-sm);
    overflow: hidden;
    min-height: 0;
  }

  .mobile-catalog-container > .stats-bar,
  .trash-container > .stats-bar {
    flex-shrink: 0;
  }

  .photos-grid.grid-cols-8 {
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-xs);
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .dialog-actions {
    flex-direction: row;
    flex-wrap: wrap;
    width: 100%;
    gap: var(--spacing-sm);
  }

  /* El recuento se lleva su propia línea sobre los botones */
  .dialog-actions-left {
    flex: 1 1 100%;
    justify-content: center;
    margin-right: 0;
  }

  .dialog-actions-right {
    flex: 1 1 100%;
  }

  .dialog-actions-right .n-button {
    flex: 1;
  }
}

@media (max-width: 480px) {
  .photos-grid.grid-cols-8 {
    gap: var(--spacing-sm);
  }

  .dialog-title {
    font-size: var(--font-size-lg);
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
</style>
