<template>
  <div
    class="series-photo-strip"
    :class="[`size-${photoSize}`, `view-${viewMode}`]"
  >
    <!-- Size Controls -->
    <div class="strip-controls">
      <div class="strip-controls-left">
        <span class="size-label">Size:</span>
        <n-button-group size="small">
          <n-button
            v-for="size in sizeOptions"
            :key="size.value"
            :type="photoSize === size.value ? 'primary' : 'default'"
            @click="setPhotoSize(size.value)"
          >
            {{ size.label }}
          </n-button>
        </n-button-group>

        <!-- View Mode Toggle -->
        <span class="size-label view-label">View:</span>
        <n-button-group size="small">
          <n-button
            :type="viewMode === 'grid' ? 'primary' : 'default'"
            @click="setViewMode('grid')"
            title="Grid view"
          >
            <template #icon>
              <n-icon><GridOutline /></n-icon>
            </template>
            Grid
          </n-button>
          <n-button
            :type="viewMode === 'strip' ? 'primary' : 'default'"
            @click="setViewMode('strip')"
            title="Strip view"
          >
            <template #icon>
              <n-icon><ReorderFourOutline /></n-icon>
            </template>
            Strip
          </n-button>
        </n-button-group>

        <!-- Select All Button -->
        <n-button
          size="small"
          :type="allSelected ? 'primary' : 'default'"
          @click="handleSelectAllToggle"
          class="select-all-btn"
        >
          {{ allSelected ? "Deselect All" : "Select All" }}
        </n-button>
      </div>

      <!-- Undo / Discard / Save -->
      <div v-if="!isPublicView" class="strip-controls-right">
        <n-button
          v-if="canUndo && !isSaving"
          size="small"
          @click="$emit('undo')"
          title="Undo last removal"
        >
          <template #icon>
            <n-icon><ArrowUndoOutline /></n-icon>
          </template>
          Undo
        </n-button>
        <n-button
          v-if="hasChanges"
          size="small"
          type="primary"
          ghost
          :loading="isSaving"
          @click="$emit('save')"
        >
          <template #icon>
            <n-icon><SaveOutline /></n-icon>
          </template>
          Save
        </n-button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!photos || photos.length === 0" class="empty-strip">
      <n-empty description="No photos in this series yet">
        <template #extra>
          <n-button type="primary" @click="$emit('add-photos')">
            <template #icon>
              <n-icon><AddOutline /></n-icon>
            </template>
            Add Photos
          </n-button>
        </template>
      </n-empty>
    </div>

    <!-- GRID VIEW: dedicated component. CSS Grid with fixed-width columns
         guarantees a stable multi-row layout with exactly one "+" per gap
         and a placeholder that never disturbs the surrounding rows. -->
    <SeriesPhotoGrid
      v-else-if="viewMode === 'grid'"
      :photos="photos"
      :series-id="seriesId"
      :selected-photo-ids="selectedPhotoIds"
      :suggested-photos-info="suggestedPhotosInfo"
      :refreshing-photo-id="refreshingPhotoId"
      :photo-size="currentSize"
      @add-photos-at="(i) => $emit('add-photos-at', i)"
      @suggest-photo-at="(p) => $emit('suggest-photo-at', p)"
      @refresh-suggestion="(id) => $emit('refresh-suggestion', id)"
      @remove-photo="(id) => $emit('remove-photo', id)"
      @reorder="(o) => $emit('reorder', o)"
      @move-photo="(id, i) => $emit('move-photo', id, i)"
      @photos-updated="(list) => $emit('photos-updated', list)"
      @select-photo="(id) => $emit('select-photo', id)"
      @show-info="(id) => $emit('show-info', id)"
    />

    <!-- STRIP VIEW: horizontal single-row strip with inline gap buttons. -->
    <div
      v-else
      ref="scrollContainer"
      class="strip-scrollbar"
      @wheel="handleHorizontalScroll"
    >
      <draggable
        v-model="realPhotos"
        class="photo-strip"
        :class="{ 'drag-disabled': activePlaceholderIndex !== null }"
        item-key="id"
        :disabled="activePlaceholderIndex !== null"
        ghost-class="drag-ghost"
        chosen-class="drag-chosen"
        drag-class="drag-active"
        animation="200"
        @end="onDragEnd"
      >
        <template #header>
          <!-- Placeholder at position 0 -->
          <div
            v-if="activePlaceholderIndex === 0"
            class="strip-item placeholder-item"
          >
            <div class="insertion-gap placeholder-gap"></div>
            <PlaceholderPhotoCard
              :size="currentSize"
              :suggestion-criteria-options="suggestionCriteriaOptions"
              :is-loading="isPlaceholderLoading"
              @add="handlePlaceholderAdd"
              @close="closePlaceholder"
              @suggest="handlePlaceholderSuggest"
            />
            <div class="insertion-gap placeholder-gap"></div>
          </div>

          <!-- Gap for position 0 when no placeholder -->
          <div
            v-else
            class="insertion-gap"
            @mouseenter="hoveredGapIndex = 0"
            @mouseleave="hoveredGapIndex = null"
            @mousedown.stop
          >
            <n-button
              v-if="shouldShowPlus(0)"
              class="gap-plus"
              size="tiny"
              circle
              type="primary"
              @click.stop="createPlaceholder(0)"
              @mousedown.stop
              aria-label="Insert photo here"
            >
              <template #icon>
                <n-icon>
                  <AddCircleOutline />
                </n-icon>
              </template>
            </n-button>
          </div>
        </template>
        <template #item="{ element: photo, index }">
          <div class="photo-item-container">
            <!-- Loading Placeholder when refreshing -->
            <template v-if="isPhotoRefreshing(photo.id)">
              <PlaceholderPhotoCard
                :size="currentSize"
                :suggestion-criteria-options="suggestionCriteriaOptions"
                :is-loading="true"
                @add="() => {}"
                @close="() => {}"
                @suggest="() => {}"
              />
            </template>
            <!-- Photo Card -->
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
              :size="currentSize"
              :order-number="index + 1"
              :class="{ inserting: insertingPhotoIds.has(photo.id) }"
              :is-suggested="!!suggestedPhotosInfo[photo.id]"
              :suggestion-criteria="suggestedPhotosInfo[photo.id]?.criteria"
              @remove="removePhoto(photo)"
              @move="(dir) => handleMove(index, dir)"
              @select="handlePhotoSelect"
              @show-info="handleShowInfo"
              @refresh-suggestion="handleRefreshSuggestion(photo.id)"
              @mouseenter="hoveredPhotoIndex = index"
              @mouseleave="hoveredPhotoIndex = null"
            />

            <!-- Trailing gap AFTER this photo (position = index + 1). -->
            <template v-if="activePlaceholderIndex === index + 1">
              <div class="insertion-gap placeholder-gap"></div>
              <PlaceholderPhotoCard
                :size="currentSize"
                :suggestion-criteria-options="suggestionCriteriaOptions"
                :is-loading="isPlaceholderLoading"
                @add="handlePlaceholderAdd"
                @close="closePlaceholder"
                @suggest="handlePlaceholderSuggest"
              />
              <div class="insertion-gap placeholder-gap"></div>
            </template>

            <!-- Regular gap when no placeholder -->
            <div
              v-else
              class="insertion-gap"
              @mouseenter="hoveredGapIndex = index + 1"
              @mouseleave="hoveredGapIndex = null"
              @mousedown.stop
            >
              <n-button
                v-if="shouldShowPlus(index + 1)"
                class="gap-plus"
                size="tiny"
                circle
                type="info"
                @click.stop="createPlaceholder(index + 1)"
                @mousedown.stop
                aria-label="Insert photo here"
              >
                <template #icon>
                  <n-icon>
                    <AddCircleOutline />
                  </n-icon>
                </template>
              </n-button>
            </div>
          </div>
        </template>
      </draggable>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { NButton, NButtonGroup, NIcon, NEmpty, NSelect } from "naive-ui";
