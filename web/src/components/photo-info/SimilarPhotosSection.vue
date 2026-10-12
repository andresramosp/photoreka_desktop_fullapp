<template>
  <div class="similar-photos-section">
    <!-- Puerta cerrada: la seccion no busca sola, se ofrece como un boton que
         hace a la vez de marcador de posicion. Hasta que el usuario lo pulsa
         no se monta nada ni se llama al backend. -->
    <div v-if="!enabled" class="similar-placeholder">
      <n-icon size="28" color="var(--text-tertiary)">
        <ImagesOutline />
      </n-icon>
      <p class="similar-placeholder-text">
        Find photos that look like this one
      </p>
      <n-button size="small" type="primary" @click="emit('enable')">
        <template #icon>
          <n-icon><SearchIcon /></n-icon>
        </template>
        Search similar photos
      </n-button>
    </div>

    <!-- Criteria Selector + Embedded Action Bar -->
    <div v-else class="similar-header">
      <n-select
        v-model:value="criteria"
        size="tiny"
        :options="criteriaOptions"
        :render-label="renderCriteriaLabel"
        class="criteria-select"
        :disabled="isLoading"
      />
      <FloatingActionBar
        embedded
        :selected-ids="selectedIds"
        :show-add-to-collection="true"
        :show-move-to-tool="true"
        :show-send-to-chat="true"
        :is-downloading="isDownloading"
        class="similar-action-bar-embedded"
        :class="{ 'similar-action-bar-hidden': selectedIds.length === 0 }"
        @download="handleDownload"
        @add-to-collection="showCollectionModal = true"
        @move-to-tool="openToolSelector"
        @send-to-chat="handleSendToChat"
      />
    </div>

    <!-- Photo Grid -->
    <div v-if="enabled" class="similar-grid-wrapper">
      <!-- Loading state (tambien mientras la seccion sigue cerrada: reserva el
           alto para que el panel no pegue un salto al llegar los resultados) -->
      <div v-if="isLoading || !hasLoaded" class="similar-grid">
        <div v-for="n in 8" :key="`skel-${n}`" class="similar-photo-skeleton">
          <n-skeleton height="100%" />
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="photos.length === 0" class="similar-empty">
        <n-icon size="32" color="var(--text-tertiary)">
          <ImagesOutline />
        </n-icon>
        <p>No similar photos found</p>
      </div>

      <!-- Photo cards grid -->
      <div v-else class="similar-grid">
        <PhotoCard
          v-for="photo in photos"
          :key="photo.id"
          :photo="photo"
          :selected="selectedIds.includes(photo.id)"
          :is-selection-mode="selectedIds.length > 0"
          :show-info-button="true"
          :show-stars="false"
          :require-long-press="false"
          @select="toggleSelection(photo.id)"
          @info="handlePhotoInfo"
        />
      </div>
    </div>

    <!-- Collection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="selectedIds.length"
      :photo-ids="selectedIds"
      @add-to-collection="onCollectionAdded"
      @add-to-series="onCollectionAdded"
      @add-to-portfolio="onCollectionAdded"
      @cancel="showCollectionModal = false"
    />

    <!-- Tool Selector -->
    <PhotoToolSelector
      :show="showToolSelectorModal"
      :photo-count="selectedIds.length"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="showToolSelectorModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { NButton, NSelect, NIcon, NSkeleton } from "naive-ui";
import { ImagesOutline, SearchOutline as SearchIcon } from "@vicons/ionicons5";
import PhotoCard from "@/components/photoCards/PhotoCard.vue";
import type { Photo } from "@/components/photoCards/PhotoCard.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import { api } from "@/utils/axios.ts";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import {
  criteriaOptions as buildCriteriaOptions,
  renderCriteriaLabel,
} from "@/config/searchCriteria";

const props = withDefaults(
  defineProps<{
    selectedPhoto: Photo | null;
    /** Puerta de la busqueda: mientras sea false no se llama al backend y en
     *  su sitio se pinta el boton de arranque (evento "enable"). El panel de
     *  escritorio la abre solo cuando el usuario pulsa ese boton; en movil el
     *  tab-pane ya es lazy, asi que por defecto viene abierta. */
    enabled?: boolean;
  }>(),
  { enabled: true },
);

const emit = defineEmits<{
  (e: "navigate-to-photo", photo: Photo): void;
  /** El usuario ha pulsado el boton de la seccion cerrada: el padre es quien
   *  levanta la puerta pasando enabled. */
  (e: "enable"): void;
  /** Skeleton o resultados acaban de reemplazar lo que hubiera antes: el
   *  padre puede querer reajustar el scroll, porque el alto del bloque
   *  cambia en cada paso. */
  (e: "loaded"): void;
  /** Acciones que sacan al usuario de aqui (tool / chat): el dialogo que nos
   *  contiene tiene que cerrarse antes de navegar, igual que hace la barra
   *  del stage. */
  (e: "request-close"): void;
}>();

