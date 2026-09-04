<template>
  <div class="related-photos-toolbar" :class="{ 'toolbar-visible': isVisible }">
    <div class="toolbar-content">
      <!-- Base Image Section (Fixed Left) -->
      <PhotoBase
        :base-images="props.baseImages"
        :toolbar-state="toolbarState"
        :filter-context="props.filterContext"
        @photos-generated="handleGeneratedPhotos"
        @loading="handleLoadingState"
      />

      <!-- Related Photos Section (Scrollable Right) -->
      <div class="related-photos-section">
        <div class="related-photos-header">
          <span class="section-title">Related Photos</span>
          <span v-if="isCanvasScope" class="scroll-hint"
            >👆 Hover a photo to locate it on the canvas • 👈👉 Swipe
            horizontally to scroll</span
          >
          <span v-else class="scroll-hint"
            >👆 Drag photos up to canvas • 👈👉 Swipe horizontally to
            scroll</span
          >
        </div>
        <div
          class="related-photos-scroll scrollbar-minimal"
          @wheel="handleHorizontalScroll"
          ref="scrollContainer"
        >
          <div class="related-photos-grid">
            <!-- Show skeletons when loading -->
            <template v-if="props.isLoading">
              <div
                v-for="n in 10"
                :key="`skeleton-${n}`"
                class="related-photo-skeleton"
              >
                <n-skeleton height="100%" />
              </div>
            </template>
            <!-- Show actual photos when loaded -->
            <template v-else>
              <PhotoCard
                v-for="photo in relatedPhotos"
                :key="photo.id"
                :photo="photo"
                :selected="false"
                :selectable="false"
                :showLowRelevanceIcon="photo.labelScore == 'poor'"
                @info="onPhotoInfo"
                :draggable="!isCanvasScope"
                @dragstart="(e: any) => !isCanvasScope && onDragStart(e, photo)"
                @touchstart="(e: any) => !isCanvasScope && onTouchStart(e, photo)"
                @touchmove="(e: any) => !isCanvasScope && onTouchMove(e, photo)"
                @touchend="(e: any) => !isCanvasScope && onTouchEnd(e, photo)"
                @mouseenter="onPhotoHover(photo)"
                @mouseleave="onPhotoHover(null)"
                :style="{ cursor: isCanvasScope ? 'pointer' : 'grab' }"
                :show-info-button="true"
                :show-locate-button="isCanvasScope"
                @locate="onPhotoLocate"
              />
            </template>
          </div>
          <!-- Área de scroll segura -->
          <div class="scroll-safe-zone"></div>
        </div>
      </div>
    </div>

    <!-- Close Button -->
    <!-- <button class="toolbar-close" @click="closeToolbar">
      <n-icon size="16">
        <svg viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
          />
        </svg>
      </n-icon>
    </button> -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { NIcon, NSkeleton } from "naive-ui";
import PhotoCard, { type Photo } from "../photoCards/PhotoCard.vue";
import PhotoBase from "./PhotoBase.vue";

interface Props {
  isVisible: boolean;
  baseImages?: Photo[];
  toolbarState: Object;
  isLoading?: boolean;
  filterContext?: Object;
}

interface Emits {
  (e: "close"): void;
  (e: "photos-selected", photoIds: string[]): void;
  (e: "search-type-changed", searchType: string): void;
  (e: "loading", isLoading: boolean): void;
  (e: "photo-info", photo: Photo): void;
  (e: "highlight-photo", photoId: string | null): void;
  (e: "locate-photo", photoId: string): void;
}

const props = defineProps<Props>();

const emit = defineEmits<Emits>();

// En scope="canvas" el pool son las fotos que ya están en el lienzo, así que el
// strip no arrastra: al pasar el ratón por una miniatura resaltamos su gemela
// en el canvas (lo maneja CanvasView vía @highlight-photo).
const isCanvasScope = computed(
  () => (props.toolbarState as any)?.expansion?.scope === "canvas",
);

const onPhotoHover = (photo: Photo | null) => {
  if (!isCanvasScope.value) return;
  emit("highlight-photo", photo ? photo.id : null);
};

// Canvas scope only: the strip's photos are the ones already on the board, so the eye
// button glides the canvas to the one clicked. Handled by CanvasView via @locate-photo.
const onPhotoLocate = (photo: Photo) => {
  if (!isCanvasScope.value) return;
  emit("locate-photo", photo.id);
};

