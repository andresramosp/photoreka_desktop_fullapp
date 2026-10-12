import { ref, computed, watch, nextTick, unref } from "vue";

/**
 * Paginación incremental con scroll infinito para una grilla de fotos que se
 * desplaza sobre sí misma (el propio contenedor de la grilla es el scroller).
 *
 * Montar de golpe miles de PhotoCard tarda muchísimo o agota la memoria en
 * dispositivos modestos: aunque `content-visibility` ahorre layout y paint, los
 * componentes, sus nodos y sus <img> se crean igualmente. Este composable monta
 * sólo las páginas cargadas y añade la siguiente al acercarse al final del
 * scroll, igual que hace PhotosGrid en las vistas.
 *
 * @param {import('vue').Ref<Array>|(() => Array)} source - lista completa de fotos
 * @param {{ pageSize?: number, threshold?: number }} [options]
 */
export function usePaginatedPhotoGrid(source, options = {}) {
  const pageSize = options.pageSize ?? 50;
  // px desde el final del scroll a los que se pide la página siguiente
  const threshold = options.threshold ?? 600;

  // Se enlaza al elemento de la grilla con `ref="..."` en el template.
  const containerRef = ref(null);
  const page = ref(1);
  const isLoadingMore = ref(false);

  const allPhotos = computed(() => {
    const list = typeof source === "function" ? source() : unref(source);
    return list ?? [];
  });

  const visiblePhotos = computed(() =>
    allPhotos.value.slice(0, page.value * pageSize),
  );

  const hasMore = computed(
    () => visiblePhotos.value.length < allPhotos.value.length,
  );

  function loadMore() {
    if (isLoadingMore.value || !hasMore.value) return;
    isLoadingMore.value = true;
    page.value += 1;
    nextTick(() => {
      isLoadingMore.value = false;
      fillViewport();
    });
  }

  /**
   * Si la primera página no llega a desbordar el contenedor no habría scroll y
   * el resto de fotos quedarían inalcanzables. `clientHeight === 0` significa
   * que la grilla aún no está medida (diálogo cerrado, pestaña oculta): sin esa
   * guarda cargaría el catálogo entero de una vez.
   */
  function fillViewport() {
    const el = containerRef.value;
    if (!el || !hasMore.value || el.clientHeight === 0) return;
    if (el.scrollHeight <= el.clientHeight + threshold) loadMore();
  }

  function onScroll() {
    const el = containerRef.value;
    if (!el || isLoadingMore.value || !hasMore.value) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
      loadMore();
    }
  }

  /** Vuelve a la primera página y al principio del scroll. */
  function reset() {
    page.value = 1;
    nextTick(() => {
      if (containerRef.value) containerRef.value.scrollTop = 0;
      fillViewport();
    });
  }

  // Cualquier cambio del conjunto mostrado (buscar, cambiar de modo, recargar)
  // reinicia la paginación.
  watch(allPhotos, reset);

  return {
    containerRef,
    visiblePhotos,
    hasMore,
    isLoadingMore,
    onScroll,
    fillViewport,
    reset,
  };
}
