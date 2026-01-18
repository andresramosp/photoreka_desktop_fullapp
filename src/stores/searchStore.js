import { defineStore } from "pinia";
import { ref, reactive, computed } from "vue";
import { useArtisticScores } from "@/composables/useArtisticScores";

// ===== CONFIGURACIÓN DE ESTADO =====
// Cambiar a true para usar un estado compartido único (grid y queries compartidos)
// Cambiar a false para usar estados separados por type+mode
const USE_SHARED_STATE = true;
// ===================================

// Export visualAspectsOptions for reuse in other components

export const visualAspectsOptions = [
  {
    type: "group",
    label: "Palette",
    key: "palette",
    children: [
      { label: "Black and white", value: "black and white" },
      { label: "Color", value: "color" },
    ],
  },
  {
    type: "group",
    label: "Orientation",
    key: "orientation",
    children: [
      { label: "Horizontal", value: "horizontal" },
      { label: "Vertical", value: "vertical" },
    ],
  },
  {
    type: "group",
    label: "Temperature",
    key: "temperature",
    children: [
      { label: "Cold", value: "cold" },
      { label: "Warm", value: "warm" },
      { label: "Neutral", value: "neutral" },
    ],
  },
  {
    type: "group",
    label: "Focus",
    key: "focus",
    children: [
      { label: "Blurry", value: "blurry" },
      { label: "Nitid", value: "nitid" },
    ],
  },
  {
    type: "group",
    label: "Lighting Scheme",
    key: "lighting_scheme",
    children: [
      { label: "Low key", value: "low key" },
      { label: "High key", value: "high key" },
      { label: "Balanced", value: "balanced" },
    ],
  },
  {
    type: "group",
    label: "Stylistic",
    key: "stylistic",
    children: [
      { label: "Long exposure", value: "long exposure" },
      { label: "Motion blur", value: "motion blur" },
      { label: "Silhouettes", value: "silhouettes" },
      { label: "Bokeh", value: "bokeh" },
      { label: "Grain", value: "grain" },
    ],
  },
  {
    type: "group",
    label: "Lighting",
    key: "lighting",
    children: [
      { label: "Natural", value: "natural" },
      { label: "Artificial", value: "artificial" },
      { label: "Backlit", value: "backlit" },
      { label: "Frontlit", value: "frontlit" },
      { label: "Side lit", value: "side lit" },
    ],
  },
  {
    type: "group",
    label: "Depth of Field",
    key: "depth_of_field",
    children: [
      { label: "Shallow", value: "shallow" },
      { label: "Deep", value: "deep" },
      { label: "Medium", value: "medium" },
    ],
  },
  {
    type: "group",
    label: "Framing",
    key: "framing",
    children: [
      { label: "Close-up", value: "close-up" },
      { label: "Medium shot", value: "medium shot" },
      { label: "Wide shot", value: "wide shot" },
    ],
  },
  {
    type: "group",
    label: "Genre",
    key: "genre",
    children: [
      { label: "Abstract", value: "abstract" },
      { label: "Documentary", value: "documentary" },
      { label: "Street", value: "street" },
      { label: "Landscape", value: "landscape" },
      { label: "Portrait", value: "portrait" },
    ],
  },
  {
    type: "group",
    label: "Perspective",
    key: "perspective",
    children: [
      { label: "Normal", value: "normal" },
      { label: "High angle", value: "high angle" },
      { label: "Low angle", value: "low angle" },
    ],
  },
];

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

  // Visual aspects filter state
  const selectedVisualAspects = ref([]);

  // Artistic scores filter state
  const selectedArtisticScores = ref([]);

  // Helper function to create empty mode state with query fields
  const createModeState = () => ({
    // Semantic search
    query: "",
    // Tags search
    includedTags: [],
    excludedTags: [],
    // Topological search
    left: "",
    center: "",
    right: "",
    // Pagination
    iterationsRecord: {},
    iteration: 1,
    hasMoreIterations: false,
    maxPageAttempts: false,
    hasSearched: false,
    lastCursor: null, // ID of last photo for cursor-based pagination
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
    topological: {
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
      case "topological":
        return (
          (modeState.left || "").trim().length > 0 ||
          (modeState.center || "").trim().length > 0 ||
          (modeState.right || "").trim().length > 0
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
  });

  // Actions
  function setSearchType(type) {
    if (["semantic", "tags", "topological"].includes(type)) {
      activeSearchType.value = type;
    }
  }

  function setSearchMode(mode) {
    const previousMode = searchMode.value;
    searchMode.value = mode;

    // Si el modo cambió, no resetear nada - cada modo mantiene su propio estado
    // El cambio de modo simplemente cambia qué resultados se muestran
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

  function updateTopologicalSearch(left, center, right) {
    const modeState = currentSearchState.value;
    if (modeState) {
      modeState.left = left;
      modeState.center = center;
      modeState.right = right;
    }
  }

  function updateVisualAspects(visualAspects) {
    selectedVisualAspects.value = visualAspects;
  }

  function clearVisualAspects() {
    selectedVisualAspects.value = [];
  }

  function updateArtisticScores(artisticScores) {
    selectedArtisticScores.value = artisticScores;
  }

  function clearArtisticScores() {
    selectedArtisticScores.value = [];
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
      modeState.left = "";
      modeState.center = "";
      modeState.right = "";
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
        case "topological":
          modeState.left = "";
          modeState.center = "";
          modeState.right = "";
          break;
      }
    }

    // Limpiar visual aspects
    selectedVisualAspects.value = [];

    // Limpiar artistic scores
    selectedArtisticScores.value = [];

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
      sharedState.left = "";
      sharedState.center = "";
      sharedState.right = "";
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
        } else if (type === "topological") {
          typeState.left = "";
          typeState.center = "";
          typeState.right = "";
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

    // Limpiar visual aspects
    selectedVisualAspects.value = [];

    // Limpiar artistic scores
    selectedArtisticScores.value = [];
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
    updateSemanticQuery,
    updateTagsSearch,
    updateTopologicalSearch,
    updateVisualAspects,
    clearVisualAspects,
    updateArtisticScores,
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
