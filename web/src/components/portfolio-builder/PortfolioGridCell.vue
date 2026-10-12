<template>
  <div
    class="grid-cell"
    :class="{ 'is-loaded': loaded, 'is-selected': selected }"
    @mousedown="onMousedown"
    @mousemove="onMousemove"
    @click="onClick"
  >
    <img
      :src="imageSrc"
      :alt="`Photo ${photo.id}`"
      class="cell-image"
      draggable="false"
      @load="onImageLoad"
      @error="onImageError"
    />

    <div class="cell-overlay">
      <n-button
        size="small"
        class="action-button info-button"
        title="Photo details"
        @click.stop="$emit('info', photo)"
      >
        <template #icon>
          <n-icon><InformationCircleOutline /></n-icon>
        </template>
      </n-button>
      <n-button
        size="small"
        class="action-button remove-button"
        title="Remove from portfolio"
        @click.stop="$emit('remove', photo)"
      >
        <template #icon>
          <n-icon><TrashOutline /></n-icon>
        </template>
      </n-button>
    </div>

    <div class="cell-drag-hint" aria-hidden="true">
      <span></span><span></span> <span></span><span></span> <span></span
      ><span></span>
    </div>

    <div v-if="!loaded" class="cell-placeholder">
      <SpiralGridLoader variant="primary" :size="20" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { NButton, NIcon } from "naive-ui";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import { TrashOutline, InformationCircleOutline } from "@vicons/ionicons5";

const ORIGINAL_IMAGE_MIN_RENDERED_WIDTH = 420;

const props = defineProps({
  photo: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  cellWidth: { type: Number, default: 0 },
  cellHeight: { type: Number, default: 0 },
  rowPhotoCount: { type: Number, default: 0 },
});

const emit = defineEmits(["remove", "info", "select"]);

const loaded = ref(false);
const forceThumbnail = ref(false);

const shouldUseOriginal = computed(() => {
  if (!props.photo?.originalUrl) return false;
  if (props.rowPhotoCount === 1) return true;
  return props.cellWidth >= ORIGINAL_IMAGE_MIN_RENDERED_WIDTH;
});

const imageSrc = computed(() => {
  if (!forceThumbnail.value && shouldUseOriginal.value) {
    return props.photo.originalUrl;
  }
  return props.photo.thumbnailUrl || props.photo.originalUrl || "";
});

watch(imageSrc, () => {
  loaded.value = false;
});

// Distinguish click from drag: suppress selection toggle when the user dragged
let dragStartX = 0;
let dragStartY = 0;
let hasMoved = false;

function onImageLoad() {
  loaded.value = true;
}

function onImageError() {
  if (!forceThumbnail.value && imageSrc.value === props.photo.originalUrl) {
    forceThumbnail.value = true;
    return;
  }
  loaded.value = true;
}

function onMousedown(e) {
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  hasMoved = false;
}

function onMousemove(e) {
  if (!hasMoved) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (dx * dx + dy * dy > 25) hasMoved = true; // > 5px
  }
}

function onClick() {
  if (!hasMoved) {
    emit("select", props.photo);
  }
}
</script>

<style scoped>
.grid-cell {
  position: relative;
  overflow: hidden;
  background: var(--bg-container);
  cursor: grab;
}

.grid-cell:active {
  cursor: grabbing;
}

.cell-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transition: opacity 0.3s ease;
  user-select: none;
  pointer-events: none;
}

.grid-cell.is-loaded .cell-image {
  opacity: 1;
}

.cell-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 6px;
  opacity: 0;
  transition:
    opacity 0.2s ease,
    background 0.2s ease;
}

.grid-cell:hover .cell-overlay {
  opacity: 1;
  background: rgba(0, 0, 0, 0.25);
}

.cell-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px !important;
  backdrop-filter: blur(8px);
  border: none !important;
  opacity: 0.9;
  cursor: pointer;
  transition: opacity 0.2s ease !important;
}

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
  background-color: rgba(0, 0, 0, 0.6) !important;
  color: white !important;
}

.remove-button:hover {
  background-color: var(--error-color) !important;
}

/* ── Drag hint (grip dots, center) ── */
.cell-drag-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.7);
  display: grid;
  grid-template-columns: repeat(2, 6px);
  gap: 5px;
  opacity: 0;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
  pointer-events: none;
  z-index: 6;
}

.grid-cell:hover .cell-drag-hint {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.cell-drag-hint span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.cell-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-container);
}

/* ── Selection indicator (top-left checkbox) ── */
.cell-select-indicator {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  border: 2px solid rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;
  z-index: 10;
}

.grid-cell:hover .cell-select-indicator,
.grid-cell.is-selected .cell-select-indicator {
  opacity: 1;
}

.grid-cell.is-selected .cell-select-indicator {
  background: var(--accent-color);
  border-color: var(--accent-color);
}

.check-icon {
  width: 14px;
  height: 14px;
  color: white;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.grid-cell.is-selected .check-icon {
  opacity: 1;
}

/* ── Selection border ── */
.grid-cell.is-selected::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 3px solid var(--accent-color);
  pointer-events: none;
  z-index: 5;
}
</style>