const relatedPhotos = ref<Photo[]>([]);
const scrollContainer = ref<HTMLElement>();
const selectedPhotos = ref<string[]>([]);

// Cache for photo dimensions to avoid async issues with drag
const photoDimensionsCache = ref<
  Map<string, { width: number; height: number }>
>(new Map());

// Touch drag state
const touchDragState = ref({
  isDragging: false,
  photo: null as Photo | null,
  startX: 0,
  startY: 0,
  dragElement: null as HTMLElement | null,
});

function handleGeneratedPhotos(photos: any) {
  relatedPhotos.value = photos;
  selectedPhotos.value = [];

  // Preload dimensions for all photos to improve drag performance
  photos.forEach((photo: Photo) => {
    if (
      !photoDimensionsCache.value.has(photo.id) &&
      !photo.width &&
      !photo.height
    ) {
      // Start loading dimensions in background
      const img = new Image();
      img.onload = () => {
        photoDimensionsCache.value.set(photo.id, {
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.src = photo.thumbnailUrl || photo.url;
    }
  });

  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollLeft = 0;
    }
  });
}

const togglePhotoSelection = (photoId: string) => {
  const index = selectedPhotos.value.indexOf(photoId);
  if (index > -1) {
    // If clicking on already selected photo, deselect it
    selectedPhotos.value = [];
  } else {
    // Clear any previous selection and select only this photo
    selectedPhotos.value = [photoId];
  }
  emit("photos-selected", selectedPhotos.value);
};

const onPhotoInfo = (photo: Photo) => {
  emit("photo-info", photo);
};

const closeToolbar = () => {
  emit("close");
};

const handleHorizontalScroll = (e: WheelEvent) => {
  if (!scrollContainer.value) return;

  e.preventDefault();
  scrollContainer.value.scrollLeft += e.deltaY;
};

const handleLoadingState = (isLoading: boolean) => {
  emit("loading", isLoading);
};

function removePhotoFromList(photoId: string) {
  console.log("removePhotoFromList called for photo:", photoId);
  console.trace(); // This will show the call stack
  selectedPhotos.value = selectedPhotos.value.filter((id) => id != photoId);
  relatedPhotos.value = relatedPhotos.value.filter((p) => p.id !== photoId);
}

defineExpose({ removePhotoFromList });

function onDragStart(ev: any, photo: Photo) {
  // Since we only allow single selection, always drag just the clicked photo
  const photosToDrag = [photo];

  const data = JSON.stringify(photosToDrag);
  ev.dataTransfer?.setData("application/json", data);

  // Create custom drag image
  createCustomDragImage(ev, photo, photosToDrag.length);
}