import {
  AddOutline,
  AddCircleOutline,
  ArrowUndoOutline,
  CloseOutline,
  GridOutline,
  ReorderFourOutline,
  SaveOutline,
} from "@vicons/ionicons5";
import draggable from "vuedraggable";
import PhotoSequenceCard from "@/components/PhotoSequenceCard.vue";
import PlaceholderPhotoCard from "@/components/PlaceholderPhotoCard.vue";
import SeriesPhotoGrid from "@/components/SeriesPhotoGrid.vue";

const props = defineProps({
  photos: {
    type: Array,
    default: () => [],
  },
  seriesId: {
    type: [String, Number],
    required: true,
  },
  selectedPhotoIds: {
    type: Array,
    default: () => [],
  },
  suggestedPhotosInfo: {
    type: Object,
    default: () => ({}),
  },
  refreshingPhotoId: {
    type: [String, Number],
    default: null,
  },
  canUndo: {
    type: Boolean,
    default: false,
  },
  hasChanges: {
    type: Boolean,
    default: false,
  },
  isSaving: {
    type: Boolean,
    default: false,
  },
  isPublicView: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "add-photos",
  "add-photos-at",
  "suggest-photo-at",
  "refresh-suggestion",
  "remove-photo",
  "reorder",
  "move-photo",
  "photos-updated",
  "select-photo",
  "show-info",
  "undo",
  "save",
]);

