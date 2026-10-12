<template>
  <div
    ref="scrollAreaRef"
    class="series-photo-grid-scroll"
    :style="scrollAreaHeight ? { height: scrollAreaHeight + 'px' } : null"
  >
    <draggable
      v-model="realPhotos"
      class="sp-grid"
      :style="gridStyle"
      :class="{ 'drag-disabled': activePlaceholderIndex !== null }"
      item-key="id"
      :disabled="activePlaceholderIndex !== null"
      ghost-class="drag-ghost"
      chosen-class="drag-chosen"
      drag-class="drag-active"
      animation="200"
      @end="onDragEnd"
    >
      <template #item="{ element: photo, index }">
        <div
          class="sp-cell"
          :class="{ 'sp-cell--splits': activePlaceholderIndex === index }"
          @mouseenter="hoveredPhotoIndex = index"
          @mouseleave="hoveredPhotoIndex = null"
        >
          <!-- Inline placeholder BEFORE this photo. When active, the wrapper
               uses `display: contents` so this card and the photo slot become
               direct grid children, each occupying a single column. The grid
               then reflows the following photos naturally, exactly as it
               would when inserting a new photo — no row jumps, no breakage. -->
          <PlaceholderPhotoCard
            v-if="activePlaceholderIndex === index"
            class="sp-placeholder-cell"
            :size="photoSize"
            :suggestion-criteria-options="suggestionCriteriaOptions"
            :is-loading="isPlaceholderLoading"
            @add="handlePlaceholderAdd"
            @close="closePlaceholder"
            @suggest="handlePlaceholderSuggest"
          />

          <!-- Photo slot: hosts the photo card and the "+" overlays. When the
               parent cell is in `display: contents` mode, this slot becomes a
               direct grid cell itself. -->
          <div class="sp-photo-slot">
            <template v-if="isPhotoRefreshing(photo.id)">
              <PlaceholderPhotoCard
                :size="photoSize"
                :suggestion-criteria-options="suggestionCriteriaOptions"
                :is-loading="true"
                @add="() => {}"
                @close="() => {}"
                @suggest="() => {}"
              />
            </template>
            <PhotoSequenceCard
              v-else
              mode="series"
              :photo="photo"
              :draggable="true"
              :selectable="true"
              :is-selected="selectedPhotoIds.includes(photo.id)"
              :show-name="false"
              :size="photoSize"
              :order-number="index + 1"
              :class="{ inserting: insertingPhotoIds.has(photo.id) }"
              :is-suggested="!!suggestedPhotosInfo[photo.id]"
              :suggestion-criteria="suggestedPhotosInfo[photo.id]?.criteria"
              @remove="removePhoto(photo)"
              @select="handlePhotoSelect"
              @show-info="handleShowInfo"
              @refresh-suggestion="handleRefreshSuggestion(photo.id)"
            />

            <!-- Left "+": ONLY rendered for the very first photo, to cover
                 gap 0 (the leading gap). For every other gap we rely on the
                 right-"+" of the previous photo, so each gap has exactly
                 ONE button. -->
            <div
              v-if="index === 0 && shouldShowPlus(0)"
              class="sp-plus-anchor sp-plus-anchor--leading"
            >
              <n-button
                class="sp-plus"
                size="tiny"
                circle
                type="info"
                @click.stop="createPlaceholder(0)"
                @mousedown.stop
                aria-label="Insert photo before this one"
              >
                <template #icon>
                  <n-icon><AddCircleOutline /></n-icon>
                </template>
              </n-button>
            </div>

            <!-- Right "+": insert AFTER this photo (position = index + 1).
                 One button per gap — this is the canonical button for every
                 gap except gap 0 (which is handled by the left-"+" of the
                 first photo). -->
            <!-- Gap-zone overlay: transparent div extending into the right
                 column-gap so hovering the gap between two photos also
                 reveals the adjacent "+" buttons (mirrors strip behaviour). -->
            <div
              v-if="activePlaceholderIndex === null"
              class="sp-gap-zone"
              @mouseenter="hoveredGapIndex = index + 1"
              @mouseleave="hoveredGapIndex = null"
            />

            <div
              v-if="shouldShowPlus(index + 1)"
              class="sp-plus-anchor"
              :class="{ 'sp-plus-anchor--edge': isRowEnd(index) }"
            >
              <n-button
                class="sp-plus"
                size="tiny"
                circle
                type="info"
                @click.stop="createPlaceholder(index + 1)"
                @mousedown.stop
                aria-label="Insert photo after this one"
              >
                <template #icon>
                  <n-icon><AddCircleOutline /></n-icon>
                </template>
              </n-button>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <!-- Placeholder at the very end: rendered as a plain grid cell of the
             same width as any photo, so the grid handles it naturally. -->
        <PlaceholderPhotoCard
          v-if="
            activePlaceholderIndex === realPhotos.length &&
            realPhotos.length > 0
          "
          class="sp-placeholder-cell"
          :size="photoSize"
          :suggestion-criteria-options="suggestionCriteriaOptions"
          :is-loading="isPlaceholderLoading"
          @add="handlePlaceholderAdd"
          @close="closePlaceholder"
          @suggest="handlePlaceholderSuggest"
        />
      </template>
    </draggable>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { NButton, NIcon } from "naive-ui";