function createCustomDragImage(ev: any, photo: Photo, photoCount: number = 1) {
  // Calculate dimensions for the drag image
  const dimensionsOrPromise = calculateDragElementDimensions(photo);

  const createDragElementSync = (dimensions: {
    width: number;
    height: number;
  }) => {
    console.log("Mouse drag dimensions:", dimensions, "for photo:", photo.id);

    const dragElement = document.createElement("div");
    const { width, height } = dimensions;

    dragElement.style.width = width + "px";
    dragElement.style.height = height + "px";
    dragElement.style.borderRadius = "8px";
    dragElement.style.overflow = "hidden";
    dragElement.style.border = "2px solid #22d3ee";
    dragElement.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.3)";
    dragElement.style.background = "white";
    dragElement.style.position = "absolute";
    dragElement.style.top = "-1000px"; // Hide off-screen
    dragElement.style.left = "-1000px";

    // Create inner image element
    const imgElement = document.createElement("img");
    imgElement.src = photo.thumbnailUrl || photo.url;
    imgElement.style.width = "100%";
    imgElement.style.height = "100%";
    imgElement.style.objectFit = "cover";
    imgElement.style.objectPosition = "center";
    imgElement.style.display = "block";

    dragElement.appendChild(imgElement);

    // Add count badge if multiple photos
    if (photoCount > 1) {
      const badge = document.createElement("div");
      badge.textContent = photoCount.toString();
      badge.style.position = "absolute";
      badge.style.top = "-8px";
      badge.style.right = "-8px";
      badge.style.background = "#007bff";
      badge.style.color = "white";
      badge.style.borderRadius = "50%";
      badge.style.width = "20px";
      badge.style.height = "20px";
      badge.style.display = "flex";
      badge.style.alignItems = "center";
      badge.style.justifyContent = "center";
      badge.style.fontSize = "12px";
      badge.style.fontWeight = "bold";
      badge.style.border = "2px solid white";

      dragElement.appendChild(badge);
    }

    document.body.appendChild(dragElement);

    // Set custom drag image
    try {
      ev.dataTransfer?.setDragImage(dragElement, width / 2, height / 2);
    } catch (error) {
      console.warn("Could not set custom drag image:", error);
    }

    // Clean up after a short delay
    setTimeout(() => {
      if (document.body.contains(dragElement)) {
        document.body.removeChild(dragElement);
      }
    }, 1000);
  };

  if (dimensionsOrPromise instanceof Promise) {
    // For async case, try to estimate dimensions from the image element itself
    // Look for existing img elements in the toolbar to get better fallback dimensions
    const photoCards = document.querySelectorAll(
      ".related-photos-grid .photo-card img",
    );
    let estimatedDimensions = { width: 100, height: 100 }; // default fallback

    // Try to find the img element for this specific photo
    for (const imgEl of photoCards) {
      const img = imgEl as HTMLImageElement;
      if (img.src === photo.thumbnailUrl || img.src === photo.url) {
        if (img.naturalWidth && img.naturalHeight) {
          // Found the actual image, calculate proper dimensions
          const aspectRatio = img.naturalWidth / img.naturalHeight;
          const maxWidth = Math.min(140, window.innerWidth * 0.15);
          const maxHeight = Math.min(105, window.innerHeight * 0.12);

          if (aspectRatio > 1) {
            // Horizontal
            const width = Math.min(maxWidth, maxWidth);
            const height = width / aspectRatio;
            estimatedDimensions = {
              width: Math.max(width, 80),
              height: Math.max(height, 60),
            };
          } else {
            // Vertical
            const height = Math.min(maxHeight, maxHeight);
            const width = height * aspectRatio;
            estimatedDimensions = {
              width: Math.max(width, 60),
              height: Math.max(height, 80),
            };
          }
          break;
        }
      }
    }

    createDragElementSync(estimatedDimensions);
  } else {
    // Sync case - we have dimensions immediately
    createDragElementSync(dimensionsOrPromise);
  }
}

// Touch drag handlers
function onTouchStart(ev: TouchEvent, photo: Photo) {
  // Solo un dedo para cualquier acción
  if (ev.touches.length > 1) {
    return;
  }

  // NO prevenir el evento aún - dejar que el navegador decida
  const touch = ev.touches[0];
  if (!touch) return;

  touchDragState.value = {
    isDragging: false,
    photo,
    startX: touch.clientX,
    startY: touch.clientY,
    dragElement: null,
  };

  // Add global touch move and end listeners
  document.addEventListener("touchmove", handleGlobalTouchMove, {
    passive: false,
  });
  document.addEventListener("touchend", handleGlobalTouchEnd, {
    passive: false,
  });
}

function onTouchMove(ev: TouchEvent, photo: Photo) {
  // This function is for the specific photo element, but we'll handle most logic in the global handler
}

function onTouchEnd(ev: TouchEvent, photo: Photo) {
  // This function is for the specific photo element, but we'll handle most logic in the global handler
}

