// composables/canvas/useDetectionAreas.js
import { computed } from "vue";

const originalWidth = 1600;

export function useDetectionAreas(photoRef) {
  const scale = computed(() =>
    photoRef.value?.config?.width
      ? photoRef.value.config.width / originalWidth
      : 0
  );

  const sortedDetectionAreas = computed(() => {
    const areas = photoRef.value?.detectionAreas || [];
    return [...areas].sort((a, b) => {
      const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
      const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
      return areaB - areaA;
    });
  });

  const toggleSelected = (detection) => {
    detection.selected = !detection.selected;
  };

  const resetSelectedAreas = () => {
    const areas = photoRef.value?.detectionAreas || [];
    areas.forEach((area) => {
      area.selected = false;
    });
  };

  return {
    scale,
    sortedDetectionAreas,
    toggleSelected,
    resetSelectedAreas,
  };
}
