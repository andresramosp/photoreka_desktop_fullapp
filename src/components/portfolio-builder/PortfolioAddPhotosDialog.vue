<template>
  <n-modal
    v-model:show="dialog"
    preset="dialog"
    :style="modalStyle"
    :show-icon="false"
    class="photos-dialog-modal"
    :on-mask-click="close"
    :closable="false"
    :bordered="false"
  >
    <template #header>
      <div class="dialog-header">
        <h2 class="dialog-title">Add Photos to Portfolio</h2>
      </div>
    </template>

    <div class="dialog-content">
      <n-tabs
        v-model:value="activeTab"
        type="line"
        animated
        size="small"
        class="add-photos-tabs"
      >
        <n-tab-pane name="builder" v-if="hasBuilderPool">
          <template #tab>
            <div class="tab-label">
              <n-icon size="14"><BuilderIcon /></n-icon>
              Builder Pool
              <n-tooltip trigger="hover" placement="top" :max-width="300">
                <template #trigger>
                  <n-icon size="13" class="info-icon"
                    ><InfoCircleFilled
                  /></n-icon>
                </template>
                These are photos approved during the build evaluation but that
                didn't make the final cut — trimmed by the over-generation
                buffer, the similarity gate, or the refinement pass.
              </n-tooltip>
            </div>
          </template>
          <div class="tab-pane-body">
            <div class="stats-bar">
              <div class="stats-section">
                <div class="stats-info">
                  <span class="stats-text">
                    {{ builderPoolPhotos.length }}
                    {{ builderPoolPhotos.length === 1 ? "photo" : "photos" }}
                    from this build
                    <span v-if="selectedIds.length > 0" class="selected-count">
                      • {{ selectedIds.length }} selected
                    </span>
                  </span>
                </div>
                <div class="stats-actions">
                  <n-button
                    v-if="builderPoolPhotos.length > 0"
                    text
                    type="primary"
                    @click="selectAllVisible(builderPoolPhotos)"
                  >
                    Select All
                  </n-button>
                  <n-button
                    v-if="selectedIds.length > 0"
                    text
                    type="warning"
                    @click="clearSelection"
                  >
                    Clear
                  </n-button>
                </div>
              </div>
            </div>

            <div
              v-if="builderPoolPhotos.length > 0"
              ref="builderGridRef"
              class="photos-grid photo-grid-base grid-cols-8"
              @scroll.passive="onBuilderScroll"
            >
              <PhotoCard
                v-for="photo in visibleBuilderPhotos"
                :key="photo.id"
                :photo="photo"
                :selected="selectedSet.has(photo.id)"
                mode="default"
                @select="toggleSelection"
                :show-stars="false"
                :show-tags="false"
                :show-info-button="false"
                :require-long-press="false"
              />

              <div v-if="hasMoreBuilder" class="grid-load-more">
                <n-spin size="small" />
              </div>
            </div>

            <div v-else class="empty-state">
              <div class="empty-state-content">
                <n-icon size="64" class="empty-state-icon">
                  <ImageIcon />
                </n-icon>
                <h3 class="empty-state-title">Builder pool is empty</h3>
                <p class="empty-state-description">
                  No additional candidates were retained from the original
                  build.
                </p>
              </div>
            </div>
          </div>
        </n-tab-pane>

        <n-tab-pane name="similar">
          <template #tab>
            <div class="tab-label">
              <n-icon size="14"><SimilarIcon /></n-icon>
              Similar Photos
            </div>
          </template>
          <div class="tab-pane-body">
            <div class="stats-bar">
              <div class="stats-section">
                <div class="stats-info">
                  <span class="stats-text">
                    {{ similarResults.length }}
                    {{
                      similarResults.length === 1 ? "suggestion" : "suggestions"
                    }}
                    <span v-if="selectedIds.length > 0" class="selected-count">
                      • {{ selectedIds.length }} selected
                    </span>
                  </span>
                </div>
                <div class="stats-actions">
                  <n-button
                    size="small"
                    quaternary
                    :loading="isLoadingSimilar"
                    @click="fetchSimilar"
                  >
                    <template #icon>
                      <n-icon><RefreshIcon /></n-icon>
                    </template>
                    Refresh
                  </n-button>
                  <n-button
                    v-if="similarResults.length > 0"
                    text
                    type="primary"
                    @click="selectAllVisible(similarResults)"
                  >
                    Select All
                  </n-button>
                  <n-button
                    v-if="selectedIds.length > 0"
                    text
                    type="warning"
                    @click="clearSelection"
                  >
                    Clear
                  </n-button>
                </div>
              </div>
            </div>

            <div v-if="isLoadingSimilar" class="tab-loading">
              <SpiralGridLoader
                variant="primary"
                :size="56"
                text="Looking for similar photos…"
              />
            </div>

            <div
              v-else-if="similarResults.length > 0"
              ref="similarGridRef"
              class="photos-grid photo-grid-base grid-cols-8"
              @scroll.passive="onSimilarScroll"
            >
              <PhotoCard
                v-for="photo in visibleSimilarPhotos"
                :key="photo.id"
                :photo="photo"
                :selected="selectedSet.has(photo.id)"
                mode="default"
                @select="toggleSelection"
                :show-stars="false"
                :show-tags="false"
                :show-info-button="false"
                :require-long-press="false"
              />

              <div v-if="hasMoreSimilar" class="grid-load-more">
                <n-spin size="small" />
              </div>
            </div>

            <div v-else class="empty-state">
              <div class="empty-state-content">
                <n-icon size="64" class="empty-state-icon">
                  <ImageIcon />
                </n-icon>
                <h3 class="empty-state-title">No similar photos</h3>
                <p class="empty-state-description">
                  We couldn't find photos similar to the ones already in this
                  portfolio.
                </p>
              </div>
            </div>
          </div>
        </n-tab-pane>

        <n-tab-pane name="catalog">
          <template #tab>
            <div class="tab-label">
              <n-icon size="14"><CatalogIcon /></n-icon>
              All Photos
            </div>
          </template>
          <div class="tab-pane-body">
            <!-- Sin fotos seleccionadas no hay nada que mostrar aquí: el
                 recuento vive en el nav del panel de filtros -->
            <div
              v-if="selectedIds.length > 0"
              class="stats-bar stats-bar--plain"
            >
              <div class="stats-section">
                <div class="stats-info">
                  <span class="stats-text selected-count">
                    {{ selectedIds.length }} selected
                  </span>
                </div>
                <div class="stats-actions">
                  <n-button text type="warning" @click="clearSelection">
                    Clear
                  </n-button>
                </div>
              </div>
            </div>

            <!-- Filtros sólo aquí: el pool del build y las sugerencias son
                 conjuntos pequeños y ya curados -->
            <PhotoFiltersPanel
              v-model="photoFilters"
              :photos="filterableCatalogPhotos"
              show-collections
            >
              <template #suffix>
                <span class="stats-text">{{ catalogCountLabel }}</span>
              </template>
              <template #search>
                <PhotoSearchInput
                  v-model="searchQuery"
                  placeholder="Search photos by description..."
                  :loading="isSearching"
                  @input="onSearchChange"
                  @clear="clearSearch"
                />
              </template>
            </PhotoFiltersPanel>

            <div
              v-if="catalogPhotos.length > 0"
              ref="catalogGridRef"
              class="photos-grid photo-grid-base grid-cols-8"
              @scroll.passive="onCatalogScroll"
            >
              <PhotoCard
                v-for="photo in visibleCatalogPhotos"
                :key="photo.id"
                :photo="photo"
                :selected="selectedSet.has(photo.id)"
                mode="default"
                @select="toggleSelection"
                :show-stars="false"
                :show-tags="false"
                :show-info-button="false"
                :require-long-press="false"
              />

              <div v-if="hasMoreCatalog" class="grid-load-more">
                <n-spin size="small" />
              </div>
            </div>

            <div v-else class="empty-state">
              <div class="empty-state-content">
                <n-icon size="64" class="empty-state-icon">
                  <FilterIcon v-if="filteredOutEverything" />
                  <ImageIcon v-else />
                </n-icon>
                <h3 class="empty-state-title">
                  {{
                    filteredOutEverything
                      ? "No photos match your filters"
                      : "No photos available"
                  }}
                </h3>
                <p class="empty-state-description">
                  {{
                    filteredOutEverything
                      ? "Try relaxing the filters above, or clear them to see the whole catalog again."
                      : "Try a different search or import more photos first."
                  }}
                </p>
              </div>
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </div>

    <template #action>
      <div class="dialog-actions">
        <div class="dialog-actions-left" />
        <div class="dialog-actions-right">
          <n-button @click="close">Cancel</n-button>
          <n-button
            type="primary"
            :disabled="selectedIds.length === 0"
            :loading="isSubmitting"
            @click="confirmSelection"
          >
            <template #icon>
              <n-icon><AddIcon /></n-icon>
            </template>
            {{
              selectedIds.length === 0
                ? "Add Photos"
                : `Add ${selectedIds.length} ${
                    selectedIds.length === 1 ? "Photo" : "Photos"
                  }`
            }}
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { NModal, NButton, NIcon, NTabs, NTabPane, NTooltip } from "naive-ui";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import {
  ImageOutline as ImageIcon,
  AddOutline as AddIcon,
  RefreshOutline as RefreshIcon,
  GitCompareOutline as SimilarIcon,
  BriefcaseOutline as BuilderIcon,
  ImagesOutline as CatalogIcon,
  FunnelOutline as FilterIcon,
} from "@vicons/ionicons5";
import { InfoCircleFilled } from "@vicons/antd";
import PhotoCard from "@/components/photoCards/PhotoCard.vue";
import PhotoFiltersPanel from "@/components/photos-grid/PhotoFiltersPanel.vue";
import PhotoSearchInput from "@/components/photos-grid/PhotoSearchInput.vue";
import { usePhotosStore } from "@/stores/photos";
import { useCollectionsStore } from "@/stores/collections";
import { useIsMobile } from "@/composables/useIsMobile";
import { usePaginatedPhotoGrid } from "@/composables/usePaginatedPhotoGrid";
import { api } from "@/utils/axios";
import {
  applyPhotoFilters,
  createEmptyPhotoFilters,
  countActivePhotoFilters,
} from "@/utils/photoFilters.js";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // Full build object (must contain result.builderPool)
  build: { type: Object, default: null },
  // Photo IDs already in the portfolio (will be excluded from suggestions)
  currentPhotoIds: { type: Array, default: () => [] },
});