// Criteria options (excluding "tags" as it requires interactive tag selection)
const criteriaOptions = buildCriteriaOptions([
  "embedding",
  "story",
  "content",
  "context",
  "chromatic",
]);

const criteria = ref("embedding");
const photos = ref<Photo[]>([]);
const isLoading = ref(false);
// Separa "todavia no se ha buscado" de "se busco y no hay nada": sin esto la
// seccion aun cerrada se pintaba con el vacio de "No similar photos found".
const hasLoaded = ref(false);
const selectedIds = ref<string[]>([]);

const showCollectionModal = ref(false);
const showToolSelectorModal = ref(false);
const isDownloading = ref(false);

const { downloadPhoto } = usePhotoDownload();
const {
  takeToTool,
  takeToChat,
  isProcessing: isProcessingTool,
  openToolSelector: openToolSelectorComposable,
  closeToolSelector,
} = usePhotoToolSelection();

function openToolSelector() {
  showToolSelectorModal.value = true;
}

async function loadSimilarPhotos() {
  if (!props.selectedPhoto?.id) return;
  isLoading.value = true;
  selectedIds.value = [];
  // El placeholder ya deja paso al skeleton en cuanto isLoading se pone a
  // true (misma renderizacion, sin esperar al finally): avisar aqui es lo que
  // permite ver el skeleton entero, no solo la mitad.
  await nextTick();
  emit("loaded");
  try {
    const { data } = await api.post("/api/search/byPhotos", {
      anchorIds: [props.selectedPhoto.id],
      currentPhotosIds: [],
      criteria: criteria.value,
      opposite: false,
      inverted: false,
      resultLength: 20,
      tagIds: [],
      boxesIds: [],
      collectionId: null,
    });
    photos.value = Array.isArray(data) ? data : [data];
  } catch (e) {
    console.error("Similar photos load failed:", e);
    photos.value = [];
  } finally {
    isLoading.value = false;
    hasLoaded.value = true;
    await nextTick();
    emit("loaded");
  }
}

function toggleSelection(photoId: string) {
  const idx = selectedIds.value.indexOf(photoId);
  if (idx > -1) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(photoId);
  }
}

function clearSelection() {
  selectedIds.value = [];
}

function handlePhotoInfo(photo: Photo) {
  emit("navigate-to-photo", photo);
}

async function handleDownload() {
  isDownloading.value = true;
  try {
    for (const id of selectedIds.value) {
      const photo = photos.value.find((p) => p.id === id);
      if (photo) await downloadPhoto(photo);
    }
  } finally {
    isDownloading.value = false;
  }
}

function onCollectionAdded() {
  showCollectionModal.value = false;
}

async function handleToolSelected(
  toolId: string,
  canvasId: string | null = null,
) {
  showToolSelectorModal.value = false;
  emit("request-close");
  await takeToTool(toolId, [...selectedIds.value], clearSelection, canvasId);
}

async function handleSendToChat() {
  emit("request-close");
  await takeToChat([...selectedIds.value], clearSelection);
}

// Reload when photo or criteria changes. Abrir la puerta cuenta como cambio:
// asi la primera busqueda sale sola en cuanto la seccion se activa.
watch(
  [() => props.selectedPhoto?.id, criteria, () => props.enabled],
  () => {
    if (!props.enabled) return;
    loadSimilarPhotos();
  },
  { immediate: true },
);
</script>

<style scoped>
.similar-photos-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  position: relative;
  height: 100%;
}

.similar-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.similar-action-bar-embedded {
  margin-left: auto;
  flex-shrink: 0;
  transition:
    opacity 0.15s ease,
    visibility 0.15s ease;
}

.similar-action-bar-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.criteria-select {
  flex: 1;
  max-width: 200px;
}

.similar-grid-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  /* Ocupa el alto que le deja el panel en vez de un tope fijo: con un tope
     el panel ya acotado sobraba espacio abajo y, en pantallas bajas, salía
     un segundo scroll. */
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  padding-right: 4px;
}

.similar-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-sm);
}

.similar-photo-skeleton {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-surface);
}

.similar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xl) 0;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

.similar-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg) 0;
  text-align: center;
}

.similar-placeholder-text {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

/* PhotoCard sizing inside grid */
.similar-grid :deep(.photo-card) {
  width: 100%;
  aspect-ratio: 1;
}

/* Los botones flotantes de PhotoCard son fijos (40x40, icono de 20px): estan
   pensados para rejillas de celda grande. Aqui caben 4 columnas dentro del
   panel, asi que la pareja de botones casi tapa la miniatura. Se escalan igual
   que hace PhotoCardHub en sus breakpoints estrechos. */
@media (min-width: 769px) {
  .similar-grid :deep(.action-buttons-overlay) {
    gap: 6px;
  }

  .similar-grid :deep(.action-button) {
    width: 28px;
    height: 28px;
    border-radius: 6px !important;
  }

  .similar-grid :deep(.action-button .n-icon) {
    font-size: 14px !important;
  }
}

@media (max-width: 768px) {
  .similar-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
