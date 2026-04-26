import { defineStore } from "pinia";
import { ref, reactive, computed } from "vue";
import { useArtisticScores } from "@/composables/useArtisticScores";
import { buildVisualAspectsOptions } from "@/config/photo_schema";

// ===== CONFIGURACIÓN DE ESTADO =====
// Cambiar a true para usar un estado compartido único (grid y queries compartidos)
// Cambiar a false para usar estados separados por type+mode
const USE_SHARED_STATE = true;
// ===================================

// Visual aspects options for the UI tree-select.
// Derived from the central photo schema (#config/photo_schema → @/config/photo_schema).
// `focus` and `lighting_scheme` are intentionally hidden from the search UI
// (mirrors the previous hardcoded behavior).
export const visualAspectsOptions = buildVisualAspectsOptions([
  "focus",
  "lighting_scheme",
]);

// Function to transform artistic scores to tree-select format
export function createArtisticScoresTreeOptions() {
  const { artisticScores } = useArtisticScores();

  return Object.entries(artisticScores).map(([groupKey, group]) => ({
    label: group.label,
    key: groupKey,
    disabled: false, // Allow interaction for expanding
    checkable: false, // But not selectable
    children: group.criteria.map((criterion) => ({
      label: criterion.label,
      key: criterion.value,
      disabled: false,
      checkable: true, // Children are selectable
    })),
  }));
}

