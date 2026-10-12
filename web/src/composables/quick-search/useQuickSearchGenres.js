import { computed } from "vue";
import {
  VISUAL_ASPECTS_MAP,
  getAspectValuesForProfile,
} from "@/config/photo_schema";
import {
  DEFAULT_GENRE_COUNT,
  formatChipLabel,
  getGenreIcon,
} from "@/config/quickSearch.js";

/**
 * Chips de género. Todo se resuelve en el front: `visual_aspects.genre` ya
 * viaja en cada foto del workspace.
 *
 * @param {Object}   options
 * @param {() => Array}  options.photos   fotos procesadas del catálogo
 * @param {() => string} options.profile  perfil del usuario (acota los valores)
 * @param {import("vue").Ref} options.config  config de la barra
 */
export function useQuickSearchGenres({ photos, profile, config }) {
  // Un perfil commercial no debe ver "street": la lista válida sale del schema.
  const allowedGenres = computed(() =>
    getAspectValuesForProfile(VISUAL_ASPECTS_MAP.genre, profile()),
  );

  /** genre → nº de fotos del catálogo que lo llevan. */
  const genreCounts = computed(() => {
    const counts = new Map(allowedGenres.value.map((genre) => [genre, 0]));

    for (const photo of photos() ?? []) {
      const genres = photo?.descriptions?.visual_aspects?.genre;
      if (!genres) continue;
      // El aspecto es multivalor, pero alguna foto antigua guarda un string.
      for (const genre of Array.isArray(genres) ? genres : [genres]) {
        if (!counts.has(genre)) continue;
        counts.set(genre, counts.get(genre) + 1);
      }
    }

    return counts;
  });

  const toChip = (genre) => ({
    key: `genre:${genre}`,
    value: genre,
    label: formatChipLabel(genre),
    icon: getGenreIcon(genre),
    count: genreCounts.value.get(genre) ?? 0,
  });

  /** Todos los géneros del perfil ordenados por presencia — para el modal. */
  const availableGenres = computed(() =>
    allowedGenres.value
      .map(toChip)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  );

  /** Los que se pintan en la barra: elección del usuario o top por defecto. */
  const genreChips = computed(() => {
    if (!config.value.showGenres) return [];

    const chosen = config.value.genres;
    if (Array.isArray(chosen)) {
      // Un género guardado bajo otro perfil deja de ser válido: se descarta.
      const allowed = new Set(allowedGenres.value);
      return chosen.filter((genre) => allowed.has(genre)).map(toChip);
    }

    return availableGenres.value
      .filter((chip) => chip.count > 0)
      .slice(0, DEFAULT_GENRE_COUNT);
  });

  return { genreChips, availableGenres };
}