import { AddCircleOutline } from "@vicons/ionicons5";
import draggable from "vuedraggable";
import PhotoSequenceCard from "@/components/PhotoSequenceCard.vue";
import PlaceholderPhotoCard from "@/components/PlaceholderPhotoCard.vue";
import { criteriaOptions } from "@/config/searchCriteria";

const props = defineProps({
  photos: { type: Array, default: () => [] },
  seriesId: { type: [String, Number], required: true },
  selectedPhotoIds: { type: Array, default: () => [] },
  suggestedPhotosInfo: { type: Object, default: () => ({}) },
  refreshingPhotoId: { type: [String, Number], default: null },
  photoSize: { type: Number, required: true },
});

const emit = defineEmits([
  "add-photos-at",
  "suggest-photo-at",
  "refresh-suggestion",
  "remove-photo",
  "reorder",
  "photos-updated",
  "select-photo",
  "show-info",
  "scroll-direction",
]);

// Suggestion criteria (same options as the strip view)
const suggestionCriteriaOptions = criteriaOptions([
  "embedding",
  "context",
  "story",
  "content",
  "chromatic",
]);

// Local state
const localPhotos = ref([]);
const hoveredPhotoIndex = ref(null);
const hoveredGapIndex = ref(null);
const activePlaceholderIndex = ref(null);
const isPlaceholderLoading = ref(false);
const insertingPhotoIds = ref(new Set());

// realPhotos proxy for vuedraggable (keeps parity with the strip component).
const realPhotos = computed({
  get: () => localPhotos.value,
  set: (newValue) => {
    localPhotos.value = newValue;
  },
});

// Columns are at least photoSize wide and stretch to fill the row, so the
// grid shares its edges with the controls above it (like the collections grid).
const GRID_GAP = 24;
const gridStyle = computed(() => ({
  "--sp-photo-size": `${props.photoSize}px`,
  "--sp-gap": `${GRID_GAP}px`,
}));

// The scroll area only bleeds 16px into the page gutter, so a "+" hanging
// gap/2 outside the last photo of a row would be clipped. Row-end buttons sit
// centered on the photo edge instead, which needs the live column count.
const columnCount = ref(1);
let gridResizeObserver = null;

const updateColumnCount = () => {
  const grid = scrollAreaRef.value?.querySelector(".sp-grid");
  if (!grid) return;
  columnCount.value = Math.max(
    1,
    Math.floor((grid.clientWidth + GRID_GAP) / (props.photoSize + GRID_GAP)),
  );
};

const isRowEnd = (index) => (index + 1) % columnCount.value === 0;

/* ── Smooth S/M/L resize (FLIP) ──────────────────────────────────────
   The cells are `1fr` columns of an `auto-fill` grid, so a size change also
   changes the column COUNT: CSS cannot interpolate that (percentage widths
   whose containing block resizes do not fire transitions either), which is
   why the switch used to snap. So we animate it ourselves with FLIP: measure
   every card before the change, let the grid relayout, then invert the delta
   with a transform and release it. Position and size are interpolated in one
   composited transform, which also keeps the reflow off the main thread. */
