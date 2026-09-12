<template>
  <div
    class="action-card"
    :class="{
      'is-dragging': isDragging,
      'is-selected': isSelected,
      'is-selection-mode': isSelectionMode,
      'is-compact': compact,
      'is-list': layout === 'list',
      'not-selectable': !selectable,
    }"
    :style="
      layout === 'list' ? { paddingLeft: 12 + depth * 20 + 'px' } : undefined
    "
    :draggable="selectable ? 'true' : 'false'"
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
      :aria-label="isSelected ? `Deselect ${itemLabel}` : `Select ${itemLabel}`"
      tabindex="0"
    >
      <svg v-if="isSelected" viewBox="0 0 24 24" class="check-icon">
        <path
          fill="currentColor"
          d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
        />
      </svg>
    </button>

    <span
      v-if="item.isShared && layout !== 'list'"
      class="shared-badge"
      title="Shared publicly"
    >
      <n-icon :size="13">
        <ShareSocialOutline />
      </n-icon>
    </span>

    <!-- List (details) row -->
    <template v-if="layout === 'list'">
      <div class="list-icon">
        <img
          v-if="firstPhoto"
          :src="firstPhoto.thumbnailUrl || firstPhoto.url"
          :alt="item.title || item.name || 'Photo'"
          class="photo-thumbnail"
          loading="lazy"
        />
        <n-icon v-else size="20" color="var(--text-tertiary)">
          <ListOutline v-if="type === 'series'" />
          <ImagesOutline v-else />
        </n-icon>
      </div>
      <div class="list-name" :title="item.name || item.title">
        {{ item.name || item.title }}
        <n-icon
          v-if="item.isShared"
          :size="14"
          class="list-shared-icon"
          title="Shared publicly"
        >
          <ShareSocialOutline />
        </n-icon>
        <span v-if="type === 'portfolio'" class="list-tag">Portfolio</span>
      </div>
      <div class="list-col list-col-items">
        {{ photoCount }} photo{{ photoCount !== 1 ? "s" : "" }}
      </div>
      <div class="list-col list-col-updated">
        {{ formatDate(item.updatedAt) }}
      </div>
    </template>

    <div v-else class="card-preview">
      <span v-if="type === 'portfolio'" class="portfolio-badge">Portfolio</span>
      <!-- Series Preview: Sequential photos with numbers -->
      <div
        v-if="type === 'series' && previewPhotos.length > 0"
        class="photo-sequence"
      >
        <div
          v-for="(photo, index) in previewPhotos"
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
      <div
        v-else-if="type === 'collection' || type === 'portfolio'"
        class="photo-stack"
      >
        <div
          v-for="(photo, index) in previewPhotos"
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
          v-for="index in Math.max(0, 3 - previewPhotos.length)"
          :key="`placeholder-${index}`"
          class="photo-item"
          :class="`photo-${previewPhotos.length + index}`"
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
    <div v-if="layout !== 'list'" class="card-info">
      <h3 class="card-title">
        {{ item.name || item.title }}
      </h3>
      <p class="card-meta">
        {{ photoCount }} photos •
        <span v-if="showUpdateDate"
          >Updated {{ formatDate(item.updatedAt) }}</span
        >
        <span v-else>Last updated {{ formatDate(item.updatedAt) }}</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ListOutline,
  ImagesOutline,
  ShareSocialOutline,
} from "@vicons/ionicons5";

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
  /** Series y portfolios siguen mandando sus fotos completas. */
  photos?: Photo[];
  /** Colecciones: sólo las miniaturas de portada, ya recortadas por el back. */
  previewPhotos?: Photo[];
  updatedAt: Date | string;
  photoCount?: number;
  photosCount?: number;
  isShared?: boolean;
}

interface Props {
  item: Item;
  type: "series" | "collection" | "portfolio";
  compact?: boolean;
  showUpdateDate?: boolean;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  selectedIds?: string[];
  selectable?: boolean;
  dragType?: string;
  itemLabel?: string;
  layout?: "grid" | "list";
  depth?: number;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  showUpdateDate: true,
  isSelected: false,
  isSelectionMode: false,
  selectedIds: () => [],
  selectable: true,
  dragType: "collection",
  itemLabel: "collection",
  layout: "grid",
  depth: 0,
});

/**
 * Las tres miniaturas de la portada. Las colecciones las reciben ya recortadas
 * del back (`previewPhotos`); series y portfolios traen el array completo.
 */
const previewPhotos = computed<Photo[]>(() =>
  props.item.previewPhotos
    ? props.item.previewPhotos.slice(0, 3)
    : (props.item.photos || []).slice(0, 3),
);

const photoCount = computed(
  () =>
    props.item.photosCount ??
    props.item.photoCount ??
    (props.item.photos || []).length,
);

