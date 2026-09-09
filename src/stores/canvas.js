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

/**
 * Up to this many photos a materialised group keeps to a single row — the shape the chat
 * proposed them in. Past it the block folds into the squarest grid that still reads left
 * to right, top to bottom, so a long group does not become a stripe across the board.
 */
const GROUP_MAX_SINGLE_ROW = 8;

/**
 * The clear band a materialised group keeps around itself, as a multiple of its own cell.
 *
 * A block separated from its neighbours by the ordinary photo gap is not a block — it just
 * continues them. This is what makes several groups laid out one after another read as
 * several groups instead of one long strip. Kept modest: it is a boundary, and every extra
 * bit of it is distance the photos have to travel to satisfy it.
 */
const GROUP_MARGIN_IN_CELLS = 0.6;

/** How far apart the candidate spots are, as a multiple of the group's cell. */
const GROUP_SEARCH_STEP_IN_CELLS = 0.5;

/** How far out the search gives up and hands the placement back to `findClearArea`. */
const GROUP_SEARCH_MAX_RINGS = 30;

/**
 * The clear spot for a block, as close as possible to where the block WANTS to be.
 *
 * Candidate origins on rings of increasing radius around `preferred`, nearest first, so
 * the block is placed by how little it has to move rather than by where the board happens
 * to end. A group already sitting somewhere clear matches at radius zero and does not
 * travel at all; one sitting on top of other photos slides just far enough to be out of
 * their way.
 *
 * @param {Array} existingPhotos  everything the block must stay clear of
 * @param {{x: number, y: number}} preferred  top-left the block would take if nothing else existed
 * @param {number} clearance  the band the block keeps around itself
 * @param {number} step  distance between candidate spots
 */
