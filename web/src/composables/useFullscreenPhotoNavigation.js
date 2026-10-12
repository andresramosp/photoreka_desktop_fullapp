import { ref, computed, watch, onUnmounted } from "vue";

const getPhotoSrc = (photo) =>
  photo?.originalUrl || photo?.url || photo?.thumbnailUrl;

const preloadImage = (photo) => {
  const src = getPhotoSrc(photo);
  if (!src) return;
  const img = new Image();
  img.src = src;
};

/**
 * Shared fullscreen photo viewer logic: open/close state, prev/next
 * navigation, arrow-key/Escape shortcuts, adjacent-image preloading and a
 * loading flag for the currently displayed image.
 *
 * Two usage modes, chosen by whether `onNavigate` is passed:
 *  - Self-contained (photo cards in a grid): pass `photo` + `allPhotos`
 *    getters. The hook tracks which photo is on screen internally, so the
 *    underlying card/grid never needs to know navigation happened.
 *  - Controlled (PhotoInfoDialog): also pass `currentIndex` + `onNavigate`.
 *    The caller owns the current index (it keeps `selectedPhoto` in sync
 *    with `currentPhotoIndex`), and the hook calls `onNavigate(index)`
 *    instead of tracking its own photo.
 */
export function useFullscreenPhotoNavigation({
  photo,
  allPhotos,
  currentIndex,
  onNavigate,
} = {}) {
  const isControlled = typeof onNavigate === "function";

  const showFullscreenPhoto = ref(false);
  const internalPhoto = ref(null);
  const isImageLoading = ref(true);

  const fullscreenPhoto = isControlled
    ? computed(() => photo?.())
    : internalPhoto;

  const list = () => allPhotos?.() ?? [];

  const fullscreenIndex = computed(() => {
    if (isControlled) return currentIndex?.() ?? -1;
    const current = internalPhoto.value;
    const items = list();
    if (!items.length || !current) return -1;
    return items.findIndex((p) => p.id === current.id);
  });

  const canNavigate = computed(() => list().length > 1);
  const hasPrevious = computed(() => fullscreenIndex.value > 0);
  const hasNext = computed(
    () =>
      fullscreenIndex.value >= 0 &&
      fullscreenIndex.value < list().length - 1,
  );

  const preloadAdjacent = () => {
    const items = list();
    const index = fullscreenIndex.value;
    if (hasPrevious.value) preloadImage(items[index - 1]);
    if (hasNext.value) preloadImage(items[index + 1]);
  };

  const openFullscreen = () => {
    if (!isControlled) internalPhoto.value = photo?.();
    showFullscreenPhoto.value = true;
  };

  const closeFullscreen = () => {
    showFullscreenPhoto.value = false;
  };

  const goToPrevious = () => {
    if (!hasPrevious.value) return;
    const targetIndex = fullscreenIndex.value - 1;
    if (isControlled) {
      onNavigate(targetIndex);
    } else {
      internalPhoto.value = list()[targetIndex];
    }
  };

  const goToNext = () => {
    if (!hasNext.value) return;
    const targetIndex = fullscreenIndex.value + 1;
    if (isControlled) {
      onNavigate(targetIndex);
    } else {
      internalPhoto.value = list()[targetIndex];
    }
  };

  const onFullscreenImageLoad = () => {
    isImageLoading.value = false;
  };

  const onFullscreenImageError = () => {
    isImageLoading.value = false;
  };

  // Reset the loading flag whenever the displayed photo actually changes,
  // and keep the neighbors warm so Next/Previous rarely hits the network.
  watch(fullscreenPhoto, (newPhoto, oldPhoto) => {
    if (newPhoto?.id === oldPhoto?.id) return;
    isImageLoading.value = true;
    if (showFullscreenPhoto.value) preloadAdjacent();
  });

  const handleKeydown = (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPrevious();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goToNext();
    } else if (event.key === "Escape") {
      closeFullscreen();
    }
  };

  // El listener global sólo existe mientras el visor está abierto. Registrarlo
  // en onMounted hacía que una grilla de N fotos dejara N listeners de keydown
  // en window, de modo que cada tecla (p. ej. escribir en un buscador)
  // ejecutaba N handlers.
  let keydownAttached = false;

  const attachKeydown = () => {
    if (keydownAttached) return;
    window.addEventListener("keydown", handleKeydown);
    keydownAttached = true;
  };

  const detachKeydown = () => {
    if (!keydownAttached) return;
    window.removeEventListener("keydown", handleKeydown);
    keydownAttached = false;
  };

  watch(showFullscreenPhoto, (isOpen) => {
    if (isOpen) {
      attachKeydown();
      preloadAdjacent();
    } else {
      detachKeydown();
    }
  });

  onUnmounted(detachKeydown);

  return {
    showFullscreenPhoto,
    fullscreenPhoto,
    isImageLoading,
    canNavigate,
    hasPrevious,
    hasNext,
    openFullscreen,
    closeFullscreen,
    goToPrevious,
    goToNext,
    onFullscreenImageLoad,
    onFullscreenImageError,
  };
}