const firstPhoto = computed(() => previewPhotos.value[0] || null);

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

import { ref, computed } from "vue";
const isDragging = ref(false);

const onDragStart = (e: DragEvent) => {
  isDragging.value = true;
  e.dataTransfer!.effectAllowed = "move";
  const singleMime = `application/x-${props.dragType}-id`;
  const multiMime = `application/x-${props.dragType}-ids`;
  if (props.isSelected && props.selectedIds.length > 1) {
    // Encode all selected IDs for multi-drag
    e.dataTransfer!.setData(multiMime, JSON.stringify(props.selectedIds));
  } else {
    e.dataTransfer!.setData(singleMime, String(props.item.id));
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

/* ── List (details) row ────────────────────────────────────── */
.action-card.is-list {
  display: grid;
  grid-template-columns: var(--list-cols, 24px 28px minmax(0, 1fr) 250px 120px);
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  min-height: 40px;
  border-radius: 6px;
  border: 1px solid transparent;
  text-align: left;
}

.action-card.is-list:hover {
  background: color-mix(
    in srgb,
    var(--primary-color, #6366f1) 7%,
    transparent
  );
}

.action-card.is-list.is-selected {
  outline: none;
  background: color-mix(
    in srgb,
    var(--primary-color, #6366f1) 12%,
    transparent
  );
}

.action-card.is-list .list-icon {
  width: 28px;
  height: 28px;
  border-radius: 5px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-container);
}

.action-card.is-list .list-icon .photo-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.action-card.is-list .list-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-card.is-list .list-tag {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary-color);
  border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  border-radius: 999px;
  padding: 1px 6px;
}

.action-card.is-list .list-col {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Selection circle occupies its own leading column in list mode */
.action-card.is-list .selection-circle {
  position: static;
  top: auto;
  left: auto;
  transform: none;
  justify-self: center;
}

@media (max-width: 768px) {
  .action-card.is-list {
    grid-template-columns: 24px 28px minmax(0, 1fr) auto;
  }
  .action-card.is-list .list-col-updated {
    display: none;
  }
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

.action-card[draggable="true"]:not(.not-selectable) {
  cursor: grab;
}

.action-card.is-compact {
  padding: 0;
}

.card-preview {
  position: relative;
  height: 120px;
  margin-bottom: 8px;
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

.portfolio-badge {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  background: color-mix(in srgb, var(--bg-card) 78%, transparent);
  color: var(--primary-color);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1;
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.shared-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  background: color-mix(in srgb, var(--bg-card) 78%, transparent);
  color: var(--primary-color);
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.list-shared-icon {
  color: var(--primary-color);
  vertical-align: middle;
  margin-left: 6px;
}

.action-card.is-compact .portfolio-badge {
  top: 6px;
  padding: 3px 8px;
  font-size: 9px;
  letter-spacing: 0.1em;
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

.action-card.is-compact .card-preview {
  height: 86px;
  margin-bottom: 6px;
}

.action-card.is-compact .photo-sequence {
  gap: 6px;
}

.action-card.is-compact .sequence-photo {
  width: 58px;
  height: 58px;
  border-width: 1px;
  border-radius: 7px;
}

.action-card.is-compact .sequence-number {
  width: 15px;
  height: 15px;
  font-size: 9px;
  bottom: 3px;
  right: 3px;
}

/* Compact photo stack (collections) */
.action-card.is-compact .photo-stack {
  width: 95px;
  height: 68px;
}

.action-card.is-compact .photo-stack .photo-item {
  width: 55px;
  height: 64px;
}

.action-card.is-compact .photo-stack .photo-item.photo-1 {
  transform: translate(-50%, -50%) translateX(-24px) rotate(-15deg);
}

.action-card.is-compact .photo-stack .photo-item.photo-2 {
  transform: translate(-50%, -50%) translateY(-3px);
}

.action-card.is-compact .photo-stack .photo-item.photo-3 {
  transform: translate(-50%, -50%) translateX(24px) rotate(15deg);
}

.action-card.is-compact .card-title {
  font-size: 15px;
  margin-bottom: 4px;
}

.action-card.is-compact .card-meta {
  font-size: 12px;
  line-height: 1.3;
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
    margin-bottom: 8px;
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

  .portfolio-badge {
    top: 6px;
    padding: 3px 8px;
    font-size: 9px;
  }

  .action-card.is-compact .card-preview {
    height: 78px;
  }

  .action-card.is-compact .sequence-photo {
    width: 52px;
    height: 52px;
  }

  .action-card.is-compact .photo-stack {
    width: 85px;
    height: 62px;
  }

  .action-card.is-compact .photo-stack .photo-item {
    width: 50px;
    height: 58px;
  }
}
</style>
