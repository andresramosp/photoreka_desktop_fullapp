import { computed, ref, watch } from "vue";
import { getQuickSearchStorageKey } from "@/config/quickSearch.js";

const CONFIG_VERSION = 1;

/**
 * Configuración de la barra de quick search, persistida en localStorage por
 * usuario (mismo patrón que el canvas o el límite de fotos del atlas 3D).
 *
 * `genres`/`tags`/`noteTags` en `null` significan "automático": los chips se
 * calculan a partir del catálogo (top N). En cuanto el usuario elige a mano, la
 * lista se congela y sobreescribe ese cálculo.
 *
 * `noteTags` va aparte de `tags` porque son un carril propio de la barra: se
 * eligen por otro criterio (vienen de las notas, no de la frecuencia) y se
 * pintan en su propio segmento, así que su selección y su interruptor no pueden
 * compartirse con los frecuentes.
 *
 * Ambas listas guardan `{ name, group }` y no solo el nombre: el grupo es lo que
 * decide el icono del chip, y un tag elegido por el buscador puede no estar
 * entre los que devuelve /api/tags/top.
 */
export function createDefaultQuickSearchConfig() {
  return {
    version: CONFIG_VERSION,
    showGenres: true,
    genres: null,
    showTags: true,
    tags: null,
    showNoteTags: true,
    noteTags: null,
  };
}

const normalize = (raw) => {
  const defaults = createDefaultQuickSearchConfig();
  if (!raw || typeof raw !== "object") return defaults;

  const genres = Array.isArray(raw.genres)
    ? raw.genres.map((g) => String(g)).filter(Boolean)
    : null;

  // Las configs guardadas antes de que existiera el carril de notas no traen
  // estos campos: sin ellos se cae en el automático, que es el comportamiento
  // que estrenan sin tener que tocar nada.
  const normalizeTagList = (list) =>
    Array.isArray(list)
      ? list
          .map((tag) =>
            typeof tag === "string"
              ? { name: tag, group: null }
              : { name: String(tag?.name ?? ""), group: tag?.group ?? null },
          )
          .filter((tag) => tag.name)
      : null;

  return {
    version: CONFIG_VERSION,
    showGenres: raw.showGenres !== false,
    genres,
    showTags: raw.showTags !== false,
    tags: normalizeTagList(raw.tags),
    showNoteTags: raw.showNoteTags !== false,
    noteTags: normalizeTagList(raw.noteTags),
  };
};

/**
 * @param {() => (string|number|null|undefined)} getUserId
 */
export function useQuickSearchConfig(getUserId) {
  const storageKey = computed(() => getQuickSearchStorageKey(getUserId()));
  const config = ref(createDefaultQuickSearchConfig());

  const load = () => {
    try {
      const raw = window.localStorage.getItem(storageKey.value);
      config.value = normalize(raw ? JSON.parse(raw) : null);
    } catch (error) {
      console.error("[quickSearch] config load error:", error);
      config.value = createDefaultQuickSearchConfig();
    }
  };

  const persist = () => {
    try {
      window.localStorage.setItem(
        storageKey.value,
        JSON.stringify(config.value),
      );
    } catch (error) {
      console.error("[quickSearch] config save error:", error);
    }
  };

  const save = (partial) => {
    config.value = normalize({ ...config.value, ...partial });
    persist();
  };

  const reset = () => {
    config.value = createDefaultQuickSearchConfig();
    try {
      window.localStorage.removeItem(storageKey.value);
    } catch (error) {
      console.error("[quickSearch] config reset error:", error);
    }
  };

  // El usuario puede no estar cargado en el primer render; al llegar su id la
  // clave cambia y hay que releer, o se quedaría con la config de "anon".
  watch(storageKey, load, { immediate: true });

  return { config, save, reset, reload: load };
}