const SIZE_FLIP_MS = 320;
const SIZE_FLIP_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
let sizeFlipTimer = null;
let sizeFlipElements = [];

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/* The animated boxes are the grid items that hold a card: the photo slot and
   any placeholder that is itself a cell (the refreshing placeholder lives
   INSIDE a slot, so matching it too would double-transform it). */
const sizeFlipTargets = () => {
  const grid = scrollAreaRef.value?.querySelector(".sp-grid");
  if (!grid) return [];
  return Array.from(
    grid.querySelectorAll(
      ".sp-photo-slot, .sp-cell > .sp-placeholder-cell, .sp-grid > .sp-placeholder-cell",
    ),
  );
};

const clearSizeFlip = () => {
  sizeFlipElements.forEach((el) => {
    el.style.transition = "";
    el.style.transform = "";
    el.style.transformOrigin = "";
    el.style.willChange = "";
  });
  sizeFlipElements = [];
};

const playSizeFlip = (targets, first) => {
  clearTimeout(sizeFlipTimer);
  clearSizeFlip();

  const moved = [];
  targets.forEach((el, i) => {
    const before = first[i];
    if (!el.isConnected || !before?.width) return;
    const after = el.getBoundingClientRect();
    if (!after.width) return;

    const dx = before.left - after.left;
    const dy = before.top - after.top;
    const scale = before.width / after.width;
    // Sub-pixel deltas are invisible and would only cost us a repaint.
    if (
      Math.abs(dx) < 0.5 &&
      Math.abs(dy) < 0.5 &&
      Math.abs(scale - 1) < 0.005
    ) {
      return;
    }

    el.style.transition = "none";
    el.style.transformOrigin = "top left";
    el.style.willChange = "transform";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    moved.push(el);
  });

  if (!moved.length) return;
  sizeFlipElements = moved;

  // Flush the inverted state so the first painted frame is the OLD layout.
  void scrollAreaRef.value?.offsetHeight;

  requestAnimationFrame(() => {
    sizeFlipElements.forEach((el) => {
      el.style.transition = `transform ${SIZE_FLIP_MS}ms ${SIZE_FLIP_EASING}`;
      el.style.transform = "";
    });
    sizeFlipTimer = setTimeout(clearSizeFlip, SIZE_FLIP_MS + 60);
  });
};

// `flush: "pre"` — this runs before the re-render applies the new
// --sp-photo-size, so the rects we take here are the OLD layout.
watch(
  () => props.photoSize,
  () => {
    const targets = prefersReducedMotion() ? [] : sizeFlipTargets();
    const first = targets.map((el) => el.getBoundingClientRect());
    nextTick(() => {
      updateColumnCount();
      if (targets.length) playSizeFlip(targets, first);
    });
  },
  { flush: "pre" },
);

const isPhotoRefreshing = (photoId) => props.refreshingPhotoId === photoId;

// Keep localPhotos in sync with incoming props.
watch(
  () => props.photos,
  (newPhotos, oldPhotos) => {
    const newList = Array.isArray(newPhotos) ? newPhotos : [];
    const oldList = Array.isArray(oldPhotos) ? oldPhotos : [];

    // Preserve a refreshing photo that may have been temporarily dropped from
    // the parent list while a new suggestion is being fetched.
    let photosToDisplay = [...newList];
    if (props.refreshingPhotoId) {
      const stillThere = newList.some((p) => p.id === props.refreshingPhotoId);
      if (!stillThere && oldList.length) {
        const refreshing = oldList.find(
          (p) => p.id === props.refreshingPhotoId,
        );
        if (refreshing) {
          const originalIndex = oldList.findIndex(
            (p) => p.id === props.refreshingPhotoId,
          );
          photosToDisplay.splice(originalIndex, 0, refreshing);
        }
      }
    }

    // When a placeholder was active and photos got longer, it means an insert
    // was confirmed. Clear the placeholder and flag the new photo for the
    // insertion animation.
    if (
      activePlaceholderIndex.value !== null &&
      photosToDisplay.length > oldList.length
    ) {
      const newIds = photosToDisplay
        .filter((p) => !oldList.some((op) => op.id === p.id))
        .map((p) => p.id);
      if (newIds.length > 0) {
        insertingPhotoIds.value = new Set(newIds);
        setTimeout(() => {
          insertingPhotoIds.value = new Set();
        }, 600);
      }
      activePlaceholderIndex.value = null;
      isPlaceholderLoading.value = false;
    }

    localPhotos.value = photosToDisplay;
  },
  { immediate: true, deep: true },
);