function findNearestClearOrigin(
  existingPhotos,
  preferred,
  width,
  height,
  clearance,
  step,
) {
  for (let ring = 0; ring <= GROUP_SEARCH_MAX_RINGS; ring += 1) {
    const offsets = [];
    for (let ix = -ring; ix <= ring; ix += 1) {
      for (let iy = -ring; iy <= ring; iy += 1) {
        // The ring itself, not the square it bounds — the inside was tried already.
        if (Math.max(Math.abs(ix), Math.abs(iy)) === ring)
          offsets.push([ix, iy]);
      }
    }
    // A square ring is not a circle: its corners are further away than its sides, so the
    // ring is walked by true distance and the block never jumps past a nearer spot.
    offsets.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));

    for (const [ix, iy] of offsets) {
      const x = preferred.x + ix * step;
      const y = preferred.y + iy * step;
      if (!hasOverlap(existingPhotos, x, y, width, height, clearance)) {
        return { x, y };
      }
    }
  }

  // Hemmed in for twenty-odd cells in every direction: fall back to the board-level
  // placement, which looks past the neighbourhood entirely.
  return findClearArea(existingPhotos, width, height, clearance);
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
    // A photo can arrive slim — a drag from the chat transcript carries little more than
    // an id and a thumbnail — while the board reads its tags as an array on hover and on
    // every expansion.
    tags: backendPhoto.tags ?? [],
    loading: false,
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
    // Live canvas viewport (board coords), synced by CanvasView on every pan/zoom. Reactive
    // so the chat's vision halo can react to pans and zooms.
    viewport: { width: 0, height: 0, x: 0, y: 0, scale: 1 },
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
      scope = "catalog",
    ) {
      let basePhoto = basePhotos[0]; // de momento solo un anchor
      try {
        basePhoto.loading = true;

        const anchorIds = basePhotos.map((bp) => bp.id);

        // Con scope "canvas" el pool son las fotos que hay ahora en el canvas
        // (mandamos sus IDs porque no siempre están persistidas en BD), y por
        // eso no las excluimos vía currentPhotosIds: si lo hiciéramos el pool
        // quedaría vacío. El backend igualmente descarta los anchors. Con scope
        // "selection" el pool se recorta a las fotos marcadas por el usuario en el canvas.
        const scopeIsCanvas = scope === "canvas";
        const scopeIsSelection = scope === "selection";
        const scopeIsRestricted = scopeIsCanvas || scopeIsSelection;
        const candidatePoolIds = scopeIsSelection
          ? this.photos.filter((p) => p.selected).map((p) => p.id)
          : scopeIsCanvas
            ? this.photos.map((p) => p.id)
            : null;

        // Nothing selected: an empty pool would ask the backend to search over nothing in
        // particular, so skip the call outright and yield no results.
        if (scopeIsSelection && candidatePoolIds.length === 0) {
          return onCanvas ? undefined : [];
        }

        const currentOrDiscardedPhotos = scopeIsRestricted
          ? []
          : [
              ...this.photos.map((p) => p.id),
              ...this.discardedPhotos.map((p) => p.id),
            ];
        let selectedTags = [];
        for (let photoId of anchorIds) {
          // El anchor puede no estar en this.photos (viene de fuera del canvas) y sus tags
          // se piden al back de forma asíncrona en PhotoBase, así que pueden no haber
          // llegado todavía cuando esta búsqueda se dispara.
          let photo =
            this.photos.find((p) => p.id == photoId) ??
            basePhotos.find((p) => p.id == photoId);
          let selectedPhotoTagsIds = (photo?.tags ?? [])
            .filter((t) => t.tag.selected)
            .map((t) => t.tag.id);
          selectedTags = selectedTags.concat(selectedPhotoTagsIds);
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
          // Detection boxes are gone from the canvas; the request shape stays as the
          // endpoint expects it.
          boxesIds: [],
          // Collection filter
          collectionId: filterContext?.collectionId || null,
          // Restringe el pool a las fotos del canvas cuando scope === "canvas"
          candidatePoolIds,
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

    /**
     * Where a set of photos has to sit to read as ONE group on the board.
     *
     * Used to materialise a grouping the canvas chat proposed: the photos are pulled out
     * of wherever they happen to be and laid out as a compact block, in the order the
     * reply gave them. The clear area is measured against the photos that are NOT moving,
     * so the block never has to fit around the gaps its own members leave behind.
     *
     * Returns the targets instead of applying them — the caller tweens the photos there
     * and commits the positions when the movement lands, so the group visibly travels to
     * its new home rather than teleporting.
     *
     * @param {Array<number|string>} photoIds  the group, in the order it should read
     * @returns {{targets: Array<{photo: object, x: number, y: number}>,
     *            bounds: {minX: number, minY: number, maxX: number, maxY: number}}|null}
     */
    planGroupPlacement(photoIds) {
      const byId = new Map(
        this.photos.map((photo) => [Number(photo.id), photo]),
      );
      const members = (photoIds ?? [])
        .map((id) => byId.get(Number(id)))
        .filter(Boolean);
      if (members.length === 0) return null;

      const memberIds = new Set(members.map((photo) => Number(photo.id)));
      const others = this.photos.filter(
        (photo) => !memberIds.has(Number(photo.id)),
      );

      const gap = MIN_GAP;
      const cellW = Math.max(...members.map((photo) => photo.config.width));
      const cellH = Math.max(...members.map((photo) => photo.config.height));

      const cols =
        members.length <= GROUP_MAX_SINGLE_ROW
          ? members.length
          : Math.ceil(Math.sqrt(members.length));
      const rows = Math.ceil(members.length / cols);
      const gridW = cols * cellW + (cols - 1) * gap;
      const gridH = rows * cellH + (rows - 1) * gap;

      // The block forms around the group's own centre of mass, and only slides from there
      // if something else is in the way. Photos already sitting together barely move; the
      // ones scattered across the board come to them, rather than the whole set marching
      // off to an empty corner.
      const centre = members.reduce(
        (acc, photo) => ({
          x: acc.x + (photo.config.x + photo.config.width / 2) / members.length,
          y:
            acc.y + (photo.config.y + photo.config.height / 2) / members.length,
        }),
        { x: 0, y: 0 },
      );
      const cell = Math.max(cellW, cellH);
      const origin = findNearestClearOrigin(
        others,
        { x: centre.x - gridW / 2, y: centre.y - gridH / 2 },
        gridW,
        gridH,
        cell * GROUP_MARGIN_IN_CELLS,
        cell * GROUP_SEARCH_STEP_IN_CELLS,
      );

      const targets = members.map((photo, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
          photo,
          // Centred in its cell, so a portrait beside a landscape still reads as a row.
          x: origin.x + col * (cellW + gap) + (cellW - photo.config.width) / 2,
          y: origin.y + row * (cellH + gap) + (cellH - photo.config.height) / 2,
        };
      });

      return {
        targets,
        bounds: {
          minX: origin.x,
          minY: origin.y,
          maxX: origin.x + gridW,
          maxY: origin.y + gridH,
        },
      };
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

      this.fitStageToBounds(bounds, extraPaddingRatio);
    },

    /**
     * Tween the stage so an arbitrary world-space rectangle fills the viewport.
     *
     * `fitStageToPhotos` frames the photo bounding box; the canvas-chat tutorial instead
     * frames the outer vision ring, which reaches past the photos. Both want the same
     * centring and zoom math, so it lives here and takes the rectangle explicitly as
     * `{ minX, minY, maxX, maxY }` in board coordinates.
     */
    fitStageToBounds(bounds, extraPaddingRatio = 0.1) {
      if (!this.stageRef) return;

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
          "🔍[STORE fitStageToBounds] zero stage size — remeasured wrapper:",
          { cw, ch },
        );
        if (cw > 0 && ch > 0) {
          stage.width(cw);
          stage.height(ch);
          containerWidth = cw;
          containerHeight = ch;
        } else if (typeof requestAnimationFrame !== "undefined") {
          requestAnimationFrame(() =>
            this.fitStageToBounds(bounds, extraPaddingRatio),
          );
          return;
        } else {
          return;
        }
      }

      const margin = 40;

      // Copy before padding so a requestAnimationFrame retry above never compounds it.
      const padded = { ...bounds };
      const paddingX = (padded.maxX - padded.minX) * extraPaddingRatio;
      const paddingY = (padded.maxY - padded.minY) * extraPaddingRatio;
      padded.minX -= paddingX;
      padded.maxX += paddingX;
      padded.minY -= paddingY;
      padded.maxY += paddingY;

      const contentWidth = padded.maxX - padded.minX + margin * 2;
      const contentHeight = padded.maxY - padded.minY + margin * 2;
      const targetZoom = Math.min(
        containerWidth / contentWidth,
        containerHeight / contentHeight,
        2,
      );

      const targetX =
        (containerWidth - contentWidth * targetZoom) / 2 -
        padded.minX * targetZoom +
        margin * targetZoom;
      const targetY =
        (containerHeight - contentHeight * targetZoom) / 2 -
        padded.minY * targetZoom +
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
            console.log("🔍[STORE fitStageToBounds] tween finished");
            // Update toolbar state if available
            if (this.toolbarState && this.toolbarState.value) {
              this.toolbarState.value.zoomLevel = targetZoom;
            }
            if (this.updateStageOffset) {
              this.updateStageOffset();
            }
            // The viewport has settled at its final pan/zoom. Anything centred on it (the
            // chat vision halo) can now be shown without jumping — see onFitComplete.
            if (this.onFitComplete) {
              this.onFitComplete();
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