const emit = defineEmits(["update:modelValue", "add-photos"]);

const dialog = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const { isMobile } = useIsMobile();

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
  // Mismo ancho que PhotosDialog: lo marca la fila de 9 selects de aspectos.
  return { maxWidth: "92vw", width: "1360px", maxHeight: "94vh" };
});

// ── Shared selection state (persists while switching tabs) ──
const activeTab = ref("similar");
const selectedIds = ref([]);
// id → photo object (thumbnail carrier for emission)
const selectedPhotoMap = ref(new Map());
const isSubmitting = ref(false);

// ── Similar tab ──
const similarResults = ref([]);
const isLoadingSimilar = ref(false);

async function fetchSimilar() {
  if (!props.currentPhotoIds.length) {
    similarResults.value = [];
    return;
  }
  isLoadingSimilar.value = true;
  try {
    const { data } = await api.post("/api/search/byPhotos", {
      anchorIds: props.currentPhotoIds,
      currentPhotosIds: props.currentPhotoIds,
      criteria: "embedding",
      opposite: false,
      inverted: false,
      resultLength: 60,
    });
    const list = Array.isArray(data) ? data : [data];
    similarResults.value = list.filter(
      (p) => p && p.id && !props.currentPhotoIds.includes(p.id),
    );
  } catch (err) {
    console.error("[PortfolioAddPhotosDialog] similar fetch error:", err);
    similarResults.value = [];
  } finally {
    isLoadingSimilar.value = false;
  }
}

