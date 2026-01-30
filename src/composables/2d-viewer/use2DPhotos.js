// composables/2d-viewer/use2DPhotos.js
import { ref, computed } from "vue";
import { api } from "@/utils/axios";

/**
 * Composable for managing 2D photo data and positions
 * Similar to use3DPhotos but always uses outputDims=2
 *
 * @param {string|null} userId - Optional user ID for catalog mode
 * @param {boolean} lowPerformanceMode - If true, limits photos to 750
 */
export function use2DPhotos(userId = null, lowPerformanceMode = false) {
  // Reactive state
  const photos2D = ref([]);
  const isLoadingPositions = ref(false);
  const currentChunk = ref("general");
  const error = ref(null);
  const isCatalogMode = Boolean(userId);
  const lowPerformance = ref(lowPerformanceMode);

  // Always 2D output
  const outputDims = 2;

  // Available chunk options (excluding 3D-only options)
  const chunkOptions = [
    { value: "general", label: "General" },
    { value: "story", label: "Narrative" },
    { value: "context", label: "Cultural context" },
    { value: "visual_accents", label: "Visual accents" },
    { value: "color_histogram", label: "Chromatic" },
    { value: "color_histogram_dominant", label: "Dominant color" },
    // Include these only for authenticated users
    ...(!userId ? [{ value: "visual_aspects", label: "Technical" }] : []),
  ];

  /**
   * Load photos from API with 2D coordinates
   */
  const loadPhotos = async (chunkName) => {
    try {
      let response;

      if (isCatalogMode) {
        // Public catalog mode: non-secured endpoint
        response = await api.post(`/api/3d/catalog/${userId}`, {
          chunkName,
          includeVisualAspects: true,
          outputDims: outputDims, // Always 2D
        });
      } else {
        // Normal authenticated mode
        response = await api.post("/api/3d/photos", {
          chunkName,
          includeVisualAspects: true,
          outputDims: outputDims, // Always 2D
        });
      }

      return response.data.photos || [];
    } catch (err) {
      console.error(`Error loading 2D photos:`, err);
      throw new Error(`Error loading photos: ${err.message}`);
    }
  };

  /**
   * Main function to load all photos
   */
  const loadAllPhotos = async (chunkName, reuseExisting = false) => {
    currentChunk.value = chunkName;
    isLoadingPositions.value = true;
    error.value = null;

    try {
      const photos = await loadPhotos(chunkName);

      // Check if photos array is empty
      if (!photos || photos.length === 0) {
        console.warn("⚠️ No photos received from API");
        error.value = "Your catalog doesn't have enough photos to be processed";
        photos2D.value = [];
        isLoadingPositions.value = false;
        return;
      }

      // Filter for low performance mode
      let workingPhotos = photos;
      if (lowPerformance.value && photos.length > 750) {
        const getScore = (p) =>
          p?.descriptions?.artistic_scores?.aesthetic_quality ?? -Infinity;
        workingPhotos = [...photos]
          .sort((a, b) => getScore(b) - getScore(a))
          .slice(0, 750);
        console.log(
          `⚡ LowPerformance active: filtered ${photos.length} -> ${workingPhotos.length} (top aesthetic_quality)`,
        );
      }

      // Process photos with 2D coordinates
      if (reuseExisting && photos2D.value.length > 0) {
        // Reuse mode: update only coordinates of existing photos
        console.log(
          `♻️ Updating coordinates of ${workingPhotos.length} existing photos`,
        );

        const coordsMap = new Map();
        workingPhotos.forEach((photo) => {
          const coords = photo.coordinates || photo.position || [0, 0];
          // Ensure we have 2D coordinates
          coordsMap.set(photo.id, [coords[0] || 0, coords[1] || 0]);
        });

        photos2D.value = photos2D.value.map((existingPhoto) => {
          const newCoords = coordsMap.get(existingPhoto.id);
          if (newCoords) {
            return {
              ...existingPhoto,
              position: newCoords,
              coordinates: newCoords,
            };
          }
          return existingPhoto;
        });
      } else {
        // Normal mode: replace all photos
        const processedPhotos = workingPhotos.map((photo) => {
          const coords = photo.coordinates || photo.position || [0, 0];
          const position2D = [coords[0] || 0, coords[1] || 0];

          return {
            ...photo,
            position: position2D,
            coordinates: position2D,
            rawCoordinates: photo.coordinates || [0, 0],
          };
        });

        console.log(`📸 Loaded ${processedPhotos.length} photos in 2D`);
        photos2D.value = processedPhotos;
      }

      console.log(`Load complete: ${photos2D.value.length} photos`);
    } catch (err) {
      error.value = err.message;
      console.error("Error in loadAllPhotos:", err);
    } finally {
      isLoadingPositions.value = false;
    }
  };

  /**
   * Change clustering type
   */
  const changeChunk = async (newChunk) => {
    console.log("🔄 changeChunk called:", {
      newChunk,
      currentChunk: currentChunk.value,
      hasExistingPhotos: photos2D.value.length > 0,
      willSkip: newChunk === currentChunk.value,
    });

    // Skip if same value and already have photos loaded
    if (newChunk === currentChunk.value && photos2D.value.length > 0) {
      console.log(
        "⏸️ Skipping chunk change - same value and data already loaded",
      );
      return;
    }

    const shouldReuseExisting = photos2D.value.length > 0;

    console.log("🚀 Executing loadAllPhotos for chunk:", newChunk, {
      reuseExisting: shouldReuseExisting,
    });

    await loadAllPhotos(newChunk, shouldReuseExisting);
    console.log("✅ changeChunk completed for chunk:", newChunk);
  };

  /**
   * Reset state
   */
  const reset = () => {
    photos2D.value = [];
    error.value = null;
  };

  /**
   * Get bounds of all photo positions for viewport calculations
   */
  const getBounds = computed(() => {
    if (photos2D.value.length === 0) {
      return { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    }

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    photos2D.value.forEach((photo) => {
      const [x, y] = photo.position || [0, 0];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    // Add some padding
    const paddingX = (maxX - minX) * 0.1 || 10;
    const paddingY = (maxY - minY) * 0.1 || 10;

    return {
      minX: minX - paddingX,
      maxX: maxX + paddingX,
      minY: minY - paddingY,
      maxY: maxY + paddingY,
    };
  });

  return {
    // State
    photos2D,
    isLoadingPositions,
    currentChunk,
    error,
    isCatalogMode,
    outputDims,

    // Computed
    getBounds,

    // Options
    chunkOptions,

    // Methods
    loadAllPhotos,
    changeChunk,
    reset,
  };
}
