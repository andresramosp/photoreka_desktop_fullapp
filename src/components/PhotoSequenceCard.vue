<template>
  <div
    class="photo-sequence-card"
    :class="{
      'has-photo': photo,
      'is-generating': isGenerating,
      'mode-grid': mode === 'grid',
      'mode-series': mode === 'series',
    }"
    :style="cardStyle"
  >
    <!-- Empty Cell with Add Button -->
    <template v-if="!photo">
      <div v-if="!isGenerating" class="empty-cell">
        <n-button
          circle
          size="large"
          class="add-photo-btn"
          @click="$emit('add-photo')"
        >
          <template #icon>
            <n-icon size="24">
              <AddOutline />
            </n-icon>
          </template>
        </n-button>
        <span class="cell-label">Add Photo</span>
      </div>
      <!-- Generating Skeleton -->
      <div v-else class="generating-cell">
        <n-skeleton height="100%" width="100%" />
        <div v-if="showSpinner" class="generating-overlay">
          <n-spin size="medium" />
        </div>
      </div>
    </template>

    <!-- Photo Cell -->
    <div v-else class="filled-cell">
      <!-- Order Badge (Series mode) -->
      <div v-if="mode === 'series' && orderNumber" class="order-badge">
        {{ orderNumber }}
      </div>

      <!-- Drag Handle (Series mode) -->
      <div
        v-if="mode === 'series' && draggable"
        class="drag-handle"
        title="Drag to reorder"
      >
        <n-icon size="18">
          <ReorderFour />
        </n-icon>
      </div>

      <!-- Photo Image -->
      <img
        loading="lazy"
        :src="photo.thumbnailUrl || photo.url"
        :alt="photo.name || photo.title || 'Photo'"
        class="cell-photo"
      />

      <!-- Remove Button Overlay -->
      <div class="cell-overlay">
        <n-button
          circle
          size="small"
          class="remove-photo-btn"
          @click.stop="$emit('remove')"
        >
          <template #icon>
            <n-icon><CloseOutline /></n-icon>
          </template>
        </n-button>
      </div>

      <!-- Movement Controls -->
      <div class="movement-controls">
        <!-- Up Arrow (Grid mode only) -->
        <n-button
          v-if="mode === 'grid' && canMoveUp"
          circle
          size="small"
          class="move-btn move-up"
          @click.stop="$emit('move', 'up')"
        >
          <template #icon>
            <n-icon size="16"><ChevronUpOutline /></n-icon>
          </template>
        </n-button>

        <!-- Down Arrow (Grid mode only) -->
        <n-button
          v-if="mode === 'grid' && canMoveDown"
          circle
          size="small"
          class="move-btn move-down"
          @click.stop="$emit('move', 'down')"
        >
          <template #icon>
            <n-icon size="16"><ChevronDownOutline /></n-icon>
          </template>
        </n-button>

        <!-- Left Arrow -->
        <n-button
          v-if="canMoveLeft"
          circle
          size="small"
          class="move-btn move-left"
          @click.stop="$emit('move', 'left')"
        >
          <template #icon>
            <n-icon size="16"><ChevronBackOutline /></n-icon>
          </template>
        </n-button>

        <!-- Right Arrow -->
        <n-button
          v-if="canMoveRight"
          circle
          size="small"
          class="move-btn move-right"
          @click.stop="$emit('move', 'right')"
        >
          <template #icon>
            <n-icon size="16"><ChevronForwardOutline /></n-icon>
          </template>
        </n-button>
      </div>

      <!-- Original Photo Badge (Grid mode) -->
      <div v-if="mode === 'grid' && isOriginal" class="original-photo-badge">
        <n-icon size="12"><BookmarkOutline /></n-icon>
      </div>

      <!-- Photo Name (Series mode) -->
      <div
        v-if="mode === 'series' && showName"
        class="photo-name"
        :title="photo.name"
      >
        {{ truncatedName }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NButton, NIcon, NSkeleton, NSpin } from "naive-ui";
import {
  AddOutline,
  CloseOutline,
  ChevronUpOutline,
  ChevronDownOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  BookmarkOutline,
  ReorderFour,
} from "@vicons/ionicons5";

const props = defineProps({
  // Photo data
  photo: {
    type: Object,
    default: null,
  },
  // Mode: 'grid' (4 arrows) or 'series' (2 arrows + drag)
  mode: {
    type: String,
    default: "grid",
    validator: (v) => ["grid", "series"].includes(v),
  },
  // Movement capabilities
  canMoveUp: {
    type: Boolean,
    default: false,
  },
  canMoveDown: {
    type: Boolean,
    default: false,
  },
  canMoveLeft: {
    type: Boolean,
    default: false,
  },
  canMoveRight: {
    type: Boolean,
    default: false,
  },
  // State
  isGenerating: {
    type: Boolean,
    default: false,
  },
  showSpinner: {
    type: Boolean,
    default: true,
  },
  // Grid mode specific
  isOriginal: {
    type: Boolean,
    default: false,
  },
  // Series mode specific
  orderNumber: {
    type: Number,
    default: null,
  },
  draggable: {
    type: Boolean,
    default: false,
  },
  showName: {
    type: Boolean,
    default: true,
  },
  maxNameLength: {
    type: Number,
    default: 20,
  },
  // Sizing
  size: {
    type: Number,
    default: null, // null = use CSS default
  },
});

