// composables/2d-viewer/use2DPhotos.js
import { ref, computed } from "vue";
import { api } from "@/utils/axios";
import gridRelaxation from "@/utils/gridRelaxation";

// Easy global toggle (edit this constant when you want a default behavior change)
const GRID_RELAXATION_ENABLED_DEFAULT = true;
const GRID_RELAXATION_EXPAND_STRENGTH_DEFAULT = 0; // 0..1
const GRID_SNAP_TO_GRID_DEFAULT = false;

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

  // Option: snap final positions to unique virtual grid cells.
  // This guarantees no overlaps but can introduce a "grid" aesthetic.
  const gridSnapToGrid = ref(GRID_SNAP_TO_GRID_DEFAULT);

  // Controls how aggressively "expand" separates clustered points (0..1)
  const gridRelaxationExpandStrength = ref(
    GRID_RELAXATION_EXPAND_STRENGTH_DEFAULT,
  );

  // Always 2D output
  const outputDims = 2;

  // Spacing model (world units). Photos2D maps coords to canvas with SCALE_FACTOR=50
  // and uses a default sprite width of ~80px => ~1.6 world units.
  // Keep this here (not in the component) so the relaxation remains UI-agnostic.
  const RELAX_BASE_SIZE = 1.65;
  const RELAX_PADDING = 0.12;

  // Auto-tune: on the very first load, detect heavy crowding and apply a reasonable
  // initial "Balloon expansion" so users don't start with a pile of overlapping photos.
  // This never overrides a non-default user value.
  const AUTO_EXPAND_ENABLED = true;
  const AUTO_EXPAND_TARGET_STRENGTH = 0.2;
  const AUTO_EXPAND_SAMPLE_MAX = 4000;
  const AUTO_EXPAND_VERY_HIGH_COLLISION_RATIO = 0.65;
  const AUTO_EXPAND_VERY_HIGH_MAX_OCC = 12;
  const AUTO_EXPAND_EASE_K = 6.5;

  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

  const easeInExp01 = (t01) => {
    // Smooth "ease-in" curve (gentle early, stronger late).
    // Returns 0..1 with t=1 mapping exactly to 1.
    const t = clamp01(t01);
    const k = Math.max(1e-6, Number(AUTO_EXPAND_EASE_K) || 1);
    const denom = Math.expm1(k);
    if (Math.abs(denom) < 1e-12) return t;
    return Math.expm1(k * t) / denom;
  };

  const computeCosmicScale = (strength01) => {
    // Preserve cluster shapes by scaling all positions around the centroid.
    // Non-linear curve: gentle early, strong late.
    const t = clamp01(strength01);
    const eased = t * t; // quadratic
    return 1 + eased * 30; // up to ~31x
  };

  const to2D = (pos) => {
    const p = Array.isArray(pos) ? pos : [];
    return [p[0] || 0, p[1] || 0];
  };

  const getOverlapMetrics = (photos) => {
    const list = Array.isArray(photos) ? photos : [];
    const n0 = list.length;
    if (n0 < 60) return null;

    // Sample down to keep this O(N) and fast for very large catalogs.
    const step = Math.max(1, Math.floor(n0 / AUTO_EXPAND_SAMPLE_MAX));
    const sample =
      step === 1 ? list : list.filter((_, idx) => idx % step === 0);
    const n = sample.length || 0;
    if (n <= 0) return null;

    // Bucket points into "photo-sized" cells and estimate pile-ups.
    const cellSize = Math.max(0.4, RELAX_BASE_SIZE + RELAX_PADDING);
    const counts = new Map();
    let maxOcc = 1;

    for (const p of sample) {
      const raw = p?.rawCoordinates || p?.coordinates || p?.position;
      const [x, y] = to2D(raw);
      const cx = Math.floor((x || 0) / cellSize);
      const cy = Math.floor((y || 0) / cellSize);
      const key = `${cx},${cy}`;
      const next = (counts.get(key) || 0) + 1;
      counts.set(key, next);
      if (next > maxOcc) maxOcc = next;
    }

    let collidedPoints = 0;
    for (const c of counts.values()) {
      if (c > 1) collidedPoints += c;
    }
    const collisionRatio = collidedPoints / n;

    return {
      collisionRatio: Number.isFinite(collisionRatio) ? collisionRatio : 0,
      maxOcc: Number.isFinite(maxOcc) ? maxOcc : 1,
      sampleSize: n,
    };
  };

  const computeAutoExpandStrength = (photos) => {
    if (!AUTO_EXPAND_ENABLED) return 0;

    const metrics = getOverlapMetrics(photos);
    if (!metrics) return 0;

    const ratioScore = clamp01(
      metrics.collisionRatio / AUTO_EXPAND_VERY_HIGH_COLLISION_RATIO,
    );
    const occDenom = Math.max(1, AUTO_EXPAND_VERY_HIGH_MAX_OCC - 1);
    const occScore = clamp01((metrics.maxOcc - 1) / occDenom);

    // Use whichever indicates stronger crowding.
    const crowdingScore = Math.max(ratioScore, occScore);
    const eased = easeInExp01(crowdingScore);

    return clamp01(eased) * AUTO_EXPAND_TARGET_STRENGTH;
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

    const expand = clamp01(gridRelaxationExpandStrength.value);
    const cosmic = expand > 1e-9;
    const snapToGrid = Boolean(gridSnapToGrid.value);

    // Expand mode works best as a true "universe expansion": scale around centroid,
    // then do a gentle overlap-only relaxation. This avoids the circular "repulsion" look.
    let itemsForLayout = base;
    if (cosmic) {
      const s = computeCosmicScale(expand);
      let cx = 0;
      let cy = 0;
      const n = base.length || 1;
      for (const p of base) {
        const [x, y] = p.position || [0, 0];
        cx += x || 0;
        cy += y || 0;
      }
      cx /= n;
      cy /= n;

      itemsForLayout = base.map((p) => {
        const [x, y] = p.position || [0, 0];
        const sx = cx + ((x || 0) - cx) * s;
        const sy = cy + ((y || 0) - cy) * s;
        return {
          ...p,
          position: [sx, sy],
          coordinates: [sx, sy],
        };
      });
    }

    const shouldRunLayout = gridRelaxationEnabled.value || snapToGrid;
    if (!shouldRunLayout) return itemsForLayout;

    const relaxed = gridRelaxation(itemsForLayout, {
      dims: 2,
      baseSize: RELAX_BASE_SIZE,
      padding: RELAX_PADDING,
      // Use AABB resolution (photos are rectangles). In cosmic mode, this just prevents overlaps.
      resolveMode: "aabb",
      snapToGrid,
      gridSize: snapToGrid ? RELAX_BASE_SIZE + RELAX_PADDING : undefined,
      // Overlap separation is controlled by gridRelaxationEnabled. Snap-to-grid can run alone.
      iterations: gridRelaxationEnabled.value ? (cosmic ? 12 : undefined) : 0,
      repelStrength: 0,
      maxStep: gridRelaxationEnabled.value ? (cosmic ? 3.5 : 2.0) : 0,
      stepScale: gridRelaxationEnabled.value ? (cosmic ? 0.65 : 0.85) : 0,
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

  // Reapply layout to a subset of photos (by id), merging results back into photos2D.
  // Useful when the UI is filtering visibility and we want snap-to-grid to ignore hidden photos.
  const reapplyLayoutForIds = (photoIds) => {
    if (!photos2D.value.length) return;

    const ids = Array.isArray(photoIds) ? photoIds : [];
    if (ids.length === 0) return;

    const idSet = new Set(ids);
    const subset = photos2D.value.filter((p) => p?.id && idSet.has(p.id));
    if (subset.length === 0) return;

    const laidOut = applyLayout(subset);
    const byId = new Map();
    for (const p of laidOut) {
      if (!p?.id) continue;
      byId.set(p.id, p);
    }

    photos2D.value = photos2D.value.map((p) => {
      const updated = p?.id ? byId.get(p.id) : null;
      if (!updated) return p;
      return {
        ...p,
        position: updated.position,
        coordinates: updated.coordinates,
      };
    });
  };

  // Available chunk options (excluding 3D-only options)
  const chunkOptions = [
    { value: "general", label: "General" },
    { value: "story", label: "Narrative" },
    { value: "context", label: "Contextual" },
    { value: "visual_accents", label: "Visual accents" },
    { value: "color_histogram", label: "Chromatic" },
    // { value: "color_histogram_dominant", label: "Dominant color" },
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
      // if (lowPerformance.value && photos.length > 750) {
      //   const getScore = (p) =>
      //     p?.descriptions?.artistic_scores?.aesthetic_quality ?? -Infinity;
      //   workingPhotos = [...photos]
      //     .sort((a, b) => getScore(b) - getScore(a))
      //     .slice(0, 750);
      //   console.log(
      //     `⚡ LowPerformance active: filtered ${photos.length} -> ${workingPhotos.length} (top aesthetic_quality)`,
      //   );
      // }

      // Auto-tune initial expansion only on the very first load and only if the user
      // hasn't changed the slider from its default.
      if (
        photos2D.value.length === 0 &&
        gridRelaxationExpandStrength.value ===
          GRID_RELAXATION_EXPAND_STRENGTH_DEFAULT
      ) {
        const autoStrength = computeAutoExpandStrength(workingPhotos);
        if (autoStrength > 1e-6) {
          gridRelaxationExpandStrength.value = autoStrength;
          console.log(
            `🫧 Auto balloon expansion: ${(autoStrength * 100).toFixed(1)}% (gradual from overlap)`,
          );
        }
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
    gridRelaxationExpandStrength,
    gridSnapToGrid,

    // Computed
    getBounds,

    // Options
    chunkOptions,

    // Methods
    loadAllPhotos,
    changeChunk,
    reapplyLayout,
    reapplyLayoutForIds,
    reset,
  };
}
