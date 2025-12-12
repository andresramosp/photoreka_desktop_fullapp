<template>
  <div class="series-photo-strip" :class="`size-${photoSize}`">
    <!-- Size Controls -->
    <div class="strip-controls">
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

    <!-- Photo Strip -->
    <div
      v-else
      ref="scrollContainer"
      class="strip-scrollbar"
      @wheel="handleHorizontalScroll"
    >
      <draggable
        v-model="localPhotos"
        class="photo-strip"
        item-key="id"
        ghost-class="drag-ghost"
        chosen-class="drag-chosen"
        drag-class="drag-active"
        animation="200"
        @end="onDragEnd"
      >
        <template #header>
          <div
            class="insertion-gap"
            :class="{ active: isGapActive(0) }"
            @mouseenter="hoveredGapIndex = 0"
            @mouseleave="hoveredGapIndex = null"
            @mousedown.stop
          >
            <n-button
              v-if="shouldShowPlus(0)"
              class="gap-plus"
              size="tiny"
              circle
              secondary
              @click.stop="toggleGap(0)"
              @mousedown.stop
              aria-label="Insert photo here"
            >
              <template #icon>
                <n-icon>
                  <AddCircleOutline />
                </n-icon>
              </template>
            </n-button>

            <GapMenu
              :is-active="isGapActive(0)"
              :show-suggest-submenu="showSuggestSubmenu"
              :suggestion-criteria="suggestionCriteria"
              :suggestion-criteria-options="suggestionCriteriaOptions"
              @add="requestAdd(0)"
              @close="closeGap"
              @toggle-suggest="toggleSuggestSubmenu"
              @select-and-suggest="selectAndSuggest(0, $event)"
              @click.stop
              @mousedown.stop
            />
          </div>
        </template>
        <template #item="{ element: photo, index }">
          <div
            class="strip-item"
            :class="{ inserting: insertingPhotoIds.has(photo.id) }"
          >
            <PhotoSequenceCard
              mode="series"
              :photo="photo"
              :can-move-left="index > 0"
              :can-move-right="index < localPhotos.length - 1"
              :draggable="true"
              :selectable="true"
              :is-selected="selectedPhotoIds.includes(photo.id)"
              :show-name="false"
              :size="currentSize"
              @remove="removePhoto(photo)"
              @move="(dir) => handleMove(index, dir)"
              @select="handlePhotoSelect"
            />

            <div
              class="insertion-gap"
              :class="{ active: isGapActive(index + 1) }"
              @mouseenter="hoveredGapIndex = index + 1"
              @mouseleave="hoveredGapIndex = null"
              @mousedown.stop
            >
              <n-button
                v-if="shouldShowPlus(index + 1)"
                class="gap-plus"
                size="tiny"
                circle
                secondary
                @click.stop="toggleGap(index + 1)"
                @mousedown.stop
                aria-label="Insert photo here"
              >
                <template #icon>
                  <n-icon>
                    <AddCircleOutline />
                  </n-icon>
                </template>
              </n-button>

              <GapMenu
                :is-active="isGapActive(index + 1)"
                :show-suggest-submenu="showSuggestSubmenu"
                :suggestion-criteria="suggestionCriteria"
                :suggestion-criteria-options="suggestionCriteriaOptions"
                @add="requestAdd(index + 1)"
                @close="closeGap"
                @toggle-suggest="toggleSuggestSubmenu"
                @select-and-suggest="selectAndSuggest(index + 1, $event)"
                @click.stop
                @mousedown.stop
              />
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
import { AddOutline, AddCircleOutline, CloseOutline } from "@vicons/ionicons5";
import draggable from "vuedraggable";
import PhotoSequenceCard from "@/components/PhotoSequenceCard.vue";
import GapMenu from "@/components/GapMenu.vue";

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
});

const emit = defineEmits([
  "add-photos",
  "add-photos-at",
  "suggest-photo-at",
  "remove-photo",
  "reorder",
  "move-photo",
  "photos-updated",
  "select-photo",
]);

// Size options
const sizeOptions = [
  { label: "S", value: "small" },
  { label: "M", value: "medium" },
  { label: "L", value: "large" },
];

const photoSize = ref("large");

// Hover and insertion UI state
const hoveredGapIndex = ref(null);
const activeGapIndex = ref(null);
const showSuggestSubmenu = ref(false);

// Animation state for newly inserted photos
const insertingPhotoIds = ref(new Set());
const lastInsertIndex = ref(null);
const isFirstLoad = ref(true);

// Suggestion criteria (same options as GridMaker)
const suggestionCriteria = ref("story");
const suggestionCriteriaOptions = [
  { label: "Narrative", value: "story" },
  { label: "Context", value: "context" },
  { label: "General", value: "embedding" },
  { label: "Chromatic", value: "chromatic" },
];

// Local copy of photos for drag & drop
const localPhotos = ref([]);

// Reference to scroll container for horizontal wheel scroll
const scrollContainer = ref(null);

