<template>
  <div
    class="crop-selector-overlay"
    :class="{ 'has-selection': hasSelection }"
    @mousedown.prevent="onMouseDown"
    @touchstart.prevent="onTouchStart"
  >
    <!-- Dimmed regions around the selection -->
    <template v-if="hasSelection">
      <div class="dim-top" :style="dimTopStyle" />
      <div class="dim-bottom" :style="dimBottomStyle" />
      <div class="dim-left" :style="dimLeftStyle" />
      <div class="dim-right" :style="dimRightStyle" />

      <!-- Selection rectangle -->
      <div class="crop-rect" :style="cropRectStyle">
        <button
          class="crop-clear-btn"
          @mousedown.stop
          @click.stop="clearSelection"
        >
          ✕
        </button>
      </div>
    </template>

    <!-- Drawing rectangle (while dragging) -->
    <div
      v-if="isDragging && drawRect"
      class="crop-rect drawing"
      :style="drawRectStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

export interface CropRegion {
  x: number; // 0-1 percentage from left
  y: number; // 0-1 percentage from top
  w: number; // 0-1 percentage width
  h: number; // 0-1 percentage height
}

const props = defineProps<{
  modelValue: CropRegion | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: CropRegion | null): void;
}>();

const isDragging = ref(false);
const startPos = ref({ x: 0, y: 0 });
const currentPos = ref({ x: 0, y: 0 });

const hasSelection = computed(() => props.modelValue !== null);

// Computed for the draw-in-progress rectangle
const drawRect = computed(() => {
  if (!isDragging.value) return null;
  const x1 = Math.min(startPos.value.x, currentPos.value.x);
  const y1 = Math.min(startPos.value.y, currentPos.value.y);
  const x2 = Math.max(startPos.value.x, currentPos.value.x);
  const y2 = Math.max(startPos.value.y, currentPos.value.y);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
});

const drawRectStyle = computed(() => {
  if (!drawRect.value) return {};
  return {
    left: `${drawRect.value.x * 100}%`,
    top: `${drawRect.value.y * 100}%`,
    width: `${drawRect.value.w * 100}%`,
    height: `${drawRect.value.h * 100}%`,
  };
});

const cropRectStyle = computed(() => {
  if (!props.modelValue) return {};
  const r = props.modelValue;
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  };
});

// Dim region styles
const dimTopStyle = computed(() => {
  if (!props.modelValue) return {};
  return { height: `${props.modelValue.y * 100}%` };
});
const dimBottomStyle = computed(() => {
  if (!props.modelValue) return {};
  const top = (props.modelValue.y + props.modelValue.h) * 100;
  return { top: `${top}%` };
});
const dimLeftStyle = computed(() => {
  if (!props.modelValue) return {};
  return {
    top: `${props.modelValue.y * 100}%`,
    height: `${props.modelValue.h * 100}%`,
    width: `${props.modelValue.x * 100}%`,
  };
});
const dimRightStyle = computed(() => {
  if (!props.modelValue) return {};
  const right = (props.modelValue.x + props.modelValue.w) * 100;
  return {
    top: `${props.modelValue.y * 100}%`,
    height: `${props.modelValue.h * 100}%`,
    width: `${100 - right}%`,
  };
});

function getRelativePosition(
  clientX: number,
  clientY: number,
  el: HTMLElement,
) {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  };
}

function onMouseDown(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  const pos = getRelativePosition(e.clientX, e.clientY, el);
  startPos.value = pos;
  currentPos.value = pos;
  isDragging.value = true;

  const onMouseMove = (ev: MouseEvent) => {
    currentPos.value = getRelativePosition(ev.clientX, ev.clientY, el);
  };

  const onMouseUp = () => {
    isDragging.value = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    commitSelection();
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  const el = e.currentTarget as HTMLElement;
  const pos = getRelativePosition(touch.clientX, touch.clientY, el);
  startPos.value = pos;
  currentPos.value = pos;
  isDragging.value = true;

  const onTouchMove = (ev: TouchEvent) => {
    if (ev.touches.length !== 1) return;
    ev.preventDefault();
    currentPos.value = getRelativePosition(
      ev.touches[0].clientX,
      ev.touches[0].clientY,
      el,
    );
  };

  const onTouchEnd = () => {
    isDragging.value = false;
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("touchend", onTouchEnd);
    commitSelection();
  };

  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd);
}

function commitSelection() {
  const x1 = Math.min(startPos.value.x, currentPos.value.x);
  const y1 = Math.min(startPos.value.y, currentPos.value.y);
  const x2 = Math.max(startPos.value.x, currentPos.value.x);
  const y2 = Math.max(startPos.value.y, currentPos.value.y);
  const w = x2 - x1;
  const h = y2 - y1;

  // Minimum size threshold (5% of image in each dimension)
  if (w < 0.05 || h < 0.05) {
    // Too small — treat as a click to clear
    emit("update:modelValue", null);
    return;
  }

  emit("update:modelValue", { x: x1, y: y1, w, h });
}

function clearSelection() {
  emit("update:modelValue", null);
}
</script>

<style scoped>
.crop-selector-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  cursor: crosshair;
}

/* Dim regions */
.dim-top,
.dim-bottom,
.dim-left,
.dim-right {
  position: absolute;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
}

.dim-top {
  top: 0;
  left: 0;
  right: 0;
}

.dim-bottom {
  bottom: 0;
  left: 0;
  right: 0;
}

.dim-left {
  left: 0;
}

.dim-right {
  right: 0;
}

/* Selection rectangle */
.crop-rect {
  position: absolute;
  border: 2px solid var(--accent-color, #22d3ee);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.crop-rect.drawing {
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.8);
}

.crop-clear-btn {
  pointer-events: auto;
  position: absolute;
  top: -10px;
  right: -10px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent-color, #22d3ee);
  color: #000;
  border: none;
  font-size: 11px;
  line-height: 20px;
  text-align: center;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.crop-clear-btn:hover {
  background: #fff;
}
</style>
