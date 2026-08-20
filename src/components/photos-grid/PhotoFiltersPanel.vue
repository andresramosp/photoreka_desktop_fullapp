<template>
  <div class="photo-filters">
    <div class="pf-body">
      <n-tabs
        v-model:value="activeTab"
        type="line"
        size="small"
        class="pf-tabs"
        :theme-overrides="{ tabGapSmallLine: '15px' }"
        @click.stop
      >
        <!-- Estado global de los filtros al final del nav: sin cabecera propia
             el nav de pestañas es la única fila fija del panel -->
        <template #suffix>
          <div v-if="activeCount > 0 || $slots.suffix" class="pf-suffix">
            <template v-if="activeCount > 0">
              <n-tag size="tiny" type="primary" :bordered="false" round>
                {{ activeCount }}
              </n-tag>
              <n-button
                text
                size="tiny"
                class="pf-clear"
                @click.stop="clearAll"
              >
                Clear all
              </n-button>
            </template>
            <!-- El padre aprovecha el extremo libre del nav para el recuento -->
            <slot name="suffix" />
          </div>
        </template>

        <!-- Búsquedas: semántica (slot del padre) + nombre de archivo -->
        <n-tab-pane name="basic" display-directive="show">
          <template #tab>
            <n-icon size="13" class="pf-tab-icon"><Search20Regular /></n-icon>
            <span class="pf-tab-label">Basic Filters</span>
            <span v-if="hasBasicFilters" class="pf-tab-dot" />
          </template>
          <div class="pf-search-row">
            <div v-if="$slots.search" class="pf-search-cell">
              <slot name="search" />
            </div>
            <div class="pf-search-cell">
              <n-input
                v-model:value="filenameInput"
                placeholder="Search by file name..."
                size="small"
                clearable
                @update:value="onFilenameInput"
              >
                <template #prefix>
                  <n-icon size="14"><Document20Regular /></n-icon>
                </template>
              </n-input>
            </div>
            <div
              v-if="showCollections"
              class="pf-search-cell pf-collections-cell"
            >
              <n-icon size="14" class="pf-collections-icon">
                <component :is="collectionsIcon" />
              </n-icon>
              <n-select
                class="pf-collections-select"
                :value="modelValue.collectionIds ?? []"
                v-model:show="collectionsDropdownShow"
                multiple
                filterable
                clearable
                size="small"
                placeholder="All collections"
                :options="collectionOptions"
                :max-tag-count="3"
                :loading="collectionsStore.isLoading"
                @update:value="updateCollections($event)"
              />
            </div>
          </div>
        </n-tab-pane>

        <!-- Aspectos, scores y rango temporal, sin títulos de sección: las
             etiquetas propias de cada control ya los identifican -->
        <n-tab-pane name="advanced" display-directive="show">
          <template #tab>
            <n-icon size="13" class="pf-tab-icon"><Options20Regular /></n-icon>
            <span class="pf-tab-label">Advanced</span>
            <span v-if="hasAdvancedFilters" class="pf-tab-dot" />
          </template>
          <div class="pf-advanced">
            <VisualFiltersPanel
              :visual-aspects="modelValue.visualAspects"
              :score-filters="modelValue.scoreFilters"
              :show-section-labels="false"
              :hide-scores="hideScores"
              @update:visual-aspects="patch({ visualAspects: $event })"
              @update:score-filters="patch({ scoreFilters: $event })"
            />

            <div v-if="hasDatedPhotos" class="pf-time-range">
              <TimeRangeFilter
                ref="timeRangeFilterRef"
                :photos="photos"
                :show-title="false"
                histogram-height="20px"
                :marks-count="4"
                @time-range-change="patch({ timeRange: $event })"
              />
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import {
  NButton,
  NIcon,
  NInput,
  NSelect,
  NTag,
  NTabs,
  NTabPane,
} from "naive-ui";
import { useDebounceFn } from "@vueuse/core";
import {
  Search20Regular,
  Options20Regular,
  Document20Regular,
} from "@vicons/fluent";
import VisualFiltersPanel from "@/components/photos-grid/VisualFiltersPanel.vue";
import TimeRangeFilter from "@/components/TimeRangeFilter.vue";
import { useCollectionsStore } from "@/stores/collections";
import { getIconComponent, getToolById } from "@/config/toolsConfig";
import {
  createEmptyPhotoFilters,
  countActivePhotoFilters,
  hasActiveVisualAspects,
} from "@/utils/photoFilters.js";

