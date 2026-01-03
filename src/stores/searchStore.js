import { defineStore } from "pinia";
import { ref, reactive, computed } from "vue";
import { useArtisticScores } from "@/composables/useArtisticScores";

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

  // Estado específico para cada tipo de búsqueda
  const searchStates = reactive({
    semantic: {
      query: "",
      results: [],
      iterationsRecord: {},
      iteration: 1,
      hasMoreIterations: false,
      maxPageAttempts: false,
      hasSearched: false,
      lastCursor: null, // ID of last photo for cursor-based pagination
    },
    tags: {
      includedTags: [],
      excludedTags: [],
      results: [],
      iterationsRecord: {},
      iteration: 1,
      hasMoreIterations: false,
      maxPageAttempts: false,
      hasSearched: false,
      lastCursor: null, // ID of last photo for cursor-based pagination
    },
    topological: {
      left: "",
      center: "",
      right: "",
      results: [],
      iterationsRecord: {},
      iteration: 1,
      hasMoreIterations: false,
      maxPageAttempts: false,
      hasSearched: false,
      lastCursor: null, // ID of last photo for cursor-based pagination
    },
  });

  // Computed para el estado actual
  const currentSearchState = computed(
    () => searchStates[activeSearchType.value]
  );

  // Computed para verificar si hay query
  const hasSearchQuery = computed(() => {
    const state = currentSearchState.value;

    switch (activeSearchType.value) {
      case "semantic":
        return state.query.trim().length > 0;
      case "tags":
        return state.includedTags.length > 0 || state.excludedTags.length > 0;
      case "topological":
        return (
          state.left.trim().length > 0 ||
          state.center.trim().length > 0 ||
          state.right.trim().length > 0
        );
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
    searchMode.value = mode;
  }

  function updateSemanticQuery(query) {
    searchStates.semantic.query = query;
  }

  function updateTagsSearch(included, excluded) {
    searchStates.tags.includedTags = included;
    searchStates.tags.excludedTags = excluded;
  }

  function updateTopologicalSearch(left, center, right) {
    searchStates.topological.left = left;
    searchStates.topological.center = center;
    searchStates.topological.right = right;
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
    const state = currentSearchState.value;

    // Limpiar solo el tipo de búsqueda actual
    switch (activeSearchType.value) {
      case "semantic":
        state.query = "";
        break;
      case "tags":
        state.includedTags = [];
        state.excludedTags = [];
        break;
      case "topological":
        state.left = "";
        state.center = "";
        state.right = "";
        break;
    }

    // Limpiar visual aspects
    selectedVisualAspects.value = [];

    // Limpiar artistic scores
    selectedArtisticScores.value = [];

    // Limpiar resultados y estado de paginación
    state.results = [];
    state.iterationsRecord = {};
    state.iteration = 1;
    state.hasMoreIterations = false;
    state.maxPageAttempts = false;
    state.hasSearched = false;
  }

  function clearAllSearches() {
    Object.keys(searchStates).forEach((type) => {
      const state = searchStates[type];
      if (type === "semantic") {
        state.query = "";
      } else if (type === "tags") {
        state.includedTags = [];
        state.excludedTags = [];
      } else if (type === "topological") {
        state.left = "";
        state.center = "";
        state.right = "";
      }

      state.results = [];
      state.iterationsRecord = {};
      state.iteration = 1;
      state.hasMoreIterations = false;
      state.maxPageAttempts = false;
      state.hasSearched = false;
    });

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
