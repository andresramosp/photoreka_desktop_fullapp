<template>
  <div class="series-photo-grid-scroll">
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
          <div class="sp-photo-slot" :style="photoSlotStyle">
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
              :can-move-left="index > 0"
              :can-move-right="index < realPhotos.length - 1"
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
              @move="(dir) => handleMove(index, dir)"
              @select="handlePhotoSelect"
              @show-info="handleShowInfo"
              @refresh-suggestion="handleRefreshSuggestion(photo.id)"
            />

            <!-- Left "+": ONLY rendered for the very first photo, to cover
                 gap 0 (the leading gap). For every other gap we rely on the
                 right-"+" of the previous photo, so each gap has exactly
                 ONE button. -->
            <n-button
              v-if="index === 0 && shouldShowPlus(0)"
              class="sp-plus sp-plus-left"
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

            <n-button
              v-if="shouldShowPlus(index + 1)"
              class="sp-plus sp-plus-right"
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
import { ref, computed, watch } from "vue";
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
  "move-photo",
  "photos-updated",
  "select-photo",
  "show-info",
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

// Size / layout style passed to the grid and photo slots. Using CSS grid with
// fixed-width columns guarantees every cell is the same width, so flex-wrap
// edge cases simply cannot happen.
const gridStyle = computed(() => ({
  "--sp-photo-size": `${props.photoSize}px`,
}));

const photoSlotStyle = computed(() => ({
  width: `${props.photoSize}px`,
  minWidth: `${props.photoSize}px`,
}));

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

const handleMove = (index, direction) => {
  if (direction === "left") {
    if (index === 0) return;
    const list = [...realPhotos.value];
    const [moved] = list.splice(index, 1);
    list.splice(index - 1, 0, moved);
    localPhotos.value = list;
    emit("move-photo", moved.id, index - 1);
    emit("photos-updated", list);
  } else if (direction === "right") {
    if (index >= realPhotos.value.length - 1) return;
    const list = [...realPhotos.value];
    const [moved] = list.splice(index, 1);
    list.splice(index + 1, 0, moved);
    localPhotos.value = list;
    emit("move-photo", moved.id, index + 1);
    emit("photos-updated", list);
  }
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
</script>

<style scoped>
.series-photo-grid-scroll {
  max-height: calc(100vh - 260px);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
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
   Fixed-width columns. `auto-fill` computes how many columns fit in the
   available width and never resizes them, so the row wrapping is always
   balanced. */
.sp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--sp-photo-size));
  /* One "+" button per gap, centered in the gap. The button is ~22px wide
     and the gap is 34px, so it sits with ~6px of air on each side. */
  column-gap: 34px;
  row-gap: 34px;
  padding: 0 40px 15px;
  justify-content: flex-start;
  align-content: flex-start;
  user-select: none;
  min-height: 200px;
}

/* Normal cell: one grid column, photo-sized. */
.sp-cell {
  width: var(--sp-photo-size);
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
  width: var(--sp-photo-size);
  align-self: start;
}

/* The photo slot is a stable-width wrapper that anchors the "+" overlays to
   the photo card itself. It is also the element that acts as a grid cell
   when its parent is in `display: contents` mode. */
.sp-photo-slot {
  position: relative;
  width: var(--sp-photo-size);
  align-self: start;
}

/* ── Insertion "+" overlays ──────────────────────────────────────────────
   Exactly ONE button per gap, centered in the column-gap. The right-"+"
   of photo k covers gap k+1; the left-"+" of photo 0 covers gap 0. With a
   34px column-gap and a ~22px button, centering means offsetting the
   button by (gap/2 + button/2) ≈ 28px outside the photo edge, so its
   center lands on the gap's midline. */
.sp-plus {
  position: absolute;
  top: 50%;
  z-index: 5;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s ease;
}

/* Left-"+" only used for gap 0 (before the first photo). It sits centered
   in the leading padding, half the column-gap distance outside the photo. */
.sp-plus-left {
  left: -18px; /* -column-gap / 2 */
}

/* Right-"+" sits centered in the gap to the right of this photo. */
.sp-plus-right {
  left: calc(100% + 18px); /* 100% + column-gap / 2 */
}

/* Invisible overlay that extends into the right column-gap so hovering the
   gap between two photos triggers gap hover state and reveals the "+" buttons
   on both sides of the gap (same technique as SeriesPhotoStrip). */
.sp-gap-zone {
  position: absolute;
  top: 0;
  right: -32px;
  width: 32px;
  height: 100%;
  z-index: 4;
}

.sp-plus:hover {
  transform: translate(-50%, -50%) scale(1.1);
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
