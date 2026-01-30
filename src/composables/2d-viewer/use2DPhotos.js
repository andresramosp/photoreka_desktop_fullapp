// composables/2d-viewer/use2DPhotos.js
import { ref, computed } from "vue";
import { api } from "@/utils/axios";
import gridRelaxation from "@/utils/gridRelaxation";

// Easy global toggle (edit this constant when you want a default behavior change)
const GRID_RELAXATION_ENABLED_DEFAULT = true;

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

  // Toggle: if false, photos keep backend coordinates (no relaxation)
  const gridRelaxationEnabled = ref(GRID_RELAXATION_ENABLED_DEFAULT);

  // Always 2D output
  const outputDims = 2;

  // Spacing model (world units). Photos2D maps coords to canvas with SCALE_FACTOR=50
  // and uses a default sprite width of ~80px => ~1.6 world units.
  // Keep this here (not in the component) so the relaxation remains UI-agnostic.
  const RELAX_BASE_SIZE = 1.65;
  const RELAX_PADDING = 0.12;

  const to2D = (pos) => {
    const p = Array.isArray(pos) ? pos : [];
    return [p[0] || 0, p[1] || 0];
  };

  const applyLayout = (photos) => {
    const base = (photos || []).map((p) => {
      const raw = to2D(p?.rawCoordinates || p?.coordinates || p?.position);
      return {
        ...p,
        rawCoordinates: to2D(p?.rawCoordinates || raw),
        position: raw,
        coordinates: raw,
      };
    });

    if (!gridRelaxationEnabled.value) return base;

    const relaxed = gridRelaxation(base, {
      dims: 2,
      baseSize: RELAX_BASE_SIZE,
      padding: RELAX_PADDING,
      // 2D should look grid-like
      snapToGrid: true,
      gridSize: RELAX_BASE_SIZE + RELAX_PADDING,
    });

    return base.map((p, idx) => {
      const pos = relaxed[idx] || p.position || [0, 0];
      return {
        ...p,
        position: [pos[0] || 0, pos[1] || 0],
        coordinates: [pos[0] || 0, pos[1] || 0],
      };
    });
  };

  const reapplyLayout = () => {
    if (!photos2D.value.length) return;
    photos2D.value = applyLayout(photos2D.value);
  };

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
          coordsMap.set(photo.id, [coords[0] || 0, coords[1] || 0]);
        });

        const updatedPhotos = photos2D.value.map((existingPhoto) => {
          const newCoords = coordsMap.get(existingPhoto.id);
          if (!newCoords) return existingPhoto;
          return {
            ...existingPhoto,
            rawCoordinates: newCoords,
          };
        });

        photos2D.value = applyLayout(updatedPhotos);
      } else {
        // Normal mode: replace all photos
        const processedPhotos = workingPhotos.map((photo) => {
          const coords = photo.coordinates || photo.position || [0, 0];
          const position2D = [coords[0] || 0, coords[1] || 0];

          return {
            ...photo,
            position: position2D,
            coordinates: position2D,
            rawCoordinates: position2D,
          };
        });

        const laidOut = applyLayout(processedPhotos);

        console.log(`📸 Loaded ${laidOut.length} photos in 2D`);
        photos2D.value = laidOut;
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
    gridRelaxationEnabled,

    // Computed
    getBounds,

    // Options
    chunkOptions,

    // Methods
    loadAllPhotos,
    changeChunk,
    reapplyLayout,
    reset,
  };
}