// Size options
const sizeOptions = [
  { label: "S", value: "small" },
  { label: "M", value: "medium" },
  { label: "L", value: "large" },
];

const photoSize = ref("medium");

// View mode: 'strip' (horizontal scroll, one row) or 'grid' (multi-row, wraps)
const viewMode = ref("grid");
const setViewMode = (mode) => {
  viewMode.value = mode;
};

// Select all state
const allSelected = ref(false);

// Hover and insertion UI state
const hoveredGapIndex = ref(null);
const hoveredPhotoIndex = ref(null);
const activePlaceholderIndex = ref(null);
const isPlaceholderLoading = ref(false);

// Animation state for newly inserted photos
const insertingPhotoIds = ref(new Set());
const lastInsertIndex = ref(null);
const isFirstLoad = ref(true);

const suggestionCriteriaOptions = [
  { label: "General", value: "embedding" },
  { label: "Context", value: "context" },
  { label: "Narrative", value: "story" },
  { label: "Visual accents", value: "visual_accents" },
  { label: "Chromatic", value: "chromatic" },
];

// Local copy of photos for drag & drop (including placeholders)
const localPhotos = ref([]);

// Helper to identify placeholders
const isPlaceholder = (item) => item && item.isPlaceholder === true;

// Computed: only real photos for draggable
const realPhotos = computed({
  get: () => localPhotos.value.filter((p) => !isPlaceholder(p)),
  set: (newValue) => {
    // When drag ends, update localPhotos maintaining placeholder position
    if (activePlaceholderIndex.value !== null) {
      const result = [...newValue];
      result.splice(
        activePlaceholderIndex.value,
        0,
        localPhotos.value.find(isPlaceholder),
      );
      localPhotos.value = result;
    } else {
      localPhotos.value = newValue;
    }
  },
});

// Reference to scroll container for horizontal wheel scroll
const scrollContainer = ref(null);

// Computed: Check if a photo is being refreshed
const isPhotoRefreshing = (photoId) => {
  return props.refreshingPhotoId === photoId;
};

