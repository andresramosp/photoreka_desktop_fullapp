import { isDemoEmail } from "@/config/demoUsers";
import { computed, ref } from "vue";
import { api } from "@/utils/axios";
import { useUserStore } from "@/stores/userStore";
import {
  DEFAULT_NOTE_TAG_COUNT,
  DEFAULT_TAG_COUNT,
  NOTE_TAGS_CATEGORY,
  NOTE_TAGS_FETCH_LIMIT,
  TOP_TAGS_FETCH_LIMIT,
  formatChipLabel,
  getNoteTagGroups,
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
 * Se piden en dos tandas. La segunda son los tags de nota personal, acotados
 * por categoría en vez de por frecuencia: cada uno vive en una o dos fotos, así
 * que compitiendo por conteo nunca aparecerían, y son los que más se busca por
 * ellos ("my wife", "our first flat"). Van delante en los chips automáticos y
 * tienen su propia sección en el modal de configuración.
 *
 * @param {Object} options
 * @param {import("vue").Ref} options.config config de la barra
 */
export function useQuickSearchTags({ config }) {
  const userStore = useUserStore();
  const topTags = ref([]);
  const noteTags = ref([]);
  const totalPhotos = ref(0);
  const isLoading = ref(false);
  const hasLoaded = ref(false);

  const tagGroups = computed(() =>
    getQuickSearchTagGroups(isDemoEmail(userStore.user?.email)),
  );

  const noteGroups = computed(() =>
    getNoteTagGroups(isDemoEmail(userStore.user?.email)),
  );

  const load = async () => {
    if (isLoading.value) return;
    isLoading.value = true;
    try {
      const [frequent, fromNotes] = await Promise.all([
        api.get("/api/tags/top", {
          params: {
            groups: tagGroups.value.join(","),
            limit: TOP_TAGS_FETCH_LIMIT,
          },
        }),
        api.get("/api/tags/top", {
          params: {
            groups: noteGroups.value.join(","),
            categories: NOTE_TAGS_CATEGORY,
            limit: NOTE_TAGS_FETCH_LIMIT,
          },
        }),
      ]);

      topTags.value = frequent.data?.result?.tags ?? [];
      noteTags.value = fromNotes.data?.result?.tags ?? [];
      totalPhotos.value = frequent.data?.result?.totalPhotos ?? 0;
      hasLoaded.value = true;
    } catch (error) {
      console.error("[quickSearch] top tags load error:", error);
      topTags.value = [];
      noteTags.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  const toChip = (tag, fromNotes = false) => ({
    key: `tag:${tag.name}`,
    value: tag.name,
    label: formatChipLabel(tag.name),
    icon: getTagIcon(tag.group),
    group: tag.group ?? null,
    count: tag.photoCount ?? null,
    fromNotes,
  });

  /** Nombres que vienen de una nota, para marcar el chip lo pida quien lo pida. */
  const noteTagNames = computed(
    () => new Set(noteTags.value.map((tag) => tag.name)),
  );

  /** Candidatos que el modal ofrece sin tener que buscar. */
  const availableTags = computed(() =>
    topTags.value.map((tag) => toChip(tag, noteTagNames.value.has(tag.name))),
  );

  /** Los mismos candidatos, pero solo los que salen de las notas. */
  const availableNoteTags = computed(() =>
    noteTags.value.map((tag) => toChip(tag, true)),
  );

  /** Conteo y grupo de todo lo traído, para resolver un nombre suelto. */
  const knownByName = computed(
    () =>
      new Map([...topTags.value, ...noteTags.value].map((tag) => [tag.name, tag])),
  );

  // Un tag elegido a mano puede no estar en ninguna de las dos listas (viene del
  // buscador general): se pinta igual, sin cifra en el tooltip.
  const chosenToChips = (chosen, fromNotes) =>
    chosen.map((tag) =>
      toChip(
        knownByName.value.get(tag.name) ?? { name: tag.name, group: tag.group },
        fromNotes,
      ),
    );

  /**
   * Carril propio de tags personales, no una reserva dentro de los frecuentes:
   * se eligen por otro criterio, se configuran aparte y se pintan en su propio
   * segmento de la barra. En automático salen los que más fotos tocan, que es lo
   * más parecido a "los que más usas" cuando cada uno vive en una o dos.
   */
  const noteTagChips = computed(() => {
    if (!config.value.showNoteTags) return [];

    const chosen = config.value.noteTags;
    if (Array.isArray(chosen)) return chosenToChips(chosen, true);

    return availableNoteTags.value.slice(0, DEFAULT_NOTE_TAG_COUNT);
  });

  const tagChips = computed(() => {
    if (!config.value.showTags) return [];

    const chosen = config.value.tags;
    if (Array.isArray(chosen)) {
      return chosenToChips(chosen, false).map((chip) => ({
        ...chip,
        fromNotes: noteTagNames.value.has(chip.value),
      }));
    }

    // Lo que ya tiene sitio en el carril personal no se repite aquí: el mismo
    // pill dos veces en la misma fila se lee como dos tags distintos.
    const inNoteLane = new Set(noteTagChips.value.map((chip) => chip.value));
    return pickOnePerGroup(
      availableTags.value.filter((chip) => !inNoteLane.has(chip.value)),
      DEFAULT_TAG_COUNT,
    );
  });

  return {
    tagChips,
    noteTagChips,
    availableTags,
    availableNoteTags,
    totalPhotos,
    isLoading,
    hasLoaded,
    load,
  };
}