defineEmits(["add-photo", "remove", "move"]);

const cardStyle = computed(() => {
  if (props.size) {
    return {
      width: `${props.size}px`,
      height: props.mode === "series" ? "auto" : `${props.size}px`,
      minWidth: `${props.size}px`,
    };
  }
  return {};
});

const truncatedName = computed(() => {
  if (!props.photo?.name) return "";
  if (props.photo.name.length <= props.maxNameLength) return props.photo.name;
  return props.photo.name.slice(0, props.maxNameLength - 3) + "...";
});
</script>

<style scoped>
.photo-sequence-card {
  position: relative;
  border-radius: var(--border-radius-md, 8px);
  overflow: hidden;
  background-color: var(--bg-container, #18181c);
  border: 2px solid var(--border-color, #2c2c32);
  transition: all 0.3s ease;
}

/* Grid mode: aspect ratio 1:1 */
.photo-sequence-card.mode-grid {
  aspect-ratio: 1;
  overflow: hidden;
}

/* Series mode: same as grid, just square photo */
.photo-sequence-card.mode-series {
  aspect-ratio: 1;
  overflow: hidden;
}

.photo-sequence-card:hover {
  border-color: var(--border-color-hover, #3c3c42);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* Empty Cell */
.empty-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--spacing-sm, 8px);
  color: var(--text-secondary, #a0a0a0);
}

.add-photo-btn {
  background-color: var(--bg-container, #18181c) !important;
  border: 2px dashed var(--border-color, #2c2c32) !important;
  transition: all 0.3s ease;
}

.add-photo-btn:hover {
  border-color: var(--primary-color, #2563eb) !important;
  background-color: var(
    --primary-color-hover,
    rgba(37, 99, 235, 0.1)
  ) !important;
}

.cell-label {
  font-size: 12px;
  font-weight: 500;
}

/* Generating Cell */
.generating-cell {
  position: relative;
  height: 100%;
}

.generating-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

/* Filled Cell */
.filled-cell {
  position: relative;
  height: 100%;
  width: 100%;
}

.cell-photo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #1a1a1a;
  transition: transform 0.3s ease;
}

.photo-sequence-card:hover .cell-photo {
  transform: scale(1.02);
}

/* Order Badge (Series) */
.order-badge {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--primary-color, #2563eb);
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 10px;
  z-index: 10;
}

/* Drag Handle (Series) */
.drag-handle {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 4px;
  cursor: grab;
  color: rgba(255, 255, 255, 0.3);
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 5;
}

.photo-sequence-card:hover .drag-handle {
  opacity: 1;
}

.drag-handle:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(0, 0, 0, 0.5);
}

.drag-handle:active {
  cursor: grabbing;
}

/* Remove Button Overlay */
.cell-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 3;
}

.photo-sequence-card:hover .cell-overlay {
  opacity: 1;
}

.remove-photo-btn {
  background-color: rgba(239, 68, 68, 0.9) !important;
  border: none !important;
  color: white !important;
  width: 22px !important;
  height: 22px !important;
  min-width: 22px !important;
}

.remove-photo-btn:hover {
  background-color: #ef4444 !important;
  transform: scale(1.1);
}

/* Movement Controls */
.movement-controls {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0;
  transition: opacity 0.1s ease;
  z-index: 2;
  pointer-events: none;
}

.photo-sequence-card:hover .movement-controls {
  opacity: 1;
  pointer-events: auto;
}

.move-btn {
  background-color: var(
    --primary-color-suppl,
    rgba(37, 99, 235, 0.9)
  ) !important;
  color: white !important;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  position: absolute;
}

.move-btn:hover {
  background-color: var(--primary-color, #2563eb) !important;
  transform: scale(1.1);
}

/* Arrow positions - Grid mode */
.mode-grid .move-up {
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
}

.mode-grid .move-down {
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
}

.mode-grid .move-left {
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
}

.mode-grid .move-right {
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
}

/* Arrow positions - Series mode */
.mode-series .move-left {
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
}

.mode-series .move-right {
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
}

/* Original Photo Badge (Grid) */
.original-photo-badge {
  position: absolute;
  bottom: 6px;
  left: 6px;
  background-color: rgba(34, 197, 94, 0.9);
  color: white;
  border-radius: 50%;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Photo Name (Series) */
.photo-name {
  font-size: 12px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Responsive */
@media (max-width: 768px) {
  .movement-controls {
    opacity: 1;
    pointer-events: auto;
  }

  .drag-handle {
    opacity: 1;
  }

  .cell-overlay {
    opacity: 1;
  }
}
</style>
