import { ref } from "vue";
import { api } from "@/utils/axios";

export function useSearchTags() {
  const includedTags = ref([]);
  const excludedTags = ref([]);
  const includedTagSuggestions = ref([]);
  const excludedTagSuggestions = ref([]);
  const searchInputIncluded = ref("");
  const searchInputExcluded = ref("");

  let debounceIncluded = null;
  let debounceExcluded = null;

  async function fetchTagSuggestions(query) {
    try {
      const response = await api.get("/api/tags/search", {
        params: { term: query },
      });
      // Return full tag objects and deduplicate by id
      const tags = response.data.result;
      const uniqueTags = new Map();
      tags.forEach((tag) => {
        if (!uniqueTags.has(tag.id)) {
          uniqueTags.set(tag.id, {
            label: tag.name,
            value: tag.name, // Keep name as value for search compatibility
            id: tag.id,
            // El grupo decide el icono en la barra de quick search; el resto de
            // consumidores lo ignoran.
            group: tag.group ?? null,
          });
        }
      });
      return Array.from(uniqueTags.values());
    } catch (error) {
      console.error("Error fetching tag suggestions", error);
      return [];
    }
  }

  async function onSearchInputIncluded(val) {
    searchInputIncluded.value = val;
    if (debounceIncluded) clearTimeout(debounceIncluded);
    if (val.trim().length < 2) {
      includedTagSuggestions.value = [];
      return;
    }
    // Clear previous suggestions immediately to avoid duplicates
    includedTagSuggestions.value = [];
    debounceIncluded = setTimeout(async () => {
      const newSuggestions = await fetchTagSuggestions(val);
      // Only update if this is still the latest search
      if (searchInputIncluded.value === val) {
        includedTagSuggestions.value = newSuggestions;
      }
    }, 500);
  }

  async function onSearchInputExcluded(val) {
    searchInputExcluded.value = val;
    if (debounceExcluded) clearTimeout(debounceExcluded);
    if (val.trim().length < 2) {
      excludedTagSuggestions.value = [];
      return;
    }
    // Clear previous suggestions immediately to avoid duplicates
    excludedTagSuggestions.value = [];
    debounceExcluded = setTimeout(async () => {
      const newSuggestions = await fetchTagSuggestions(val);
      // Only update if this is still the latest search
      if (searchInputExcluded.value === val) {
        excludedTagSuggestions.value = newSuggestions;
      }
    }, 300);
  }

  return {
    includedTags,
    excludedTags,
    includedTagSuggestions,
    excludedTagSuggestions,
    searchInputIncluded,
    searchInputExcluded,
    onSearchInputIncluded,
    onSearchInputExcluded,
  };
}