function handleGlobalTouchMove(ev: TouchEvent) {
  if (!touchDragState.value.photo) return;

  // Solo un dedo
  if (ev.touches.length > 1) {
    cancelTouchDrag();
    return;
  }

  const touch = ev.touches[0];
  if (!touch) return;

  const deltaX = touch.clientX - touchDragState.value.startX;
  const deltaY = touch.clientY - touchDragState.value.startY;
  const absDeltaX = Math.abs(deltaX);
  const absDeltaY = Math.abs(deltaY);

  // Si no hemos decidido la dirección aún
  if (!touchDragState.value.isDragging && (absDeltaX > 15 || absDeltaY > 15)) {
    if (absDeltaX > absDeltaY) {
      // Movimiento horizontal - permitir scroll nativo
      console.log("Horizontal scroll detected - allowing native behavior");

      // Limpiar estado y remover listeners para permitir scroll
      touchDragState.value = {
        isDragging: false,
        photo: null,
        startX: 0,
        startY: 0,
        dragElement: null,
      };

      document.removeEventListener("touchmove", handleGlobalTouchMove);
      document.removeEventListener("touchend", handleGlobalTouchEnd);
      return;
    } else {
      // Movimiento vertical - iniciar drag
      console.log("Vertical drag detected - starting photo drag");
      ev.preventDefault();
      touchDragState.value.isDragging = true;

      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      createDragElement(touch.clientX, touch.clientY);
    }
  }

  if (touchDragState.value.isDragging) {
    ev.preventDefault();

    // Update drag element position
    if (touchDragState.value.dragElement) {
      const halfWidth =
        parseInt(touchDragState.value.dragElement.style.width) / 2;
      const halfHeight =
        parseInt(touchDragState.value.dragElement.style.height) / 2;

      touchDragState.value.dragElement.style.left =
        touch.clientX - halfWidth + "px";
      touchDragState.value.dragElement.style.top =
        touch.clientY - halfHeight + "px";

      // Check if over canvas area for visual feedback
      const elementBelow = document.elementFromPoint(
        touch.clientX,
        touch.clientY,
      );
      const canvasContainer = document.querySelector(".canvas-container");
      const toolbarContainer = document.querySelector(
        ".related-photos-toolbar",
      );

      const isOverCanvas =
        canvasContainer &&
        (canvasContainer.contains(elementBelow) ||
          elementBelow === canvasContainer);

      const isOverToolbar =
        toolbarContainer &&
        (toolbarContainer.contains(elementBelow) ||
          elementBelow === toolbarContainer);

      // Update drag element appearance based on drop zone
      if (isOverCanvas) {
        touchDragState.value.dragElement.style.borderColor = "#22d3ee";
        touchDragState.value.dragElement.style.boxShadow =
          "0 4px 12px rgba(34, 211, 238, 0.6)";
      } else if (isOverToolbar) {
        touchDragState.value.dragElement.style.borderColor = "#f59e0b";
        touchDragState.value.dragElement.style.boxShadow =
          "0 4px 12px rgba(245, 158, 11, 0.4)";
      } else {
        touchDragState.value.dragElement.style.borderColor = "#6b7280";
        touchDragState.value.dragElement.style.boxShadow =
          "0 4px 12px rgba(0, 0, 0, 0.3)";
      }
    }
  }
}

