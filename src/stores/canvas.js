import { defineStore } from "pinia";
import { api } from "@/utils/axios";
import {
  HORIZONTAL_PHOTO_WIDTH,
  HORIZONTAL_PHOTO_HEIGHT,
  getImageDimensions,
  fitPhotoToBaseBox,
} from "@/utils/canvasPhotoSizing";
import { criteriaOptions } from "@/config/searchCriteria";

const MIN_GAP = 35; // Same gap as auto-align snap

/**
 * Check if a rectangle at (x,y) with size (w,h) overlaps any photo (with padding).
 */
function hasOverlap(photos, x, y, w, h, padding) {
  for (const p of photos) {
    if (
      x - padding < p.config.x + p.config.width &&
      x + w + padding > p.config.x &&
      y - padding < p.config.y + p.config.height &&
      y + h + padding > p.config.y
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Find a position on the canvas where a block of given size
 * doesn't overlap with any existing photo.
 */
function findClearArea(existingPhotos, width, height, gap) {
  if (existingPhotos.length === 0) {
    return { x: gap, y: gap };
  }

  // Bounding box of all existing photos
  let bMinX = Infinity,
    bMinY = Infinity,
    bMaxX = -Infinity,
    bMaxY = -Infinity;
  for (const p of existingPhotos) {
    bMinX = Math.min(bMinX, p.config.x);
    bMinY = Math.min(bMinY, p.config.y);
    bMaxX = Math.max(bMaxX, p.config.x + p.config.width);
    bMaxY = Math.max(bMaxY, p.config.y + p.config.height);
  }

  // Preferred positions: right of content, then below
  const candidates = [
    { x: bMaxX + gap, y: bMinY },
    { x: bMinX, y: bMaxY + gap },
  ];
  for (const pos of candidates) {
    if (!hasOverlap(existingPhotos, pos.x, pos.y, width, height, gap)) {
      return pos;
    }
  }

  // Systematic scan: rightward then downward
  const step = Math.min(width, height, 100);
  const range = Math.max(bMaxX - bMinX, bMaxY - bMinY, width, height) * 2;

  for (let x = bMaxX + gap; x <= bMaxX + range; x += step) {
    for (let y = bMinY - height; y <= bMaxY + height; y += step) {
      if (!hasOverlap(existingPhotos, x, y, width, height, gap)) {
        return { x, y };
      }
    }
  }

  for (let y = bMaxY + gap; y <= bMaxY + range; y += step) {
    for (let x = bMinX - width; x <= bMaxX + width; x += step) {
      if (!hasOverlap(existingPhotos, x, y, width, height, gap)) {
        return { x, y };
      }
    }
  }

  // Absolute fallback
  return { x: bMaxX + gap, y: bMaxY + gap };
}

/**
 * Arrange photos in a compact grid and place them in a clear area.
 */
function arrangeInGrid(newPhotos, existingPhotos) {
  if (newPhotos.length === 0) return;

  const gap = MIN_GAP;
  const count = newPhotos.length;

  // Uniform cell size based on max dimensions of new photos
  const cellW = Math.max(...newPhotos.map((p) => p.config.width));
  const cellH = Math.max(...newPhotos.map((p) => p.config.height));

  // As-square-as-possible grid
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const gridW = cols * cellW + (cols - 1) * gap;
  const gridH = rows * cellH + (rows - 1) * gap;

  const origin = findClearArea(existingPhotos, gridW, gridH, gap);

  for (let i = 0; i < newPhotos.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const photo = newPhotos[i];

    // Center photo within its cell
    photo.config.x =
      origin.x + col * (cellW + gap) + (cellW - photo.config.width) / 2;
    photo.config.y =
      origin.y + row * (cellH + gap) + (cellH - photo.config.height) / 2;
  }
}

// Esta función ahora es async y ajusta el aspect ratio según orientación
async function createPhoto(
  backendPhoto,
  basePosition = { x: 15, y: 15 },
  fromPhoto = false,
  currentZIndex,
  index = 0,
) {
  const hasCustomConfig = backendPhoto.config?.x != null;

  // Obtener dimensiones reales de la imagen y escalar manteniendo proporción
  let width = HORIZONTAL_PHOTO_WIDTH;
  let height = HORIZONTAL_PHOTO_HEIGHT;
  try {
    // Use pre-calculated dimensions if available (from playground), otherwise fetch them
    const dims = backendPhoto.preCalculatedDimensions
      ? backendPhoto.preCalculatedDimensions
      : await getImageDimensions(backendPhoto.thumbnailUrl);
    ({ width, height } = fitPhotoToBaseBox(dims));
  } catch (e) {
    // Si falla, usar horizontal por defecto
    width = HORIZONTAL_PHOTO_WIDTH;
    height = HORIZONTAL_PHOTO_HEIGHT;
  }

  return {
    ...backendPhoto,
    id: backendPhoto.id,
    src: backendPhoto.thumbnailUrl,
    config: hasCustomConfig
      ? {
          ...backendPhoto.config,
          zIndex: currentZIndex,
          width,
          height,
          opacity: fromPhoto ? 0 : 1,
        }
      : {
          x: basePosition.x + (index * width * 1) / 2,
          y: basePosition.y + (index * height * 1) / 2,
          width,
          height,
          opacity: fromPhoto ? 0 : 1,
          zIndex: currentZIndex,
        },
    image: null,
    /** The board's own selection: move, expand, and what the canvas chat looks at. */
    selected: false,
    /** Marked with the corner circle, for the actions that take photos off the board. */
    checked: false,
    showButton: false,
    tags: backendPhoto.tags,
    loading: false,
    // detectionAreas: backendPhoto.detectionAreas,
  };
}

export const useCanvasStore = defineStore("canvas", {
  state: () => ({
    photos: [],
    discardedPhotos: [],
    pendingPhotosToAdd: [], // Photos queued from other views (e.g. takeToCanvas)
    pendingCanvasId: null, // Canvas ID to switch to when pending photos are processed
    currentZIndex: 1,
    basicMode: false, // true si hay alguna foto .status === "uploaded"
    stageRef: null, // Reference to the stage for auto-fitting
    autoFitEnabled: true, // Flag to enable/disable auto-fitting
  }),
  actions: {
    updateBasicMode() {
      this.basicMode = this.photos.some(
        (p) => p.status === "preprocessed" || p.status === "processing",
      );
    },

    async addPhotos(photoObjects, fromPhoto = false, autoFit = false) {
      const addedPhotoIds = [];
      const createdPhotos = [];
      const photosToArrange = [];

      for (let index = 0; index < photoObjects.length; index++) {
        const photo = photoObjects[index];
        if (!this.photos.some((p) => p.id == photo.id)) {
          const hasCustomPosition = photo.config?.x != null;
          const createdPhoto = await createPhoto(
            photo,
            undefined,
            fromPhoto,
            this.currentZIndex,
            index,
          );
          createdPhotos.push(createdPhoto);
          addedPhotoIds.push(createdPhoto.id);
          if (!hasCustomPosition) {
            photosToArrange.push(createdPhoto);
          }
        } else {
          console.log(
            "🔍[STORE addPhotos] DEDUP skip (already present)",
            photo.id,
          );
        }
      }

      // Arrange newly added photos in a compact grid at a clear area
      // BEFORE pushing to the reactive store, so they never render at diagonal positions
      // (skip when expanding from a photo — those use animation-driven positions)
      if (photosToArrange.length > 0 && !fromPhoto) {
        arrangeInGrid(photosToArrange, this.photos);
      }

      // Push all at once to avoid intermediate renders
      this.photos.push(...createdPhotos);

      this.updateBasicMode();

      // Apply glow effect to newly added photos
      this.applyGlowEffect(addedPhotoIds);

      // Auto-fit stage to photos if enabled and requested
      if (autoFit && this.autoFitEnabled && addedPhotoIds.length > 0) {
        // Small delay to ensure photos are rendered
        setTimeout(() => {
          console.log("🔍[STORE addPhotos] running autoFit");
          this.fitStageToPhotos(0.2);
        }, 100);
      }
    },

    // Trae fotos similares usando el endpoint /byPhotos
    async addPhotosFromPhoto(
      basePhotos,
      similarityType,
      resultLength,
      basePosition,
      opposite,
      inverted,
      onCanvas,
      autoFit = false,
      filterContext = null,
      cropRegion = null,
    ) {
      let basePhoto = basePhotos[0]; // de momento solo un anchor
      try {
        basePhoto.loading = true;

        const anchorIds = basePhotos.map((bp) => bp.id);

        const currentOrDiscardedPhotos = [
          ...this.photos.map((p) => p.id),
          ...this.discardedPhotos.map((p) => p.id),
        ];
        let selectedTags = [];
        for (let photoId of anchorIds) {
          let photo = this.photos.find((p) => p.id == photoId);
          let selectedPhotoTagsIds = photo.tags
            .filter((t) => t.tag.selected)
            .map((t) => t.tag.id);
          selectedTags = selectedTags.concat(selectedPhotoTagsIds);
        }

        let selectedBoxes = [];
        for (let photoId of anchorIds) {
          let photo = this.photos.find((p) => p.id == photoId);
          let selectedDetectionIds = photo.detectionAreas
            .filter((dt) => dt.selected)
            .map((dt) => dt.id);
          selectedBoxes = selectedBoxes.concat(selectedDetectionIds);
        }
        const response = await api.post(`/api/search/byPhotos`, {
          anchorIds,
          currentPhotosIds: currentOrDiscardedPhotos,
          criteria: similarityType,
          opposite,
          inverted,
          // descriptionCategories: similarityType.fields,
          resultLength,
          tagIds: selectedTags,
          boxesIds: selectedBoxes,
          // Collection filter
          collectionId: filterContext?.collectionId || null,
          // Optional crop region (percentage-based: {x, y, w, h} each 0-1)
          cropRegion: cropRegion || null,
        });
        const backendPhotos = Array.isArray(response.data)
          ? response.data
          : [response.data];

        if (onCanvas) {
          const addedPhotoIds = [];
          for (const backendPhoto of backendPhotos) {
            if (!this.photos.some((photo) => photo.id === backendPhoto.id)) {
              const createdPhoto = await createPhoto(
                backendPhoto,
                basePosition,
                true,
                this.currentZIndex,
              );
              this.photos.push(createdPhoto);
              addedPhotoIds.push(createdPhoto.id);
            }
          }

          // Apply glow effect to newly added photos
          // this.applyGlowEffect(addedPhotoIds);

          // Auto-fit if requested (usually false for canvas expansions due to animations)
          if (autoFit && this.autoFitEnabled && addedPhotoIds.length > 0) {
            setTimeout(() => {
              this.fitStageToPhotos(0.2);
            }, 100);
          }
        } else {
          return backendPhotos;
        }
      } catch (error) {
        console.error("Error al añadir fotos similares:", error);
      } finally {
        setTimeout(() => {
          basePhoto.loading = false;
        }, 500);
      }
    },
    deletePhotos(photoIds) {
      const photosToRemove = this.photos.filter((p) => photoIds.includes(p.id));

      // Clean up blob URLs for removed photos
      photosToRemove.forEach((photo) => {
        if (photo.src && photo.src.startsWith("blob:")) {
          URL.revokeObjectURL(photo.src);
        }
        if (photo.thumbnailUrl && photo.thumbnailUrl.startsWith("blob:")) {
          URL.revokeObjectURL(photo.thumbnailUrl);
        }
      });

      this.photos = this.photos.filter(
        (p) => !photosToRemove.map((p) => p.id).includes(p.id),
      );
      this.discardedPhotos = this.discardedPhotos.concat(photosToRemove);
      this.updateBasicMode();
    },

    applyGlowEffect(photoIds) {
      // Mark newly added photos with glow effect
      this.photos.forEach((photo) => {
        if (photoIds.includes(photo.id)) {
          photo.isNew = true;
          // Remove the glow effect after 3 seconds
          setTimeout(() => {
            photo.isNew = false;
            // Clean up any running animations if there's access to stage
            if (this.cleanupGlowAnimations) {
              this.cleanupGlowAnimations(photo.id);
            }
          }, 3000);
        }
      });
    },

    // Method to register stage reference for auto-fitting
    setStageRef(stageRef) {
      this.stageRef = stageRef;
    },

    // Method to enable/disable auto-fitting
    setAutoFitEnabled(enabled) {
      this.autoFitEnabled = enabled;
    },

    // Fit stage to photos - moved from CanvasView
    fitStageToPhotos(extraPaddingRatio = 0.1) {
      if (!this.photos.length || !this.stageRef) {
        console.log(
          "🔍[STORE fitStageToPhotos] EARLY RETURN — photos:",
          this.photos.length,
          "stageRef?",
          !!this.stageRef,
        );
        return;
      }

      const stage = this.stageRef.getStage();
      let containerWidth = stage.width();
      let containerHeight = stage.height();

      // Recover from a zero-sized stage. On KeepAlive reactivation (and after a
      // resize fired while the view was detached) stage.width()/height() can be 0,
      // which would make targetZoom collapse to 0 and scale the whole canvas to
      // nothing — photos are present but invisible. Re-measure from the wrapper
      // element; if it isn't laid out yet, retry next frame instead of fitting to 0.
      if (containerWidth <= 0 || containerHeight <= 0) {
        const wrapper = stage.container()?.parentElement;
        const cw = wrapper?.clientWidth || 0;
        const ch = wrapper?.clientHeight || 0;
        console.log(
          "🔍[STORE fitStageToPhotos] zero stage size — remeasured wrapper:",
          { cw, ch },
        );
        if (cw > 0 && ch > 0) {
          stage.width(cw);
          stage.height(ch);
          containerWidth = cw;
          containerHeight = ch;
        } else if (typeof requestAnimationFrame !== "undefined") {
          requestAnimationFrame(() => this.fitStageToPhotos(extraPaddingRatio));
          return;
        } else {
          return;
        }
      }

      const margin = 40;

      // Bounding box de todas las fotos
      const bounds = this.photos.reduce(
        (acc, p) => {
          const { x, y, width, height } = p.config;
          acc.minX = Math.min(acc.minX, x);
          acc.minY = Math.min(acc.minY, y);
          acc.maxX = Math.max(acc.maxX, x + width);
          acc.maxY = Math.max(acc.maxY, y + height);
          return acc;
        },
        {
          minX: Infinity,
          minY: Infinity,
          maxX: -Infinity,
          maxY: -Infinity,
        },
      );

      // Añadir padding adicional
      const paddingX = (bounds.maxX - bounds.minX) * extraPaddingRatio;
      const paddingY = (bounds.maxY - bounds.minY) * extraPaddingRatio;
      bounds.minX -= paddingX;
      bounds.maxX += paddingX;
      bounds.minY -= paddingY;
      bounds.maxY += paddingY;

      const photosWidth = bounds.maxX - bounds.minX + margin * 2;
      const photosHeight = bounds.maxY - bounds.minY + margin * 2;
      const targetZoom = Math.min(
        containerWidth / photosWidth,
        containerHeight / photosHeight,
        2,
      );

      const targetX =
        (containerWidth - photosWidth * targetZoom) / 2 -
        bounds.minX * targetZoom +
        margin * targetZoom;
      const targetY =
        (containerHeight - photosHeight * targetZoom) / 2 -
        bounds.minY * targetZoom +
        margin * targetZoom;

      // Import Konva dynamically to avoid issues
      import("konva").then((Konva) => {
        new Konva.default.Tween({
          node: stage,
          scaleX: targetZoom,
          scaleY: targetZoom,
          x: targetX,
          y: targetY,
          duration: 0.4,
          easing: Konva.default.Easings.EaseInOut,
          onFinish: () => {
            console.log("🔍[STORE fitStageToPhotos] tween finished");
            // Update toolbar state if available
            if (this.toolbarState && this.toolbarState.value) {
              this.toolbarState.value.zoomLevel = targetZoom;
            }
            if (this.updateStageOffset) {
              this.updateStageOffset();
            }
          },
        }).play();
      });
    },
  },
});

export const expansionTypeOptions = criteriaOptions([
  "embedding",
  "story",
  "content",
  "context",
  "chromatic",
  "tags",
]);