// Watch for external photos changes
watch(
  () => props.photos,
  (newPhotos, oldPhotos) => {
    const newPhotosList = newPhotos || [];
    const oldPhotosList = oldPhotos || [];

    // If a photo is being refreshed, keep it in localPhotos even if removed from props
    let photosToDisplay = [...newPhotosList];

    if (props.refreshingPhotoId) {
      // Check if the refreshing photo is missing from newPhotos but exists in oldPhotos
      const refreshingPhotoExists = newPhotosList.some(
        (p) => p.id === props.refreshingPhotoId,
      );
      if (!refreshingPhotoExists && oldPhotosList) {
        const refreshingPhoto = oldPhotosList.find(
          (p) => p.id === props.refreshingPhotoId,
        );
        if (refreshingPhoto) {
          // Find the position where it should be inserted (maintain its original position)
          const originalIndex = oldPhotosList.findIndex(
            (p) => p.id === props.refreshingPhotoId,
          );
          photosToDisplay.splice(originalIndex, 0, refreshingPhoto);
        }
      }
    }

    // If there's an active placeholder and photos changed, it means a photo was added
    if (
      activePlaceholderIndex.value !== null &&
      photosToDisplay.length > oldPhotosList.length
    ) {
      // Remove placeholder and replace with real photo
      const realPhotos = photosToDisplay.filter((p) => !isPlaceholder(p));

      // Mark new photos for animation
      const newPhotoIds = realPhotos
        .filter((p) => !oldPhotosList.some((op) => op.id === p.id))
        .map((p) => p.id);

      if (newPhotoIds.length > 0) {
        insertingPhotoIds.value = new Set(newPhotoIds);

        // Clear animation state after animation completes
        setTimeout(() => {
          insertingPhotoIds.value = new Set();
        }, 600);
      }

      // Clear placeholder state
      activePlaceholderIndex.value = null;
      isPlaceholderLoading.value = false;
    }

    // Detect newly added photos (only after first load)
    if (!isFirstLoad.value && photosToDisplay.length > oldPhotosList.length) {
      const newPhotoIds = photosToDisplay
        .filter((p) => !oldPhotosList.some((op) => op.id === p.id))
        .map((p) => p.id);

      if (newPhotoIds.length > 0) {
        // Determine if added at the end
        const lastNewPhotoId = photosToDisplay[photosToDisplay.length - 1]?.id;
        const wasAddedAtEnd = newPhotoIds.includes(lastNewPhotoId);

        // Only scroll if photos were added at the end
        if (wasAddedAtEnd) {
          lastInsertIndex.value = photosToDisplay.length - 1;

          // Scroll to the last added photo after a brief delay
          setTimeout(() => {
            scrollToPhoto(lastInsertIndex.value);
          }, 100);
        }
      }
    }

    // Mark first load as complete
    if (isFirstLoad.value) {
      isFirstLoad.value = false;
    }

    localPhotos.value = [...photosToDisplay];
  },
  { immediate: true, deep: true },
);

// Size configurations
const sizeConfig = {
  small: { width: 185, maxNameLength: 12 },
  medium: { width: 340, maxNameLength: 20 },
  large: { width: 470, maxNameLength: 30 },
};

const currentSize = computed(() => sizeConfig[photoSize.value].width);
const maxNameLength = computed(() => sizeConfig[photoSize.value].maxNameLength);

// Methods
const setPhotoSize = (size) => {
  photoSize.value = size;
};

const removePhoto = (photo) => {
  emit("remove-photo", photo.id);
};

const handleMove = (index, direction) => {
  if (direction === "left") {
    movePhotoLeft(index);
  } else if (direction === "right") {
    movePhotoRight(index);
  }
};

const movePhotoLeft = (index) => {
  if (index === 0) return;

  const photos = realPhotos.value;
  // Swap locally
  const temp = photos[index];
  const newPhotos = [...photos];
  newPhotos.splice(index, 1);
  newPhotos.splice(index - 1, 0, temp);
  localPhotos.value = newPhotos;

  // Emit event to update in backend
  emit("move-photo", temp.id, index - 1);
  // Emit updated photos array
  emit("photos-updated", newPhotos);
};

const movePhotoRight = (index) => {
  const photos = realPhotos.value;
  if (index === photos.length - 1) return;

  // Swap locally
  const temp = photos[index];
  const newPhotos = [...photos];
  newPhotos.splice(index, 1);
  newPhotos.splice(index + 1, 0, temp);
  localPhotos.value = newPhotos;

  // Emit event to update in backend
  emit("move-photo", temp.id, index + 1);
  // Emit updated photos array
  emit("photos-updated", newPhotos);
};

const onDragEnd = () => {
  // Build the new order array from real photos only
  const newOrder = realPhotos.value.map((photo, index) => ({
    photoId: photo.id,
    order: index,
  }));

  emit("reorder", newOrder);
  // Emit updated photos array
  emit("photos-updated", [...realPhotos.value]);
};

const handleHorizontalScroll = (event) => {
  if (!scrollContainer.value) return;
  // In grid mode, allow native vertical scroll behavior.
  if (viewMode.value === "grid") return;

  event.preventDefault();
  scrollContainer.value.scrollLeft += event.deltaY;
};