function handleGlobalTouchEnd(ev: TouchEvent) {
  if (!touchDragState.value.photo) return;

  const touch = ev.changedTouches[0];
  if (!touch) return;

  console.log("Touch drag ended, isDragging:", touchDragState.value.isDragging);

  if (touchDragState.value.isDragging) {
    ev.preventDefault();

    // Find drop target
    const elementBelow = document.elementFromPoint(
      touch.clientX,
      touch.clientY,
    );
    const canvasContainer = document.querySelector(".canvas-container");
    const toolbarContainer = document.querySelector(".related-photos-toolbar");

    // Check if we're over the toolbar first (higher priority)
    const isOverToolbar =
      toolbarContainer &&
      (toolbarContainer.contains(elementBelow) ||
        elementBelow === toolbarContainer);

    // Only consider canvas if we're NOT over the toolbar
    const isOverCanvas =
      !isOverToolbar &&
      canvasContainer &&
      (canvasContainer.contains(elementBelow) ||
        elementBelow === canvasContainer);

    // Additional check: if touch Y position is in the bottom area (toolbar zone),
    // always consider it cancelled regardless of element detection
    const toolbarHeight =
      (toolbarContainer as HTMLElement)?.offsetHeight || 240;
    const viewportHeight = window.innerHeight;
    const isInToolbarZone = touch.clientY > viewportHeight - toolbarHeight;

    // Final decision: only drop on canvas if clearly over canvas AND not in toolbar zone
    const shouldDropOnCanvas = isOverCanvas && !isInToolbarZone;

    console.log("Element below:", elementBelow?.className);
    console.log("Drop over toolbar:", isOverToolbar);
    console.log("Drop over canvas:", isOverCanvas);
    console.log(
      "Touch Y:",
      touch.clientY,
      "Toolbar zone starts at:",
      viewportHeight - toolbarHeight,
    );
    console.log("Is in toolbar zone:", isInToolbarZone);
    console.log("Should drop on canvas:", shouldDropOnCanvas);

    if (shouldDropOnCanvas) {
      // Haptic feedback for successful drop
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }

      console.log(
        "Simulating drop event for photo:",
        touchDragState.value.photo?.id,
      );
      // Simulate drop event
      simulateDropEvent(touch.clientX, touch.clientY);
    } else {
      // Drag was cancelled - just clean up the drag element
      console.log("Drag cancelled for photo:", touchDragState.value.photo?.id);
      if (navigator.vibrate) {
        navigator.vibrate(50); // Short vibration for cancellation
      }

      // Simply remove the drag element - the original photo stays in place
      if (touchDragState.value.dragElement) {
        touchDragState.value.dragElement.style.transition = "all 0.2s ease-out";
        touchDragState.value.dragElement.style.opacity = "0";
        touchDragState.value.dragElement.style.transform = "scale(0.8)";

        // Clean up after short animation
        setTimeout(() => {
          if (
            touchDragState.value.dragElement &&
            document.body.contains(touchDragState.value.dragElement)
          ) {
            document.body.removeChild(touchDragState.value.dragElement);
          }
        }, 200);
      }
    }

    // Clean up drag element if not already handled
    if (touchDragState.value.dragElement && shouldDropOnCanvas) {
      document.body.removeChild(touchDragState.value.dragElement);
    }
  }

  // Clean up
  touchDragState.value = {
    isDragging: false,
    photo: null,
    startX: 0,
    startY: 0,
    dragElement: null,
  };

  // Remove global listeners
  document.removeEventListener("touchmove", handleGlobalTouchMove);
  document.removeEventListener("touchend", handleGlobalTouchEnd);
}

// Helper function to cancel touch drag
function cancelTouchDrag() {
  // Animate drag element to show cancellation
  if (touchDragState.value.dragElement) {
    touchDragState.value.dragElement.style.transition = "all 0.2s ease-out";
    touchDragState.value.dragElement.style.transform = "scale(0.5)";
    touchDragState.value.dragElement.style.opacity = "0";

    // Clean up after animation
    setTimeout(() => {
      if (
        touchDragState.value.dragElement &&
        document.body.contains(touchDragState.value.dragElement)
      ) {
        document.body.removeChild(touchDragState.value.dragElement);
      }
    }, 200);
  }

  // Light haptic feedback for cancellation
  if (navigator.vibrate) {
    navigator.vibrate(30);
  }

  touchDragState.value = {
    isDragging: false,
    photo: null,
    startX: 0,
    startY: 0,
    dragElement: null,
  };

  // Remove global listeners
  document.removeEventListener("touchmove", handleGlobalTouchMove);
  document.removeEventListener("touchend", handleGlobalTouchEnd);
}

// Helper function to calculate drag element dimensions based on photo aspect ratio
function calculateDragElementDimensions(
  photo: Photo,
):
  | { width: number; height: number }
  | Promise<{ width: number; height: number }> {
  // Responsive max dimensions based on screen size
  const maxWidth = Math.min(140, window.innerWidth * 0.15);
  const maxHeight = Math.min(105, window.innerHeight * 0.12);

  const calculateDimensions = (photoWidth: number, photoHeight: number) => {
    const aspectRatio = photoWidth / photoHeight;

    if (aspectRatio > 1) {
      // Horizontal photo
      const width = Math.min(maxWidth, maxWidth);
      const height = width / aspectRatio;
      return { width: Math.max(width, 80), height: Math.max(height, 60) };
    } else {
      // Vertical photo
      const height = Math.min(maxHeight, maxHeight);
      const width = height * aspectRatio;
      return { width: Math.max(width, 60), height: Math.max(height, 80) };
    }
  };

  // Check cache first
  const cached = photoDimensionsCache.value.get(photo.id);
  if (cached) {
    return calculateDimensions(cached.width, cached.height);
  }

  // If photo has width and height, use those and cache them
  if (photo.width && photo.height) {
    const dimensions = { width: photo.width, height: photo.height };
    photoDimensionsCache.value.set(photo.id, dimensions);
    return calculateDimensions(photo.width, photo.height);
  }

  // Fallback: try to get dimensions from image element
  const img = new Image();
  img.src = photo.thumbnailUrl || photo.url;

  return new Promise((resolve) => {
    img.onload = () => {
      const dimensions = { width: img.naturalWidth, height: img.naturalHeight };
      // Cache the dimensions for future use
      photoDimensionsCache.value.set(photo.id, dimensions);

      const calculated = calculateDimensions(
        img.naturalWidth,
        img.naturalHeight,
      );
      resolve(calculated);
    };

    img.onerror = () => {
      // Fallback to square
      const dimensions = { width: 100, height: 100 };
      photoDimensionsCache.value.set(photo.id, dimensions);
      resolve({ width: 100, height: 100 });
    };
  });
}

