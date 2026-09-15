<template>
  <div
    class="photo-sequence-card"
    :class="{
      'has-photo': photo,
      'is-generating': isGenerating,
      'mode-grid': mode === 'grid',
      'mode-series': mode === 'series',
      'is-selected': isSelected,
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
          <SpiralGridLoader variant="primary" :size="32" />
        </div>
      </div>
    </template>

    <!-- Photo Cell -->
    <div
      v-else
      class="filled-cell"
      :class="{
        'is-draggable': mode === 'series' && draggable,
        'is-selectable': mode === 'series' && selectable,
      }"
      @click="
        mode === 'series' && selectable ? $emit('select', photo.id) : null
      "
    >
      <!-- Order Badge (Series mode) -->
      <div v-if="mode === 'series' && orderNumber" class="order-badge">
        {{ orderNumber }}
      </div>

      <!-- Photo Image -->
      <img
        loading="lazy"
        :src="photo.thumbnailUrl || photo.url"
        :alt="photo.name || photo.title || 'Photo'"
        class="cell-photo"
      />

      <!-- Action Buttons Overlay (top-left) - Series mode -->
      <div
        v-if="mode === 'series' && selectable"
        class="action-buttons-overlay"
      >
        <n-button
          size="small"
          class="action-button info-button"
          @click.stop="
            () => {
              console.log(
                '[PhotoSequenceCard] Info button clicked, photo.id:',
                photo.id,
              );
              $emit('show-info', photo.id);
            }
          "
        >
          <template #icon>
            <n-icon>
              <InformationCircleOutline />
            </n-icon>
          </template>
        </n-button>
      </div>

      <!-- Remove Button Overlay -->
      <div class="cell-overlay">
        <n-button
          size="small"
          class="action-button remove-button"
          @click.stop="$emit('remove')"
        >
          <template #icon>
            <n-icon><TrashOutline /></n-icon>
          </template>
        </n-button>
      </div>

      <!-- Original Photo Badge (Grid mode) -->
      <div v-if="mode === 'grid' && isOriginal" class="original-photo-badge">
        <n-icon size="12"><BookmarkOutline /></n-icon>
      </div>

      <!-- Refresh Suggestion Button (Series mode, suggested photos only) -->
      <div
        v-if="mode === 'series' && isSuggested"
        class="refresh-suggestion-overlay"
      >
        <n-button
          circle
          size="large"
          class="refresh-suggestion-btn"
          @click.stop="$emit('refresh-suggestion')"
          :title="`Get new suggestion (${
            suggestionCriteria || 'same criteria'
          })`"
        >
          <template #icon>
            <n-icon size="24"><RefreshOutline /></n-icon>
          </template>
        </n-button>
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
import { NButton, NIcon, NSkeleton } from "naive-ui";
import SpiralGridLoader from "./SpiralGridLoader.vue";
import {
  AddOutline,
  TrashOutline,
  BookmarkOutline,
  ReorderFour,
  RefreshOutline,
  InformationCircleOutline,
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
  selectable: {
    type: Boolean,
    default: false,
  },
  isSelected: {
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
  // Suggestion tracking
  isSuggested: {
    type: Boolean,
    default: false,
  },
  suggestionCriteria: {
    type: String,
    default: null,
  },
  // Sizing
  size: {
    type: Number,
    default: null, // null = use CSS default
  },
});

defineEmits([
  "add-photo",
  "remove",
  "select",
  "show-info",
  "refresh-suggestion",
]);

const cardStyle = computed(() => {
  if (props.size) {
    return {
      width: `${props.size}px`,
      height: `${props.size}px`,
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
  background-color: var(--bg-container);
  border: 2px solid transparent;
  transition: all 0.3s ease;
  container-type: inline-size;
  container-name: sequence-card;
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

.filled-cell.is-selectable {
  cursor: pointer;
}

.filled-cell.is-draggable {
  cursor: grab;
}

.filled-cell.is-draggable:active {
  cursor: grabbing;
}

.cell-photo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--bg-surface, #18181c);
  pointer-events: none;
}

/* Order Badge (Series) — top-right sequence number, same style as photo-filename-topright */
.order-badge {
  position: absolute;
  top: -2px;
  right: 2px;
  color: var(--text-secondary);
  font-size: 26px;
  font-weight: 500;
  border-radius: 0 12px 0 8px;
  opacity: 0.65;
  z-index: 2;
  pointer-events: none;
  backdrop-filter: blur(4px);
  transition: opacity 0.2s ease;
  white-space: nowrap;
  letter-spacing: 0.025em;
  user-select: none;
}

.photo-sequence-card:hover .order-badge {
  opacity: 0;
}

@container sequence-card (max-width: 300px) {
  .order-badge {
    font-size: 18px;
  }
}

@container sequence-card (max-width: 200px) {
  .order-badge {
    font-size: 14px;
  }
}

@container sequence-card (max-width: 150px) {
  .order-badge {
    font-size: 13px;
  }
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

/* Action buttons overlay */
.action-buttons-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  transform: none;
  opacity: 0;
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 3;
  display: flex;
  gap: 8px;
}

.photo-sequence-card:hover .action-buttons-overlay {
  opacity: 1;
}

/* Action button */
.action-button {
  border-radius: 8px !important;
  backdrop-filter: blur(8px);
  border: none !important;
  width: 32px;
  height: 32px;
  opacity: 0.9;
  transition: opacity 0.2s ease !important;
}

.action-button:hover {
  opacity: 1 !important;
}

.info-button {
  background-color: var(--info-color) !important;
  color: white !important;
}

.remove-button {
  background-color: var(--error-color) !important;
  color: white !important;
}

.remove-button:hover {
  background-color: var(--error-color-hover) !important;
}

.photo-sequence-card.has-photo.is-selected {
  border-color: var(--accent-color);
}

.filled-cell.is-selected .cell-photo {
  filter: brightness(0.9);
}

.photo-sequence-card:hover .cell-overlay {
  opacity: 1;
}

.remove-photo-btn:hover {
  background-color: #ef4444 !important;
  transform: scale(1.1);
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

/* Refresh Suggestion Button (Series, suggested photos only) */
.refresh-suggestion-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  background: rgba(0, 0, 0, 0.5);
  transition: opacity 0.2s ease;
  pointer-events: none;
  z-index: 2;
}

.filled-cell:hover .refresh-suggestion-overlay {
  opacity: 1;
  pointer-events: auto;
}

.refresh-suggestion-btn {
  background: var(--primary-color, #2563eb) !important;
  border: 2px solid rgba(37, 99, 235, 0.8);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
  transition: all 0.2s ease;
  position: relative;
  z-index: 6;
}

.refresh-suggestion-btn:hover {
  /* background: rgba(59, 130, 246, 1) !important;
  border-color: rgba(59, 130, 246, 1);
  box-shadow: 0 6px 24px rgba(37, 99, 235, 0.6);
  transform: scale(1.1) rotate(180deg); */
}

.refresh-suggestion-btn :deep(.n-icon) {
  color: white;
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
  .drag-handle {
    opacity: 1;
  }

  .cell-overlay {
    opacity: 1;
  }
}
</style>
