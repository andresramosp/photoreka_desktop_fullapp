<template>
  <div class="series-photo-strip">
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
        <template #item="{ element: photo, index }">
          <PhotoSequenceCard
            mode="series"
            :photo="photo"
            :can-move-left="index > 0"
            :can-move-right="index < localPhotos.length - 1"
            :draggable="true"
            :show-name="false"
            :size="currentSize"
            @remove="removePhoto(photo)"
            @move="(dir) => handleMove(index, dir)"
          />
        </template>
      </draggable>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { NButton, NButtonGroup, NIcon, NEmpty } from "naive-ui";
import { AddOutline } from "@vicons/ionicons5";
import draggable from "vuedraggable";
import PhotoSequenceCard from "@/components/PhotoSequenceCard.vue";

const props = defineProps({
  photos: {
    type: Array,
    default: () => [],
  },
  seriesId: {
    type: [String, Number],
    required: true,
  },
});

const emit = defineEmits([
  "add-photos",
  "remove-photo",
  "reorder",
  "move-photo",
  "photos-updated",
]);

// Size options
const sizeOptions = [
  { label: "S", value: "small" },
  { label: "M", value: "medium" },
  { label: "L", value: "large" },
];

const photoSize = ref("large");

// Local copy of photos for drag & drop
const localPhotos = ref([]);

// Reference to scroll container for horizontal wheel scroll
const scrollContainer = ref(null);

// Watch for external photos changes
watch(
  () => props.photos,
  (newPhotos) => {
    localPhotos.value = [...(newPhotos || [])];
  },
  { immediate: true, deep: true }
);

// Size configurations
const sizeConfig = {
  small: { width: 150, maxNameLength: 12 },
  medium: { width: 250, maxNameLength: 20 },
  large: { width: 400, maxNameLength: 30 },
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
  gap: 24px;
  min-height: 200px;
  padding-bottom: 15px;
  user-select: none;
}

/* Empty State */
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
    gap: 16px;
    padding: 12px;
  }
}
</style>