const props = defineProps({
  /** Estado de filtros con la forma de `createEmptyPhotoFilters()` */
  modelValue: {
    type: Object,
    default: () => createEmptyPhotoFilters(),
  },
  /** Lista base (sin filtrar) sobre la que se dibuja el histograma de fechas */
  photos: {
    type: Array,
    default: () => [],
  },
  /** Oculta los sliders de artistic scores; deja sólo los selects de aspectos */
  hideScores: {
    type: Boolean,
    default: false,
  },
  /** Añade el filtro por colecciones a la pestaña de búsqueda */
  showCollections: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue"]);

const activeTab = ref("basic");
const timeRangeFilterRef = ref(null);
const collectionsStore = useCollectionsStore();

const activeCount = computed(() => countActivePhotoFilters(props.modelValue));

const hasBasicFilters = computed(
  () =>
    (props.modelValue.filenameSearch || "").trim().length > 0 ||
    (props.modelValue.collectionIds ?? []).length > 0,
);

// El desplegable se cierra al elegir una colección, como el resto de selects
// múltiples de los paneles de filtros
const collectionsDropdownShow = ref(false);

// Mismo icono que identifica a Collections en el resto de la app
const collectionsIcon = getIconComponent(getToolById("collections")?.icon);

function updateCollections(value) {
  collectionsDropdownShow.value = false;
  patch({ collectionIds: value ?? [] });
}

const collectionOptions = computed(() =>
  collectionsStore.allCollections.map((c) => ({
    label: c.title || c.name || `Collection ${c.id}`,
    value: c.id,
  })),
);

onMounted(() => {
  if (!props.showCollections) return;
  collectionsStore
    .getOrFetch()
    .catch((err) =>
      console.error("[PhotoFiltersPanel] collections load error:", err),
    );
});

const hasAdvancedFilters = computed(
  () =>
    hasActiveVisualAspects(props.modelValue.visualAspects) ||
    Object.keys(props.modelValue.scoreFilters ?? {}).length > 0 ||
    Array.isArray(props.modelValue.timeRange),
);

// TimeRangeFilter se oculta solo si ninguna foto tiene fecha; lo comprobamos
// aquí también para no dejar un hueco vacío bajo los sliders.
const hasDatedPhotos = computed(() =>
  props.photos.some((photo) => {
    const taken = photo?.descriptions?.EXIF?.dateTaken;
    return !!taken && !isNaN(new Date(taken).getTime());
  }),
);

function patch(partial) {
  emit("update:modelValue", { ...props.modelValue, ...partial });
}

// ── Nombre de archivo ────────────────────────────────────────────────────────
// El filtrado es en cliente sobre miles de fotos: sin debounce cada pulsación
// recorre el catálogo entero y remonta la grilla.
const filenameInput = ref(props.modelValue.filenameSearch ?? "");

const emitFilename = useDebounceFn((value) => {
  patch({ filenameSearch: value ?? "" });
}, 250);

function onFilenameInput(value) {
  emitFilename(value ?? "");
}

// Reset externo (reabrir el diálogo, "Clear all")
watch(
  () => props.modelValue.filenameSearch,
  (value) => {
    if ((value ?? "") !== filenameInput.value)
      filenameInput.value = value ?? "";
  },
);

function clearAll() {
  filenameInput.value = "";
  timeRangeFilterRef.value?.clearFilter();
  emit("update:modelValue", createEmptyPhotoFilters());
}
</script>

<style scoped>
.photo-filters {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
}

/* Estado de los filtros, alineado al final del nav de pestañas */
.pf-suffix {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding-bottom: 6px;
}

.pf-clear {
  font-size: 11px;
  color: var(--text-secondary);
}

.pf-clear:hover {
  color: var(--warning-color);
}

/* Body */
.pf-body {
  padding: 2px var(--spacing-md) 10px;
}

.pf-tabs :deep(.n-tabs-nav) {
  padding: 0 2px;
  margin-bottom: 8px;
}

.pf-tabs :deep(.n-tab-pane) {
  padding: 0;
}

.pf-tab-icon {
  margin-right: 4px;
  vertical-align: middle;
}

.pf-tab-label {
  font-size: 11px;
}

/* Punto indicador de filtros activos en la pestaña */
.pf-tab-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--primary-color);
  margin-left: 5px;
  vertical-align: middle;
  flex-shrink: 0;
}

/* Pestaña de búsqueda: los dos buscadores en línea */
.pf-search-row {
  display: flex;
  gap: 10px;
  padding-bottom: 2px;
}

.pf-search-cell {
  flex: 1 1 0;
  min-width: 0;
}

/* n-select no tiene slot de prefijo: el icono se superpone y el contenido
   del selector se desplaza para dejarle sitio */
.pf-collections-cell {
  position: relative;
}

.pf-collections-icon {
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary, var(--text-secondary));
  pointer-events: none;
  z-index: 1;
}

.pf-collections-select :deep(.n-base-selection-tags),
.pf-collections-select :deep(.n-base-selection-placeholder) {
  padding-left: 28px;
}

/* Pestaña de filtros */
.pf-advanced {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* El slider de fechas viene dimensionado para el panel ancho de la grilla */
.pf-time-range :deep(.time-range-filter) {
  gap: 2px;
}

.pf-time-range :deep(.n-slider) {
  margin-top: 0;
}

@media (max-width: 767px) {
  .pf-body {
    padding: 4px var(--spacing-sm) 10px;
    max-height: 46vh;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  /* Dos inputs en paralelo no caben: apilados siguen siendo usables */
  .pf-search-row {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