// ── Builder pool tab ──
const builderPoolPhotos = computed(() => {
  const pool = props.build?.result?.builderPool ?? [];
  const currentSet = new Set(props.currentPhotoIds);
  return pool.filter((p) => p && p.id && !currentSet.has(p.id));
});

const hasBuilderPool = computed(
  () => (props.build?.result?.builderPool ?? []).length > 0,
);

// ── Catalog tab ──
const searchQuery = ref("");
const isSearching = ref(false);
const searchResults = ref([]);
const allCatalogPhotos = ref([]);
let searchTimeout = null;

const photoFilters = ref(createEmptyPhotoFilters());
const activeFilterCount = computed(() =>
  countActivePhotoFilters(photoFilters.value),
);

// Catálogo tras la búsqueda semántica pero antes de los filtros del panel: es
// la lista que alimenta el histograma de fechas.
const filterableCatalogPhotos = computed(() => {
  const currentSet = new Set(props.currentPhotoIds);
  const hasSearch = searchQuery.value.trim();
  const hasResults = searchResults.value && searchResults.value.length > 0;
  if (hasSearch && hasResults) {
    // Los resultados semánticos no siempre traen `descriptions` completas:
    // rehidratamos desde el store para que los filtros tengan datos.
    const byId = new Map(allCatalogPhotos.value.map((p) => [p.id, p]));
    return searchResults.value
      .filter((p) => !currentSet.has(p.id))
      .map((p) => byId.get(p.id) ?? p);
  }
  return allCatalogPhotos.value.filter((p) => !currentSet.has(p.id));
});

