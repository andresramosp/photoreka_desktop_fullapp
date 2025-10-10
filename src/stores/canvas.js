import { defineStore } from "pinia";
import { api } from "@/utils/axios";

const HORIZONTAL_PHOTO_WIDTH = 150 * 1.5;
const HORIZONTAL_PHOTO_HEIGHT = 100 * 1.5;
const VERTICAL_PHOTO_WIDTH = 100 * 1.5;
const VERTICAL_PHOTO_HEIGHT = 150 * 1.5;

// Devuelve una promesa con las dimensiones de la imagen
function getImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = function () {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Esta función ahora es async y ajusta el aspect ratio según orientación
async function createPhoto(
  backendPhoto,
  basePosition = { x: 15, y: 15 },
  fromPhoto = false,
  currentZIndex,
  index = 0
) {
  const hasCustomConfig = backendPhoto.config?.x != null;

  // Obtener dimensiones reales de la imagen y escalar manteniendo proporción
  let width = HORIZONTAL_PHOTO_WIDTH;
  let height = HORIZONTAL_PHOTO_HEIGHT;
  try {
    let dims;
    // Use pre-calculated dimensions if available (from playground), otherwise fetch them
    if (backendPhoto.preCalculatedDimensions) {
      dims = backendPhoto.preCalculatedDimensions;
    } else {
      dims = await getImageDimensions(backendPhoto.thumbnailUrl);
    }

    // Escalado flexible: ajusta el tamaño máximo a los valores base, manteniendo el aspect ratio
    const maxW = HORIZONTAL_PHOTO_WIDTH;
    const maxH = VERTICAL_PHOTO_HEIGHT;
    const aspectRatio = dims.width / dims.height;
    if (dims.width > dims.height) {
      // Horizontal: limitar por ancho
      width = Math.min(dims.width, maxW);
      height = width / aspectRatio;
      if (height > maxH) {
        height = maxH;
        width = height * aspectRatio;
      }
    } else {
      // Vertical: limitar por alto
      height = Math.min(dims.height, maxH);
      width = height * aspectRatio;
      if (width > maxW) {
        width = maxW;
        height = width / aspectRatio;
      }
    }
  } catch (e) {
    // Si falla, usar horizontal por defecto
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
    selected: false,
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
    currentZIndex: 1,
    basicMode: false, // true si hay alguna foto .status === "uploaded"
    stageRef: null, // Reference to the stage for auto-fitting
    autoFitEnabled: true, // Flag to enable/disable auto-fitting
  }),
  actions: {
    updateBasicMode() {
      this.basicMode = this.photos.some(
        (p) => p.status === "preprocessed" || p.status === "processing"
      );
    },

    async addPhotos(photoObjects, fromPhoto = false, autoFit = false) {
      const addedPhotoIds = [];
      for (let index = 0; index < photoObjects.length; index++) {
        const photo = photoObjects[index];
        if (!this.photos.some((p) => p.id == photo.id)) {
          const createdPhoto = await createPhoto(
            photo,
            undefined,
            fromPhoto,
            this.currentZIndex,
            index
          );
          this.photos.push(createdPhoto);
          addedPhotoIds.push(createdPhoto.id);
        }
      }
      this.updateBasicMode();

      // Apply glow effect to newly added photos
      this.applyGlowEffect(addedPhotoIds);

      // Auto-fit stage to photos if enabled and requested
      if (autoFit && this.autoFitEnabled && addedPhotoIds.length > 0) {
        // Small delay to ensure photos are rendered
        setTimeout(() => {
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
      autoFit = false
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
                this.currentZIndex
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
        (p) => !photosToRemove.map((p) => p.id).includes(p.id)
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
      if (!this.photos.length || !this.stageRef) return;

      const stage = this.stageRef.getStage();
      const containerWidth = stage.width();
      const containerHeight = stage.height();
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
        }
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
        2
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

export const expansionTypeOptions = [
  { label: "General", value: "embedding" },
  { label: "Narrative", value: "story", basicOnly: false },
  { label: "Visual accents", value: "visual_accents", basicOnly: false },
  { label: "Context", value: "context", basicOnly: false },
  { label: "Chromatic", value: "chromatic" },
  { label: "Tags", value: "tags", basicOnly: false },
  // { label: "Dominant Colors", value: "chromatic_dominant", basicOnly: false },
];
