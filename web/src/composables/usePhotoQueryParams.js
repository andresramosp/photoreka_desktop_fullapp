// Composable reutilizable para cargar fotos desde query params
// Sigue el mismo patrón que PhotosDialog: retorna photoIds para usar con handleAddPhotos
import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePhotosStore } from "@/stores/photos";

export function usePhotoQueryParams() {
  const route = useRoute();
  const router = useRouter();
  const photosStore = usePhotosStore();

  /**
   * Verifica si hay query params de fotos en la URL
   */
  const hasPhotoQueryParams = () => {
    return !!(route.query.source && route.query.ids);
  };

  /**
   * Parsea los query params de la URL
   * @returns {{ source: string|null, uniqueIds: number[] }}
   */
  const parseQueryParams = () => {
    const { source, ids } = route.query;

    if (!source || !ids) {
      return { source: null, uniqueIds: [] };
    }

    const uniqueIds = ids
      .split(",")
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));

    return { source, uniqueIds };
  };

  /**
   * Mapea uniqueIds externos (ej: Lightroom) a photo.id internos
   * @param {string} source - Tipo de fuente ('lightroom', 'google', etc.)
   * @param {number[]} uniqueIds - Array de IDs únicos de la fuente externa
   * @returns {number[]} - Array de photo.id internos encontrados
   */
  const mapExternalIdsToPhotoIds = (source, uniqueIds) => {
    const photos = photosStore.photos;

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return [];
    }

    const photoIds = [];

    for (const uniqueId of uniqueIds) {
      const photo = photos.find(
        (p) =>
          p.descriptions?.source?.type === source &&
          p.descriptions?.source?.uniqueId === uniqueId
      );

      if (photo) {
        photoIds.push(photo.id);
      } else {
        console.warn(
          `[usePhotoQueryParams] Photo not found: ${source}:${uniqueId}`
        );
      }
    }

    return photoIds;
  };

  /**
   * Limpia los query params de la URL sin recargar la página
   */
  const clearQueryParams = () => {
    const newQuery = { ...route.query };
    delete newQuery.source;
    delete newQuery.ids;
    router.replace({ query: newQuery });
  };

  /**
   * Obtiene los photoIds desde query params.
   * Retorna los IDs internos listos para usar con handleAddPhotos(photoIds).
   *
   * Si el store no está listo, configura un watch y llama al callback cuando lo esté.
   *
   * @param {Object} options
   * @param {Function} options.onReady - Callback con (photoIds) cuando los IDs estén listos
   * @param {boolean} options.clearAfterLoad - Limpiar query params después (default: true)
   * @returns {number[]} - photoIds si el store está listo, [] si está pendiente
   */
  const getPhotoIdsFromQuery = ({ onReady, clearAfterLoad = true } = {}) => {
    // Si no hay query params, no hacer nada
    if (!hasPhotoQueryParams()) {
      return [];
    }

    const { source, uniqueIds } = parseQueryParams();

    if (uniqueIds.length === 0) {
      return [];
    }

    // Intentar mapear ahora
    const photoIds = mapExternalIdsToPhotoIds(source, uniqueIds);

    if (photoIds.length > 0) {
      // Store está listo, tenemos los IDs
      console.log(
        `📸 [QueryParams] Mapped ${uniqueIds.length} ${source} IDs → ${photoIds.length} photoIds`
      );

      if (clearAfterLoad) {
        clearQueryParams();
      }

      return photoIds;
    }

    // Store no está listo - configurar watch para cuando se cargue
    if (onReady && typeof onReady === "function") {
      console.log(
        `⏳ [QueryParams] Store not ready, waiting for photos to load...`
      );

      const stopWatch = watch(
        () => photosStore.photos,
        (newPhotos) => {
          if (newPhotos && Array.isArray(newPhotos) && newPhotos.length > 0) {
            const photoIds = mapExternalIdsToPhotoIds(source, uniqueIds);

            if (photoIds.length > 0) {
              console.log(
                `📸 [QueryParams] Store ready! Mapped ${uniqueIds.length} ${source} IDs → ${photoIds.length} photoIds`
              );

              if (clearAfterLoad) {
                clearQueryParams();
              }

              // Llamar callback con los photoIds
              onReady(photoIds);
            }

            // Detener el watch después de procesar
            stopWatch();
          }
        },
        { immediate: false }
      );
    }

    return [];
  };

  return {
    hasPhotoQueryParams,
    getPhotoIdsFromQuery,
    clearQueryParams,
  };
}
