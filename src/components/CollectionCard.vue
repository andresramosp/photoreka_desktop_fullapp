<template>
  <div
    class="action-card"
    :class="{
      'is-dragging': isDragging,
      'is-selected': isSelected,
      'is-selection-mode': isSelectionMode,
    }"
    draggable="true"
    @click="handleClick"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
  >
    <!-- Selection circle (Google Photos style) -->
    <button
      v-if="selectable"
      class="selection-circle"
      :class="{ 'is-checked': isSelected }"
      @click.stop="handleCircleClick"
      :aria-label="isSelected ? 'Deselect collection' : 'Select collection'"
      tabindex="0"
    >
      <svg v-if="isSelected" viewBox="0 0 24 24" class="check-icon">
        <path
          fill="currentColor"
          d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
        />
      </svg>
    </button>
    <div class="card-preview">
      <!-- Series Preview: Sequential photos with numbers -->
      <div
        v-if="type === 'series' && item.photos && item.photos.length > 0"
        class="photo-sequence"
      >
        <div
          v-for="(photo, index) in item.photos.slice(0, 3)"
          :key="photo.id"
          class="sequence-photo"
          :class="`sequence-${index + 1}`"
        >
          <img
            :src="photo.thumbnailUrl || photo.url"
            :alt="photo.title || `Photo ${index + 1}`"
            class="photo-thumbnail"
            loading="lazy"
          />
          <span class="sequence-number">{{ index + 1 }}</span>
        </div>
      </div>

      <!-- Collection Preview: Stacked photos -->
      <div v-else-if="type === 'collection'" class="photo-stack">
        <div
          v-for="(photo, index) in (item.photos || []).slice(0, 3)"
          :key="photo.id"
          class="photo-item"
          :class="`photo-${index + 1}`"
        >
          <img
            :src="photo.thumbnailUrl || photo.url"
            :alt="photo.title || 'Photo'"
            class="photo-thumbnail"
            loading="lazy"
          />
        </div>
        <!-- Show empty placeholders if less than 3 photos -->
        <div
          v-for="index in Math.max(0, 3 - (item.photos || []).length)"
          :key="`placeholder-${index}`"
          class="photo-item"
          :class="`photo-${(item.photos || []).length + index}`"
        >
          <div class="photo-placeholder-empty"></div>
        </div>
      </div>

      <!-- Empty state for series -->
      <div v-else class="empty-preview">
        <n-icon size="40" color="var(--text-primary)">
          <ListOutline v-if="type === 'series'" />
          <ImagesOutline v-else />
        </n-icon>
      </div>
    </div>
    <div class="card-info">
      <h3 class="card-title">
        {{ item.name || item.title }}
      </h3>
      <p class="card-meta">
        {{ (item.photos || []).length }} photos •
        <span v-if="showUpdateDate"
          >Updated {{ formatDate(item.updatedAt) }}</span
        >
        <span v-else>Last updated {{ formatDate(item.updatedAt) }}</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ListOutline, ImagesOutline } from "@vicons/ionicons5";

interface Photo {
  id: string;
  thumbnailUrl?: string;
  url: string;
  title?: string;
}

interface Item {
  id: string;
  name?: string;
  title?: string;
  photos?: Photo[];
  updatedAt: Date | string;
  photoCount?: number;
}

interface Props {
  item: Item;
  type: "series" | "collection";
  showUpdateDate?: boolean;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  selectedIds?: string[];
  selectable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showUpdateDate: true,
  isSelected: false,
  isSelectionMode: false,
  selectedIds: () => [],
  selectable: true,
});

const emit = defineEmits<{
  click: [item: Item, event: MouseEvent];
  "select-toggle": [item: Item];
}>();

const handleClick = (nativeEvent: MouseEvent) => {
  emit("click", props.item, nativeEvent);
};

const handleCircleClick = () => {
  emit("select-toggle", props.item);
};

import { ref } from "vue";
const isDragging = ref(false);

const onDragStart = (e: DragEvent) => {
  isDragging.value = true;
  e.dataTransfer!.effectAllowed = "move";
  if (props.isSelected && props.selectedIds.length > 1) {
    // Encode all selected IDs for multi-drag
    e.dataTransfer!.setData(
      "application/x-collection-ids",
      JSON.stringify(props.selectedIds),
    );
  } else {
    e.dataTransfer!.setData(
      "application/x-collection-id",
      String(props.item.id),
    );
  }
};

const onDragEnd = () => {
  isDragging.value = false;
};

// Format date helper
const formatDate = (date: Date | string) => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - dateObj.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return "1 day ago";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 14) {
    return "1 week ago";
  } else if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  } else if (diffDays < 60) {
    return "1 month ago";
  } else {
    return `${Math.floor(diffDays / 30)} months ago`;
  }
};
</script>

<style scoped>
.action-card {
  position: relative;
  transition: opacity 0.15s;
}

/* Selection circle */
.selection-circle {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.35);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  opacity: 0;
  transition:
    opacity 0.18s,
    background 0.18s,
    border-color 0.18s;
  backdrop-filter: blur(4px);
}

/* Show circle on hover, in selection mode, or when selected */
.action-card:hover .selection-circle,
.action-card.is-selection-mode .selection-circle,
.action-card.is-selected .selection-circle {
  opacity: 1;
}

.selection-circle.is-checked {
  background: var(--primary-color, #6366f1);
  border-color: var(--primary-color, #6366f1);
}

.check-icon {
  width: 16px;
  height: 16px;
  color: #fff;
}

.action-card.is-dragging {
  opacity: 0.4;
  cursor: grabbing;
}

.action-card.is-selected {
  outline: 2px solid var(--primary-color, #6366f1);
  outline-offset: -2px;
  background: color-mix(
    in srgb,
    var(--primary-color, #6366f1) 8%,
    var(--bg-card, #fff)
  );
}

.action-card[draggable="true"] {
  cursor: grab;
}

.card-preview {
  position: relative;
  height: 120px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Series Preview: Sequential photos */
.photo-sequence {
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.sequence-photo {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid var(--border-color);
  background-color: var(--bg-container);
}

.sequence-photo:hover {
  border-color: var(--primary-color);
}

.sequence-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sequence-number {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 10px;
  font-weight: 600;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

/* Empty preview state */
.empty-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-container);
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}

.card-info {
  text-align: center;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  font-size: 14px;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.4;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .card-preview {
    height: 100px;
    margin-bottom: 12px;
  }

  .sequence-photo {
    width: 60px;
    height: 60px;
  }

  .card-title {
    font-size: 16px;
  }

  .card-meta {
    font-size: 12px;
  }
}
</style>