export const useSearchStore = defineStore("search", () => {
  // Estado global del search
  const activeSearchType = ref("semantic");
  const searchMode = ref("broad");
  const isSearching = ref(false);
  const isLoadingMore = ref(false);

  // Collections filter state
  const selectedCollections = ref([]);

  // Visual aspects filter state
  const selectedVisualAspects = ref([]);

  // Artistic scores filter state: { [criterionKey]: { value: number, operator: '>=' | '<=' } }
  const selectedArtisticScores = ref({});

  // Helper function to create empty mode state with query fields
  const createModeState = () => ({
    // Semantic search
    query: "",
    // Tags search
    includedTags: [],
    excludedTags: [],
    // Pagination
    iterationsRecord: {},
    iteration: 1,
    hasMoreIterations: false,
    maxPageAttempts: false,
    hasSearched: false,
    lastCursor: null, // ID of last photo for cursor-based pagination
    // Options
    withInsights: false,
  });

  // Estado compartido único (cuando USE_SHARED_STATE = true)
  const sharedState = reactive(createModeState());

  // Estado específico para cada tipo de búsqueda con modos independientes
  const searchStates = reactive({
    semantic: {
      modes: {
        broad: createModeState(),
        adaptive: createModeState(),
        precise: createModeState(),
      },
    },
    tags: {
      modes: {
        broad: createModeState(),
        adaptive: createModeState(),
        precise: createModeState(),
      },
    },
  });

  // Computed para el estado actual (incluye el modo actual)
  const currentSearchState = computed(() => {
    if (USE_SHARED_STATE) {
      return sharedState;
    }
    return searchStates[activeSearchType.value].modes[searchMode.value];
  });

  // Computed para verificar si hay query
  const hasSearchQuery = computed(() => {
    const modeState = currentSearchState.value;

    if (!modeState) return false;

    switch (activeSearchType.value) {
      case "semantic":
        return (modeState.query || "").trim().length > 0;
      case "tags":
        return (
          modeState.includedTags.length > 0 || modeState.excludedTags.length > 0
        );
      default:
        return false;
    }
  });

  // Computed para verificar si el tipo actual ha buscado
  const hasSearched = computed(() => currentSearchState.value.hasSearched);

  // Computed para verificar si hay resultados
  const hasResults = computed(() => searchResults.value.length > 0);
  const searchResults = computed(() => {
    const state = currentSearchState.value;
    const keys = Object.keys(state.iterationsRecord)
      .map(Number)
      .sort((a, b) => a - b);

    let all = [];
    for (let i = 0; i < state.iteration; i++) {
      const k = keys[i];
      if (k !== undefined && state.iterationsRecord[k]?.photos) {
        all.push(...state.iterationsRecord[k].photos);
      }
    }

    // Mostrar esqueletos si está cargando inicial
    if (isSearching.value) {
      return Array.from({ length: 12 }).map((_, i) => ({
        id: `skeleton-${i}`,
        isSkeleton: true,
        src: null,
      }));
    }

    // Esqueletos sólo en la primera iteración de "cargar más"
    if (isLoadingMore.value && state.iteration === 1) {
      return Array.from({ length: 12 }).map((_, i) => ({
        id: `skeleton-${i}`,
        isSkeleton: true,
        src: null,
      }));
    }

    return all;

    // Deduplicate by photo ID (safety net for pagination edge cases)
    // const seen = new Set();
    // const deduped = all.filter((p) => {
    //   if (seen.has(p.id)) return false;
    //   seen.add(p.id);
    //   return true;
    // });

    // return deduped;
  });

  // Actions
  function setSearchType(type) {
    if (["semantic", "tags"].includes(type)) {
      activeSearchType.value = type;
    }
  }

  function setSearchMode(mode) {
    const previousMode = searchMode.value;
    searchMode.value = mode;

    // Si el modo cambió, no resetear nada - cada modo mantiene su propio estado
    // El cambio de modo simplemente cambia qué resultados se muestran
  }

  function setWithInsights(value) {
    const modeState = currentSearchState.value;
    if (modeState) {
      modeState.withInsights = value;
    }
  }

  function updateSemanticQuery(query) {
    const modeState = currentSearchState.value;
    if (modeState) {
      modeState.query = query;
    }
  }

  function updateTagsSearch(included, excluded) {
    const modeState = currentSearchState.value;
    if (modeState) {
      modeState.includedTags = included;
      modeState.excludedTags = excluded;
    }
  }

  function setSelectedCollections(collections) {
    selectedCollections.value = collections;
  }

  function updateVisualAspects(visualAspects) {
    selectedVisualAspects.value = visualAspects;
  }

  function setSelectedVisualAspects(visualAspects) {
    selectedVisualAspects.value = visualAspects;
  }

  function clearVisualAspects() {
    selectedVisualAspects.value = [];
  }

  function updateArtisticScores(artisticScores) {
    selectedArtisticScores.value = artisticScores;
  }

  function setSelectedArtisticScores(artisticScores) {
    selectedArtisticScores.value = artisticScores;
  }

  function clearArtisticScores() {
    selectedArtisticScores.value = {};
  }

  function clearCurrentSearch() {
    const modeState = currentSearchState.value;

    if (!modeState) return;

    // En modo compartido, limpiamos TODAS las queries de todos los tipos
    // En modo separado, solo limpiamos el modo actual del tipo actual
    if (USE_SHARED_STATE) {
      modeState.query = "";
      modeState.includedTags = [];
      modeState.excludedTags = [];
    } else {
      // Limpiar solo el modo actual del tipo de búsqueda actual
      switch (activeSearchType.value) {
        case "semantic":
          modeState.query = "";
          break;
        case "tags":
          modeState.includedTags = [];
          modeState.excludedTags = [];
          break;
      }
    }

    // Limpiar collections
    selectedCollections.value = [];

    // Limpiar visual aspects
    selectedVisualAspects.value = [];

    // Limpiar artistic scores
    selectedArtisticScores.value = {};

    // Limpiar resultados y estado de paginación solo del modo actual
    modeState.iterationsRecord = {};
    modeState.iteration = 1;
    modeState.hasMoreIterations = false;
    modeState.maxPageAttempts = false;
    modeState.hasSearched = false;
    modeState.lastCursor = null;
  }

  function clearAllSearches() {
    if (USE_SHARED_STATE) {
      // En modo compartido, solo limpiamos el estado compartido
      sharedState.query = "";
      sharedState.includedTags = [];
      sharedState.excludedTags = [];
      sharedState.iterationsRecord = {};
      sharedState.iteration = 1;
      sharedState.hasMoreIterations = false;
      sharedState.maxPageAttempts = false;
      sharedState.hasSearched = false;
      sharedState.lastCursor = null;
    } else {
      // En modo separado, limpiamos todos los tipos y modos
      Object.keys(searchStates).forEach((type) => {
        const typeState = searchStates[type];
        if (type === "semantic") {
          typeState.query = "";
        } else if (type === "tags") {
          typeState.includedTags = [];
          typeState.excludedTags = [];
        }

        // Limpiar todos los modos
        Object.keys(typeState.modes).forEach((mode) => {
          const modeState = typeState.modes[mode];
          modeState.iterationsRecord = {};
          modeState.iteration = 1;
          modeState.hasMoreIterations = false;
          modeState.maxPageAttempts = false;
          modeState.hasSearched = false;
          modeState.lastCursor = null;
        });
      });
    }

    // Limpiar collections
    selectedCollections.value = [];

    // Limpiar visual aspects
    selectedVisualAspects.value = [];

    // Limpiar artistic scores
    selectedArtisticScores.value = {};
  }

  function setSearching(value) {
    isSearching.value = value;
  }

  function setLoadingMore(value) {
    isLoadingMore.value = value;
  }

  function resetCurrentIteration() {
    const state = currentSearchState.value;
    state.iteration = 1;
    state.iterationsRecord = {};
    state.hasMoreIterations = false;
    state.maxPageAttempts = false;
    state.lastCursor = null; // Reset cursor for new search
  }

  function updateSearchResults(data) {
    const state = currentSearchState.value;

    // Actualizar iterationsRecord con los nuevos resultados
    let allNewPhotos = [];
    Object.entries(data.results).forEach(([iter, items]) => {
      const photos = items.map((i) => i.photo);
      state.iterationsRecord[iter] = {
        photos: photos,
      };
      allNewPhotos.push(...photos);
    });

    // Update cursor to the ID of the last photo received
    if (allNewPhotos.length > 0) {
      state.lastCursor = allNewPhotos[allNewPhotos.length - 1].id;
    }

    state.hasMoreIterations = data.hasMore;
    state.iteration = data.iteration + 1;
    state.hasSearched = true;
  }

  function setMaxPageAttempts() {
    currentSearchState.value.maxPageAttempts = true;
  }

  function incrementIteration() {
    currentSearchState.value.iteration++;
  }

  return {
    // State
    activeSearchType,
    searchMode,
    isSearching,
    isLoadingMore,
    searchStates,
    selectedCollections,
    selectedVisualAspects,
    selectedArtisticScores,
    visualAspectsOptions,

    // Computed
    currentSearchState,
    hasSearchQuery,
    searchResults,
    hasSearched,
    hasResults,

    // Actions
    setSearchType,
    setSearchMode,
    setWithInsights,
    updateSemanticQuery,
    updateTagsSearch,
    setSelectedCollections,
    updateVisualAspects,
    setSelectedVisualAspects,
    clearVisualAspects,
    updateArtisticScores,
    setSelectedArtisticScores,
    clearArtisticScores,
    clearCurrentSearch,
    clearAllSearches,
    setSearching,
    setLoadingMore,
    resetCurrentIteration,
    updateSearchResults,
    setMaxPageAttempts,
    incrementIteration,
  };
});