const catalogPhotos = computed(() =>
  applyPhotoFilters(
    filterableCatalogPhotos.value,
    photoFilters.value,
    collectionsStore.allCollections,
  ),
);

const catalogCountLabel = computed(() => {
  const count = catalogPhotos.value.length;
  if (activeFilterCount.value > 0) {
    return `${count} of ${filterableCatalogPhotos.value.length} photos`;
  }
  return `${count} ${count === 1 ? "photo" : "photos"}`;
});

// Grilla vacía por culpa de los filtros, no por falta de fotos
const filteredOutEverything = computed(
  () => activeFilterCount.value > 0 && filterableCatalogPhotos.value.length > 0,
);

function onSearchChange() {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (!searchQuery.value.trim()) {
    clearSearch();
    return;
  }
  searchTimeout = setTimeout(async () => {
    await performSearch();
  }, 800);
}

async function performSearch() {
  if (!searchQuery.value.trim()) {
    clearSearch();
    return;
  }
  isSearching.value = true;
  searchResults.value = [];
  try {
    const { data: response } = await api.post("/api/search/semantic/sync", {
      description: searchQuery.value.trim(),
      options: { iteration: 1, pageSize: 100, searchMode: "broad" },
    });
    if (response.data?.results) {
      const photos = [];
      Object.entries(response.data.results).forEach(([_, items]) => {
        photos.push(...items.map((i) => i.photo));
      });
      searchResults.value = photos;
    } else {
      searchResults.value = [];
    }
  } catch (err) {
    console.error("[PortfolioAddPhotosDialog] search error:", err);
    searchResults.value = [];
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

// ── Scroll infinito por pestaña ──
// Cada grilla se desplaza sobre sí misma y monta sólo las páginas cargadas:
// montar de golpe el catálogo entero (miles de PhotoCard) tardaba muchísimo o
// agotaba la memoria en dispositivos modestos.
const {
  containerRef: builderGridRef,
  visiblePhotos: visibleBuilderPhotos,
  hasMore: hasMoreBuilder,
  onScroll: onBuilderScroll,
  fillViewport: fillBuilderViewport,
} = usePaginatedPhotoGrid(builderPoolPhotos);

const {
  containerRef: similarGridRef,
  visiblePhotos: visibleSimilarPhotos,
  hasMore: hasMoreSimilar,
  onScroll: onSimilarScroll,
  fillViewport: fillSimilarViewport,
} = usePaginatedPhotoGrid(similarResults);

const {
  containerRef: catalogGridRef,
  visiblePhotos: visibleCatalogPhotos,
  hasMore: hasMoreCatalog,
  onScroll: onCatalogScroll,
  fillViewport: fillCatalogViewport,
} = usePaginatedPhotoGrid(catalogPhotos);

// n-tabs sólo renderiza la pestaña activa, así que la grilla se monta al
// cambiar de pestaña: hay que medirla entonces para saber si la primera página
// desborda el contenedor.
watch(activeTab, () => {
  nextTick(() => {
    fillBuilderViewport();
    fillSimilarViewport();
    fillCatalogViewport();
  });
});

// ── Selection handling ──
// Set para el test de pertenencia del template: con `selectedIds.includes()`
// cada render de la grilla costaba O(fotos × seleccionadas).
const selectedSet = computed(() => new Set(selectedIds.value));

function toggleSelection(photoId) {
  const idx = selectedIds.value.indexOf(photoId);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
    selectedPhotoMap.value.delete(photoId);
  } else {
    const photo = findPhotoById(photoId);
    if (!photo) return;
    selectedIds.value.push(photoId);
    selectedPhotoMap.value.set(photoId, {
      id: photo.id,
      thumbnailUrl: photo.thumbnailUrl,
    });
  }
}

function findPhotoById(id) {
  return (
    similarResults.value.find((p) => p.id === id) ||
    builderPoolPhotos.value.find((p) => p.id === id) ||
    allCatalogPhotos.value.find((p) => p.id === id) ||
    searchResults.value.find((p) => p.id === id) ||
    null
  );
}

function selectAllVisible(list) {
  for (const photo of list) {
    if (!selectedIds.value.includes(photo.id)) {
      selectedIds.value.push(photo.id);
      selectedPhotoMap.value.set(photo.id, {
        id: photo.id,
        thumbnailUrl: photo.thumbnailUrl,
      });
    }
  }
}

function clearSelection() {
  selectedIds.value = [];
  selectedPhotoMap.value.clear();
}

async function confirmSelection() {
  if (selectedIds.value.length === 0) return;
  isSubmitting.value = true;
  try {
    const photos = selectedIds.value
      .map((id) => selectedPhotoMap.value.get(id))
      .filter(Boolean);
    emit("add-photos", photos);
    close();
  } finally {
    isSubmitting.value = false;
  }
}

function close() {
  clearSelection();
  clearSearch();
  emit("update:modelValue", false);
}

// ── Initialize on open ──
watch(
  () => props.modelValue,
  async (isOpen) => {
    if (!isOpen) return;
    clearSelection();
    clearSearch();
    photoFilters.value = createEmptyPhotoFilters();
    if (hasBuilderPool.value) {
      activeTab.value = "builder";
    } else if (props.currentPhotoIds.length > 0) {
      activeTab.value = "similar";
    } else {
      activeTab.value = "catalog";
    }

    // Si la pestaña activa no cambia respecto a la apertura anterior el watcher
    // de `activeTab` no se dispara, pero la grilla sí se ha vuelto a montar.
    nextTick(() => {
      fillBuilderViewport();
      fillSimilarViewport();
      fillCatalogViewport();
    });

    // Preload catalog in background
    photosStore
      .getOrFetch()
      .then(() => {
        allCatalogPhotos.value = photosStore.processedPhotos ?? [];
      })
      .catch((err) =>
        console.error("[PortfolioAddPhotosDialog] catalog load error:", err),
      );

    // Preload similar photos in background
    fetchSimilar();
  },
);
</script>

<style scoped>
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

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  max-height: 65vh;
  overflow: hidden;
}

