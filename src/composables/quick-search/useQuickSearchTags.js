import { computed, ref } from "vue";
import { api } from "@/utils/axios";
import {
  DEFAULT_TAG_COUNT,
  QUICK_SEARCH_TAG_GROUPS,
  TOP_TAGS_FETCH_LIMIT,
  formatChipLabel,
  getTagIcon,
} from "@/config/quickSearch.js";

/**
 * Chips de tag. Los tags no viajan en el objeto foto del workspace, así que el
 * ranking lo da el backend (GET /api/tags/top), acotado a
 * QUICK_SEARCH_TAG_GROUPS y contando solo fotos procesadas.
 *
 * @param {Object} options
 * @param {import("vue").Ref} options.config config de la barra
 */
export function useQuickSearchTags({ config }) {
  const topTags = ref([]);
  const totalPhotos = ref(0);
  const isLoading = ref(false);
  const hasLoaded = ref(false);

  const load = async () => {
    if (isLoading.value) return;
    isLoading.value = true;
    try {
      const { data } = await api.get("/api/tags/top", {
        params: {
          groups: QUICK_SEARCH_TAG_GROUPS.join(","),
          limit: TOP_TAGS_FETCH_LIMIT,
        },
      });
      topTags.value = data?.result?.tags ?? [];
      totalPhotos.value = data?.result?.totalPhotos ?? 0;
      hasLoaded.value = true;
    } catch (error) {
      console.error("[quickSearch] top tags load error:", error);
      topTags.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  const toChip = (tag) => ({
    key: `tag:${tag.name}`,
    value: tag.name,
    label: formatChipLabel(tag.name),
    icon: getTagIcon(tag.group),
    group: tag.group ?? null,
    count: tag.photoCount ?? null,
  });

  /** Candidatos que el modal ofrece sin tener que buscar. */
  const availableTags = computed(() => topTags.value.map(toChip));

  const tagChips = computed(() => {
    if (!config.value.showTags) return [];

    const chosen = config.value.tags;
    if (Array.isArray(chosen)) {
      // El conteo solo lo conocemos para los que están en el top; un tag
      // elegido por el buscador se pinta igual, sin cifra en el tooltip.
      const known = new Map(topTags.value.map((tag) => [tag.name, tag]));
      return chosen.map((tag) =>
        toChip(known.get(tag.name) ?? { name: tag.name, group: tag.group }),
      );
    }

    return availableTags.value.slice(0, DEFAULT_TAG_COUNT);
  });

  return { tagChips, availableTags, totalPhotos, isLoading, hasLoaded, load };
}