function createDragElement(x: number, y: number) {
  const photo = touchDragState.value.photo;
  if (!photo) return;

  // Calculate dimensions based on photo aspect ratio
  const dimensionsOrPromise = calculateDragElementDimensions(photo);

  if (dimensionsOrPromise instanceof Promise) {
    // Async case - create element with default size first, then update
    createDragElementWithDimensions(x, y, { width: 100, height: 100 });

    dimensionsOrPromise.then(
      (dimensions: { width: number; height: number }) => {
        if (touchDragState.value.dragElement) {
          updateDragElementDimensions(dimensions);
        }
      },
    );
  } else {
    // Sync case - we have dimensions from config
    createDragElementWithDimensions(x, y, dimensionsOrPromise);
  }
}

function createDragElementWithDimensions(
  x: number,
  y: number,
  dimensions: { width: number; height: number },
) {
  const photo = touchDragState.value.photo;
  if (!photo) return;

  console.log("Touch drag dimensions:", dimensions, "for photo:", photo.id);

  // Since we only allow single selection, always just one photo
  const photoCount = 1;

  const dragElement = document.createElement("div");
  const halfWidth = dimensions.width / 2;
  const halfHeight = dimensions.height / 2;

  dragElement.style.position = "fixed";
  dragElement.style.left = x - halfWidth + "px";
  dragElement.style.top = y - halfHeight + "px";
  dragElement.style.width = dimensions.width + "px";
  dragElement.style.height = dimensions.height + "px";
  dragElement.style.borderRadius = "8px";
  dragElement.style.zIndex = "10000";
  dragElement.style.opacity = "0.8";
  dragElement.style.pointerEvents = "none";
  dragElement.style.border = "2px solid #007bff";
  dragElement.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.3)";
  dragElement.style.overflow = "hidden";

  // Create inner image element with proper aspect ratio handling
  const imgElement = document.createElement("img");
  imgElement.src = photo.thumbnailUrl || photo.url;
  imgElement.style.width = "100%";
  imgElement.style.height = "100%";
  imgElement.style.objectFit = "cover";
  imgElement.style.objectPosition = "center";
  imgElement.style.display = "block";

  dragElement.appendChild(imgElement);

  // No count badge needed since we only allow single selection

  document.body.appendChild(dragElement);
  touchDragState.value.dragElement = dragElement;
}

function updateDragElementDimensions(dimensions: {
  width: number;
  height: number;
}) {
  const dragElement = touchDragState.value.dragElement;
  if (!dragElement) return;

  const halfWidth = dimensions.width / 2;
  const halfHeight = dimensions.height / 2;

  // Get current position and adjust for new dimensions
  const currentLeft = parseInt(dragElement.style.left);
  const currentTop = parseInt(dragElement.style.top);
  const currentHalfWidth = parseInt(dragElement.style.width) / 2;
  const currentHalfHeight = parseInt(dragElement.style.height) / 2;

  // Adjust position to keep center point the same
  dragElement.style.left = currentLeft + currentHalfWidth - halfWidth + "px";
  dragElement.style.top = currentTop + currentHalfHeight - halfHeight + "px";
  dragElement.style.width = dimensions.width + "px";
  dragElement.style.height = dimensions.height + "px";
}

