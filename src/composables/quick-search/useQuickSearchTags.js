import { isDemoEmail } from "@/config/demoUsers";
import { computed, ref } from "vue";
import { api } from "@/utils/axios";
import { useUserStore } from "@/stores/userStore";
import {
  DEFAULT_TAG_COUNT,
  TOP_TAGS_FETCH_LIMIT,
  formatChipLabel,
  getQuickSearchTagGroups,
  getTagIcon,
} from "@/config/quickSearch.js";

/**
 * Reparto de los chips automáticos: una vuelta completa por grupos antes de
 * repetir ninguno, para que la barra no se llene con la familia más numerosa
 * (ocho "person" y nada más). Los chips llegan ya ordenados por frecuencia, así
 * que dentro de cada grupo se respeta ese orden y los grupos se recorren
 * empezando por el que trae el tag más frecuente. Solo se repite grupo cuando
 * ya se han visitado todos y aún faltan chips por rellenar.
 */
const pickOnePerGroup = (chips, limit) => {
  const queuesByGroup = new Map();
  for (const chip of chips) {
    const group = chip.group ?? "";
    if (!queuesByGroup.has(group)) queuesByGroup.set(group, []);
    queuesByGroup.get(group).push(chip);
  }

  const queues = [...queuesByGroup.values()];
  const picked = [];
  while (picked.length < limit) {
    let addedInThisRound = false;
    for (const queue of queues) {
      if (!queue.length) continue;
      picked.push(queue.shift());
      addedInThisRound = true;
      if (picked.length === limit) break;
    }
    // No quedan tags en ningún grupo: hay menos candidatos que huecos.
    if (!addedInThisRound) break;
  }
  return picked;
};

/**
 * Chips de tag. Los tags no viajan en el objeto foto del workspace, así que el
 * ranking lo da el backend (GET /api/tags/top), acotado a
 * QUICK_SEARCH_TAG_GROUPS y contando solo fotos procesadas.
 *
 * @param {Object} options
 * @param {import("vue").Ref} options.config config de la barra
 */
export function useQuickSearchTags({ config }) {
  const userStore = useUserStore();
  const topTags = ref([]);
  const totalPhotos = ref(0);
  const isLoading = ref(false);
  const hasLoaded = ref(false);

  const tagGroups = computed(() =>
    getQuickSearchTagGroups(isDemoEmail(userStore.user?.email)),
  );

  const load = async () => {
    if (isLoading.value) return;
    isLoading.value = true;
    try {
      const { data } = await api.get("/api/tags/top", {
        params: {
          groups: tagGroups.value.join(","),
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

    return pickOnePerGroup(availableTags.value, DEFAULT_TAG_COUNT);
  });

  return { tagChips, availableTags, totalPhotos, isLoading, hasLoaded, load };
}