// ── Hover / plus-button visibility ────────────────────────────────────────
const shouldShowPlus = (gapIndex) => {
  if (activePlaceholderIndex.value !== null) return false;
  if (hoveredGapIndex.value === gapIndex) return true;
  if (hoveredPhotoIndex.value !== null) {
    return (
      gapIndex === hoveredPhotoIndex.value ||
      gapIndex === hoveredPhotoIndex.value + 1
    );
  }
  return false;
};

// ── Drag & reordering ───────────────────────────────────────────────────────
const onDragEnd = () => {
  const newOrder = realPhotos.value.map((photo, index) => ({
    photoId: photo.id,
    order: index,
  }));
  emit("reorder", newOrder);
  emit("photos-updated", [...realPhotos.value]);
};

const removePhoto = (photo) => emit("remove-photo", photo.id);
const handlePhotoSelect = (photoId) => emit("select-photo", photoId);
const handleRefreshSuggestion = (photoId) =>
  emit("refresh-suggestion", photoId);
const handleShowInfo = (photoId) => emit("show-info", photoId);

// ── Placeholder flow ────────────────────────────────────────────────────────
const createPlaceholder = (gapIndex) => {
  activePlaceholderIndex.value = gapIndex;
};
const closePlaceholder = () => {
  activePlaceholderIndex.value = null;
  isPlaceholderLoading.value = false;
};
const handlePlaceholderAdd = () => {
  emit("add-photos-at", activePlaceholderIndex.value);
};
const handlePlaceholderSuggest = (criteria) => {
  isPlaceholderLoading.value = true;
  emit("suggest-photo-at", {
    insertIndex: activePlaceholderIndex.value,
    criteria,
  });
};
// ── Scroll direction, so the view header can collapse on the way down ───────
// This grid is the surface that actually scrolls, so it is the one that can
// tell the view which way the user is going. Measuring its height here (rather
// than capping it in CSS) lets it grow into the room a collapsed header frees.
const scrollAreaRef = ref(null);
const scrollAreaHeight = ref(null);
let wheelCollapseHandler = null;

// Enough overflow that collapsing the header can't remove it and start a
// hide/show flicker. Only gates collapsing: revealing must always work, since
// once the area has grown into the header's room the overflow may be gone.
const MIN_OVERFLOW_TO_TOGGLE_HEADER = 220;
// Scrolling up this far in one run brings the header back, wherever we are.
const REVEAL_DELTA = 48;
// Collapsing grows this area and the browser trims scrollTop to compensate,
// which reads as an upward scroll nobody performed — only ever at the bottom.
const BOTTOM_PIN_TOLERANCE = 4;

const collapsed = ref(false);
let lastScrollTop = 0;
let scrollDirection = null;
let directionRunAnchor = 0;

const updateScrollAreaHeight = () => {
  const el = scrollAreaRef.value;
  if (!el) return;
  const bottomGap = 24;
  const available =
    window.innerHeight - el.getBoundingClientRect().top - bottomGap;
  scrollAreaHeight.value = Math.max(Math.round(available), 200);
};