function simulateDropEvent(x: number, y: number) {
  const photo = touchDragState.value.photo;
  if (!photo) return;

  // Since we only allow single selection, always drag just the touched photo
  const photosToDrag = [photo];

  // Create a synthetic drop event
  const syntheticEvent = {
    preventDefault: () => {},
    clientX: x,
    clientY: y,
    dataTransfer: {
      getData: (type: string) => {
        if (type === "application/json") {
          return JSON.stringify(photosToDrag);
        }
        return "";
      },
    },
  };

  // Find the canvas container and trigger the drop handler
  const canvasContainer = document.querySelector(".canvas-container");
  if (canvasContainer) {
    // Find the inner div that has the drop handler
    const canvasInner =
      canvasContainer.querySelector("div[data-v-inspector]") ||
      canvasContainer.firstElementChild;
    if (canvasInner) {
      // Dispatch a custom event that the canvas can listen to
      const customDropEvent = new CustomEvent("touchDrop", {
        detail: syntheticEvent,
      });
      canvasInner.dispatchEvent(customDropEvent);
    }
  }
}
</script>

<style scoped>
.related-photos-toolbar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 240px;
  background: linear-gradient(
    to top,
    var(--bg-container) 0%,
    var(--bg-container) 90%,
    transparent 100%
  );
  border-top: 1px solid var(--border-color);
  backdrop-filter: blur(12px);
  z-index: 100;
  transform: translateY(100%);
  transition: none;
  box-shadow: 0 -8px 32px var(--toolbar-shadow-color, rgba(0, 0, 0, 0.3));
}

.related-photos-toolbar.toolbar-visible {
  transform: translateY(0);
  animation: slideUpFromBottom 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)
    forwards;
}

.toolbar-content {
  display: flex;
  height: 100%;
  padding: var(--spacing-lg);
  gap: var(--spacing-lg);
}

.toolbar-close {
  position: absolute;
  top: var(--spacing-md);
  right: var(--spacing-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  cursor: pointer;
  transition: var(--transition-normal);
}

.toolbar-close:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.related-photos-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.related-photos-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.section-title {
  color: var(--text-primary);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
}

.scroll-hint {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  opacity: 0.8;
  white-space: nowrap;
}

.related-photos-scroll {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: var(--spacing-xs);
  scrollbar-width: thin; /* Firefox */
  scrollbar-color: var(--border-color-hover) transparent;
}

.related-photos-scroll::-webkit-scrollbar {
  height: 12px;
  background: transparent;
}

.related-photos-scroll::-webkit-scrollbar-thumb {
  background: var(--border-color-hover);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.related-photos-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

.related-photos-grid {
  display: flex;
  gap: var(--spacing-md);
  height: 160px;
  padding-right: var(--spacing-lg);
}

.related-photos-grid .photo-card {
  flex-shrink: 0;
  width: 160px;
  height: 160px;
}

.related-photo-skeleton {
  flex-shrink: 0;
  width: 160px;
  height: 160px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-surface);
}

.scroll-safe-zone {
  height: 20px;
  min-height: 20px;
  background: transparent;
  pointer-events: none;
}

@media (max-width: 768px) {
  .related-photos-toolbar {
    height: 200px;
  }

  .toolbar-content {
    padding: var(--spacing-md);
    gap: var(--spacing-md);
  }

  .base-image-section {
    width: 120px;
  }

  .base-image-container {
    height: 120px;
  }

  .related-photos-grid {
    height: 120px;
  }

  .related-photos-grid .photo-card {
    width: 120px;
    height: 120px;
  }

  .related-photo-skeleton {
    width: 120px;
    height: 120px;
  }
}

@media (max-width: 480px) {
  .related-photos-toolbar {
    height: 180px;
  }

  .base-image-section {
    width: 100px;
  }

  .base-image-container {
    height: 100px;
  }

  .related-photos-grid {
    height: 100px;
  }

  .related-photos-grid .photo-card {
    width: 100px;
    height: 100px;
  }

  .related-photo-skeleton {
    width: 100px;
    height: 100px;
  }

  .related-photos-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-xs);
  }

  .scroll-hint {
    display: none; /* Ocultar en mobile para ahorrar espacio */
  }
}

/* Touch drag improvements */
.related-photos-grid .photo-card {
  /* Removemos touch-action: none para permitir scroll horizontal nativo */
}

/* Upward slide animation for toolbar appearance */
@keyframes slideUpFromBottom {
  0% {
    transform: translateY(100%);
    opacity: 0;
  }
  20% {
    opacity: 0.3;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Global drag overlay styles are handled inline in JavaScript */
</style>