.add-photos-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.add-photos-tabs :deep(.n-tabs-pane-wrapper) {
  overflow: hidden;
  min-height: 0;
  flex: 1;
}

.tab-pane-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  min-height: 0;
}

/* Alto fijo en escritorio: así la grilla cede espacio al desplegar los filtros
   (en vez de recortarse contra el `overflow: hidden`) y las pestañas dejan de
   saltar de alto al cambiar de una a otra. */
@media (min-width: 769px) {
  /* El `max-height` de arriba es un tope duro: sin subirlo aquí también, el
     `height` no tiene ningún efecto. */
  .dialog-content {
    height: 78vh;
    max-height: 78vh;
  }

  .add-photos-tabs :deep(.n-tab-pane) {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .tab-pane-body {
    flex: 1;
    min-height: 0;
  }

  .tab-pane-body > .stats-bar {
    flex-shrink: 0;
  }

  .tab-pane-body > .photos-grid {
    flex: 1;
    min-height: 0;
    max-height: none;
  }

  .tab-pane-body > .empty-state,
  .tab-pane-body > .tab-loading {
    flex: 1;
    min-height: 0;
  }
}

.tab-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  gap: 20px;
}

.tab-loading-text {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

.stats-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
}

/* En la pestaña de catálogo la cuenta va sin marco: el panel de filtros que
   viene justo debajo ya aporta el contorno de tarjeta. */
.stats-bar--plain {
  background-color: transparent;
  border: none;
  padding: 0 2px;
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
  align-items: center;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 5px;
}

.info-icon {
  /* color: var(--text-tertiary); */
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s;
}

.info-icon:hover {
  color: var(--text-secondary);
}

.photos-grid {
  overflow-y: auto;
  grid-auto-rows: min-content;
  padding: var(--spacing-sm);
  max-height: calc(60vh - 140px);
}

/* Las tarjetas fuera del viewport del grid no pagan layout ni paint.
   contain-intrinsic-size reserva su alto para que la barra de scroll no salte. */
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

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 260px;
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
  font-size: var(--font-size-lg);
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

.dialog-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: space-between;
  width: 100%;
}

.dialog-actions-right {
  display: flex;
  gap: var(--spacing-md);
}

@media (max-width: 768px) {
  .stats-bar {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-sm);
  }

  .photos-grid {
    max-height: calc(60vh - 180px);
  }
}

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