const handleScroll = () => {
  const el = scrollAreaRef.value;
  if (!el) return;
  const scrollTop = el.scrollTop;
  if (Math.abs(scrollTop - lastScrollTop) <= 5) return;

  const direction = scrollTop > lastScrollTop ? "down" : "up";
  if (direction !== scrollDirection) {
    scrollDirection = direction;
    directionRunAnchor = lastScrollTop;
  }

  const overflow = el.scrollHeight - el.clientHeight;
  const pinnedToBottom = scrollTop >= overflow - BOTTOM_PIN_TOLERANCE;
  if (direction === "up" && pinnedToBottom) directionRunAnchor = scrollTop;

  if (direction === "down") {
    if (overflow > MIN_OVERFLOW_TO_TOGGLE_HEADER) collapsed.value = true;
  } else if (
    !pinnedToBottom &&
    (scrollTop <= 0 || Math.abs(scrollTop - directionRunAnchor) > REVEAL_DELTA)
  ) {
    collapsed.value = false;
  }
  emit("scroll-direction", {
    direction,
    scrollTop,
    collapsed: collapsed.value,
  });
  lastScrollTop = scrollTop;
};

// The parent snaps its header back when the series changes; keep our flag in
// step or the next scroll would hide it again.
watch(
  () => props.seriesId,
  () => {
    collapsed.value = false;
    lastScrollTop = 0;
    scrollDirection = null;
    directionRunAnchor = 0;
  },
);

onMounted(() => {
  window.addEventListener("resize", updateScrollAreaHeight);
  nextTick(() => {
    updateScrollAreaHeight();
    const el = scrollAreaRef.value;
    if (!el) return;
    updateColumnCount();
    gridResizeObserver = new ResizeObserver(updateColumnCount);
    gridResizeObserver.observe(el);
    el.addEventListener("scroll", handleScroll, { passive: true });
    // Collapse on the first downward gesture, before the browser scrolls, so
    // the header gives way without the photos moving first. And when we are
    // back at the top an upward gesture fires no scroll event at all, so the
    // reveal has to be caught here too.
    wheelCollapseHandler = (event) => {
      if (event.deltaY > 0 && !collapsed.value) {
        const overflow = el.scrollHeight - el.clientHeight;
        if (overflow <= MIN_OVERFLOW_TO_TOGGLE_HEADER) return;
        event.preventDefault();
        collapsed.value = true;
        emit("scroll-direction", {
          direction: "down",
          scrollTop: el.scrollTop,
          collapsed: true,
        });
      } else if (event.deltaY < 0 && collapsed.value && el.scrollTop === 0) {
        collapsed.value = false;
        emit("scroll-direction", {
          direction: "up",
          scrollTop: 0,
          collapsed: false,
        });
      }
    };
    el.addEventListener("wheel", wheelCollapseHandler, { passive: false });
  });
});

onUnmounted(() => {
  clearTimeout(sizeFlipTimer);
  sizeFlipElements = [];
  gridResizeObserver?.disconnect();
  gridResizeObserver = null;
  window.removeEventListener("resize", updateScrollAreaHeight);
  scrollAreaRef.value?.removeEventListener("scroll", handleScroll);
  if (wheelCollapseHandler) {
    scrollAreaRef.value?.removeEventListener("wheel", wheelCollapseHandler);
    wheelCollapseHandler = null;
  }
});
</script>

<style scoped>
.series-photo-grid-scroll {
  /* Sin max-height: la altura la mide el JS de arriba contra el viewport, y un
     tope fijo impediria que el area creciera al replegarse el header. */
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  /* Sangra en el gutter de .view-container: las fotos quedan alineadas con
     los controles y los "+" de los bordes viven en el margen de la pagina.
     Al ser overflow-y: auto, el eje X tambien recorta, asi que los botones
     tienen que caber dentro de este padding. */
  --sp-bleed: var(--spacing-lg);
  margin: 0 calc(-1 * var(--sp-bleed));
  padding: 0 var(--sp-bleed);
}

@media (max-width: 480px) {
  .series-photo-grid-scroll {
    --sp-bleed: var(--spacing-md);
  }
}

.series-photo-grid-scroll::-webkit-scrollbar {
  width: 8px;
}
.series-photo-grid-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.series-photo-grid-scroll::-webkit-scrollbar-thumb {
  background: #404045;
  border-radius: 4px;
}
.series-photo-grid-scroll::-webkit-scrollbar-thumb:hover {
  background: #505055;
}

/* ── Grid layout ─────────────────────────────────────────────────────────
   `auto-fill` computes how many columns of at least --sp-photo-size fit,
   then every column stretches equally so the last one ends flush with the
   right edge. The cards inside are forced to fill their cell (see below). */
