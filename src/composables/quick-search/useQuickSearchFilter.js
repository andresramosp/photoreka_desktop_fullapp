import { onBeforeUnmount, ref, watch } from "vue";
import { api } from "@/utils/axios";

const SEARCH_DEBOUNCE_MS = 220;

/**
 * Selección de tags de la barra y su traducción a fotos.
 *
 * Los géneros se filtran en cliente (la grilla ya sabe hacerlo con
 * `visual_aspects`), pero los tags no viajan en el objeto foto: hay que
 * preguntar a /api/search/tags/direct, que devuelve
 * `[{ photoId, matchedIncluded }]` — exactamente lo que consume el filtro de
 * tags de PhotosGrid.
 *
 * Modo OR: varios chips de tag amplían el resultado, no lo estrechan.
 */
export function useQuickSearchFilter() {
  const selectedTags = ref([]);
  /** null = filtro inactivo (distinto de "ningún resultado"). */
  const tagResults = ref(null);
  const isSearchingTags = ref(false);

  let debounceTimer = null;
  // Descarta respuestas de peticiones que ya no son la última.
  let latestRequestId = 0;

  const toggleTag = (name) => {
    selectedTags.value = selectedTags.value.includes(name)
      ? selectedTags.value.filter((tag) => tag !== name)
      : [...selectedTags.value, name];
  };

  const clearTags = () => {
    selectedTags.value = [];
  };

  const runSearch = async (tags) => {
    const requestId = ++latestRequestId;
    isSearchingTags.value = true;
    try {
      const { data } = await api.post("/api/search/tags/direct", {
        included: tags,
        excluded: [],
        mode: "OR",
        semantic: false,
      });
      if (requestId !== latestRequestId) return;
      tagResults.value = Array.isArray(data) ? data : [];
    } catch (error) {
      if (requestId !== latestRequestId) return;
      console.error("[quickSearch] tag search error:", error);
      // Sin resultados fiables, mejor no filtrar que vaciar la grilla en falso.
      tagResults.value = null;
    } finally {
      if (requestId === latestRequestId) isSearchingTags.value = false;
    }
  };

  watch(
    selectedTags,
    (tags) => {
      window.clearTimeout(debounceTimer);

      if (!Array.isArray(tags) || tags.length === 0) {
        // Invalida cualquier petición en vuelo: su respuesta llegaría después
        // de que el usuario ya haya quitado todos los chips.
        latestRequestId += 1;
        isSearchingTags.value = false;
        tagResults.value = null;
        return;
      }

      // Se marca ya, no dentro de runSearch: entre el clic y el disparo del
      // debounce la grilla sigue mostrando el resultado anterior, y quien
      // pinta el loader necesita cubrir también esa ventana.
      isSearchingTags.value = true;
      debounceTimer = window.setTimeout(
        () => runSearch([...tags]),
        SEARCH_DEBOUNCE_MS,
      );
    },
    { deep: true },
  );

  onBeforeUnmount(() => window.clearTimeout(debounceTimer));

  return {
    selectedTags,
    tagResults,
    isSearchingTags,
    toggleTag,
    clearTags,
  };
}
