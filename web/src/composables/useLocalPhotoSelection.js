// composables/useLocalPhotoSelection.js
import { ref, computed } from "vue";

export function useLocalPhotoSelection() {
  const selectedPhotosRecord = ref({});

  const selectedPhotoIds = computed(() =>
    Object.keys(selectedPhotosRecord.value)
      .filter((photoId) => !!selectedPhotosRecord.value[photoId])
      .map(Number)
  );

  // True once at least one photo is selected — cards use this to switch a
  // plain click from "open info" to "toggle selection".
  const isSelectionMode = computed(() => selectedPhotoIds.value.length > 0);

  const togglePhotoSelection = (photoId) => {
    selectedPhotosRecord.value[photoId] = !selectedPhotosRecord.value[photoId];
  };

  const selectAllPhotos = (photoIds) => {
    photoIds.forEach((photoId) => {
      selectedPhotosRecord.value[photoId] = true;
    });
  };

  const deselectAllPhotos = (photoIds) => {
    photoIds.forEach((photoId) => {
      selectedPhotosRecord.value[photoId] = false;
    });
  };

  const clearAllSelections = () => {
    selectedPhotosRecord.value = {};
  };

  return {
    selectedPhotosRecord,
    selectedPhotoIds,
    isSelectionMode,
    togglePhotoSelection,
    selectAllPhotos,
    deselectAllPhotos,
    clearAllSelections,
  };
}