.sp-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(var(--sp-photo-size), 1fr)
  );
  column-gap: var(--sp-gap);
  row-gap: var(--sp-gap);
  padding: 0 0 15px;
  align-content: flex-start;
  user-select: none;
  min-height: 200px;
}

/* Normal cell: one grid column. */
.sp-cell {
  min-width: 0;
  align-self: start;
}

/* When a placeholder is active on this cell, the wrapper becomes
   `display: contents` so that its two children (placeholder + photo slot)
   become direct grid children. Each occupies a single column, exactly like
   a regular photo cell, and the grid reflows the rest of the photos
   naturally — no row jumps, no full-row takeovers, no "todo salta". */
.sp-cell--splits {
  display: contents;
}

/* A placeholder rendered as a grid cell (either inline between photos or
   at the end of the list in the footer slot). Same width as a photo cell
   so the grid treats it identically. */
.sp-placeholder-cell {
  min-width: 0;
  align-self: start;
}

/* The photo slot is a stable-width wrapper that anchors the "+" overlays to
   the photo card itself. It is also the element that acts as a grid cell
   when its parent is in `display: contents` mode. */
.sp-photo-slot {
  position: relative;
  min-width: 0;
  align-self: start;
}

/* The cards size themselves in px from the `size` prop (inline style); here
   they must follow the fluid cell instead, keeping the 1:1 ratio. */
.sp-photo-slot :deep(.photo-sequence-card),
.sp-photo-slot :deep(.placeholder-photo-card),
.sp-placeholder-cell {
  /* The card is content-box, so its 2px border would spill outside the cell
     and push the visible edge 4px past the slot the "+" is anchored to. */
  box-sizing: border-box;
  width: 100% !important;
  min-width: 0 !important;
  height: auto !important;
  aspect-ratio: 1;
}

/* ── Insertion "+" overlays ──────────────────────────────────────────────
   Exactly ONE button per gap, centered in the column-gap. The right-"+"
   of photo k covers gap k+1; the left-"+" of photo 0 covers gap 0. The
   buttons at both edges of a row have no gap to sit in (only the 16px
   bleed of the scroll area), so they center on the photo edge instead.

   The button is flex-centered inside an anchor box that spans the gap, not
   offset with translate(-50%): the 1fr columns have fractional widths and
   Chrome paints a transformed element at that fractional position with
   antialiasing while the neighbouring cards snap to whole pixels, which
   read as the "+" drifting half a pixel to one side. */
.sp-plus-anchor {
  position: absolute;
  top: 0;
  left: 100%;
  width: var(--sp-gap);
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: none;
}

.sp-plus-anchor--edge {
  left: calc(100% - var(--sp-gap) / 2);
}

.sp-plus-anchor--leading {
  left: calc(-1 * var(--sp-gap) / 2);
}

.sp-plus {
  pointer-events: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s ease;
}

/* Invisible overlay that extends into the right column-gap so hovering the
   gap between two photos triggers gap hover state and reveals the "+" buttons
   on both sides of the gap (same technique as SeriesPhotoStrip). */
.sp-gap-zone {
  position: absolute;
  top: 0;
  right: calc(-1 * var(--sp-gap));
  width: var(--sp-gap);
  height: 100%;
  z-index: 4;
}

.sp-plus:hover {
  transform: scale(1.1);
}

/* ── Drag states ─────────────────────────────────────────────────────── */
.drag-disabled :deep(.photo-sequence-card) {
  pointer-events: none;
  cursor: not-allowed !important;
}

.drag-ghost {
  opacity: 0.5;
}
.drag-ghost :deep(.photo-sequence-card) {
  background: rgba(37, 99, 235, 0.1) !important;
  border: 2px dashed var(--primary-color, #2563eb) !important;
}
.drag-chosen :deep(.photo-sequence-card) {
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.3);
}
.drag-active {
  opacity: 0.8;
}

/* ── Insertion animation ─────────────────────────────────────────────── */
:deep(.photo-sequence-card.inserting) {
  animation: sp-slide-in 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes sp-slide-in {
  0% {
    opacity: 0;
    transform: translateX(-20px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}
</style>