const handlePhotoSelect = (photoId) => {
  emit("select-photo", photoId);
};

const handleRefreshSuggestion = (photoId) => {
  emit("refresh-suggestion", photoId);
};

const shouldShowPlus = (gapIndex) => {
  // Don't show plus if there's already a placeholder
  if (activePlaceholderIndex.value !== null) return false;
  // Show plus when hovering over this specific gap or adjacent photo
  if (hoveredGapIndex.value === gapIndex) return true;
  // Show if hovering over a photo and this is an adjacent gap
  if (hoveredPhotoIndex.value !== null) {
    return (
      gapIndex === hoveredPhotoIndex.value ||
      gapIndex === hoveredPhotoIndex.value + 1
    );
  }
  return false;
};

const createPlaceholder = (gapIndex) => {
  // Just mark the position where placeholder should appear
  activePlaceholderIndex.value = gapIndex;
};

const closePlaceholder = () => {
  // Clear placeholder state
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

// Method to scroll to a specific photo by index
const scrollToPhoto = (photoIndex) => {
  // In grid mode the layout is vertical; no horizontal scrolling needed.
  if (viewMode.value === "grid") return;
  if (!scrollContainer.value || photoIndex === null || photoIndex === undefined)
    return;

  // Calculate approximate position of the photo
  // Each photo has width + gap (28px)
  const photoWidth = sizeConfig[photoSize.value].width;
  const gapWidth = 28;
  const scrollPosition = photoIndex * (photoWidth + gapWidth);

  // Scroll with smooth behavior
  scrollContainer.value.scrollTo({
    left: scrollPosition,
    behavior: "smooth",
  });
};

const handleShowInfo = (photoId) => {
  console.log(
    "[SeriesPhotoStrip] handleShowInfo called with photoId:",
    photoId,
  );
  emit("show-info", photoId);
  console.log("[SeriesPhotoStrip] show-info event emitted");
};

const handleSelectAllToggle = () => {
  if (allSelected.value) {
    // Deselect all - emit event for each photo to deselect
    allSelected.value = false;
    realPhotos.value.forEach((photo) => {
      emit("select-photo", photo.id);
    });
  } else {
    // Select all real photos
    allSelected.value = true;
    realPhotos.value.forEach((photo) => {
      emit("select-photo", photo.id);
    });
  }
};
</script>

<style scoped>
.series-photo-strip {
  width: 100%;
}

.strip-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.strip-controls-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.strip-controls-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.size-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.strip-scrollbar {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.strip-scrollbar::-webkit-scrollbar {
  height: 8px;
}

.strip-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.strip-scrollbar::-webkit-scrollbar-thumb {
  background: #404045;
  border-radius: 4px;
}

.strip-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #505055;
}

.photo-strip {
  display: flex;
  min-height: 200px;
  padding: 0 10px 15px;
  user-select: none;
}

.photo-item-container {
  display: flex;
  align-items: stretch;
}

/* Disable pointer events only for photos when placeholder is active */
.photo-strip.drag-disabled :deep(.photo-sequence-card) {
  pointer-events: none;
  cursor: not-allowed !important;
}

/* Animation for newly inserted photos */
:deep(.photo-sequence-card.inserting) {
  animation: slideIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideIn {
  0% {
    opacity: 0;
    transform: translateX(-20px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

.insertion-gap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  position: relative;
  width: 28px;
  align-self: stretch;
}

.insertion-gap.placeholder-gap {
  /* Gap after placeholder - no button, just spacing */
  pointer-events: none;
}

.placeholder-item {
  display: flex;
  align-items: center;
  gap: 0;
}

.gap-plus {
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.gap-plus:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
}

.empty-strip {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  background: var(--bg-surface);
  border: 2px dashed var(--border-color);
  border-radius: 12px;
}

/* Drag States */
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

/* Responsive */
@media (max-width: 768px) {
  .strip-controls {
    flex-direction: column;
    align-items: flex-start;
  }

  .photo-strip {
    padding: 12px;
  }
}
</style>