// Watch for external photos changes
watch(
  () => props.photos,
  (newPhotos, oldPhotos) => {
    const newPhotosList = newPhotos || [];
    const oldPhotosList = oldPhotos || [];

    // Detect newly added photos (only after first load)
    if (!isFirstLoad.value && newPhotosList.length > oldPhotosList.length) {
      const newPhotoIds = newPhotosList
        .filter((p) => !oldPhotosList.some((op) => op.id === p.id))
        .map((p) => p.id);

      if (newPhotoIds.length > 0) {
        // Mark new photos for animation
        insertingPhotoIds.value = new Set(newPhotoIds);

        // Determine if added at the end
        const lastNewPhotoId = newPhotosList[newPhotosList.length - 1]?.id;
        const wasAddedAtEnd = newPhotoIds.includes(lastNewPhotoId);

        // Only scroll if photos were added at the end
        if (wasAddedAtEnd) {
          lastInsertIndex.value = newPhotosList.length - 1;

          // Scroll to the last added photo after a brief delay
          setTimeout(() => {
            scrollToPhoto(lastInsertIndex.value);
          }, 100);
        }

        // Clear animation state after animation completes
        setTimeout(() => {
          insertingPhotoIds.value = new Set();
          lastInsertIndex.value = null;
        }, 600);
      }
    }

    // Mark first load as complete
    if (isFirstLoad.value) {
      isFirstLoad.value = false;
    }

    localPhotos.value = [...newPhotosList];
  },
  { immediate: true, deep: true }
);

// Size configurations
const sizeConfig = {
  small: { width: 200, maxNameLength: 12 },
  medium: { width: 350, maxNameLength: 20 },
  large: { width: 450, maxNameLength: 30 },
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

  // Swap locally
  const temp = localPhotos.value[index];
  localPhotos.value.splice(index, 1);
  localPhotos.value.splice(index - 1, 0, temp);

  // Emit event to update in backend
  emit("move-photo", temp.id, index - 1);
  // Emit updated photos array
  emit("photos-updated", [...localPhotos.value]);
};

const movePhotoRight = (index) => {
  if (index === localPhotos.value.length - 1) return;

  // Swap locally
  const temp = localPhotos.value[index];
  localPhotos.value.splice(index, 1);
  localPhotos.value.splice(index + 1, 0, temp);

  // Emit event to update in backend
  emit("move-photo", temp.id, index + 1);
  // Emit updated photos array
  emit("photos-updated", [...localPhotos.value]);
};

const onDragEnd = () => {
  // Build the new order array
  const newOrder = localPhotos.value.map((photo, index) => ({
    photoId: photo.id,
    order: index,
  }));

  emit("reorder", newOrder);
  // Emit updated photos array
  emit("photos-updated", [...localPhotos.value]);
};

const handleHorizontalScroll = (event) => {
  if (!scrollContainer.value) return;

  event.preventDefault();
  scrollContainer.value.scrollLeft += event.deltaY;
};

const handlePhotoSelect = (photoId) => {
  emit("select-photo", photoId);
};

const isGapActive = (gapIndex) => activeGapIndex.value === gapIndex;

const shouldShowPlus = (gapIndex) => {
  // When the hole is open, the plus would get cramped next to the hole content.
  // Hide it and let the hole be the only interaction.
  if (isGapActive(gapIndex)) return false;
  // Only show plus when hovering over this specific gap
  return hoveredGapIndex.value === gapIndex;
};

// Gap mantiene ancho fijo, el menú se expande con absolute positioning

const toggleGap = (gapIndex) => {
  activeGapIndex.value = activeGapIndex.value === gapIndex ? null : gapIndex;
  showSuggestSubmenu.value = false;
};

const closeGap = () => {
  activeGapIndex.value = null;
  showSuggestSubmenu.value = false;
};

const requestAdd = (insertIndex) => {
  activeGapIndex.value = null;
  emit("add-photos-at", insertIndex);
};

const toggleSuggestSubmenu = () => {
  showSuggestSubmenu.value = !showSuggestSubmenu.value;
};

const selectAndSuggest = (insertIndex, criteria) => {
  suggestionCriteria.value = criteria;
  activeGapIndex.value = null;
  showSuggestSubmenu.value = false;
  emit("suggest-photo-at", {
    insertIndex,
    criteria,
  });
};

// Method to scroll to a specific photo by index
const scrollToPhoto = (photoIndex) => {
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

watch(
  () => props.photos,
  () => {
    // If the underlying list changes, close any open hole.
    activeGapIndex.value = null;
    showSuggestSubmenu.value = false;
  },
  { deep: true }
);
</script>

<style scoped>
.series-photo-strip {
  width: 100%;
}

.strip-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
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

.strip-item {
  display: flex;
  align-items: stretch;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Animation for newly inserted photos */
.strip-item.inserting {
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
  background: #18181c;
  border: 2px dashed #2c2c32;
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
