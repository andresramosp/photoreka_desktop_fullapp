import { computed } from "vue";
import { usePhotosStore } from "@/stores/photos.js";

export const MAX_CATALOG_PHOTOS = 100_000;
export const CATALOG_LIMIT_CONTACT_EMAIL = "hello@photoreka.com";

export function useCatalogLimit() {
  const photosStore = usePhotosStore();

  // Photos still being analyzed already consumed quota, so they count too.
  const analyzedCount = computed(() => photosStore.workspacePhotos.length);

  const exceedsLimitWith = (extraPhotos: number) =>
    analyzedCount.value + extraPhotos > MAX_CATALOG_PHOTOS;

  return { analyzedCount, exceedsLimitWith };
}
