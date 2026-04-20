<template>
  <div class="portfolio-grid-wrapper" ref="wrapperRef">
    <div v-if="!ready" class="grid-loading">
      <n-spin :size="24" />
      <span>Measuring photos…</span>
    </div>

    <draggable
      v-else
      :list="photos"
      item-key="id"
      class="portfolio-grid"
      :style="{ gap: `${gap}px` }"
      ghost-class="grid-ghost"
      chosen-class="grid-chosen"
      drag-class="grid-drag"
      :animation="200"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <PortfolioGridCell
          :photo="element"
          :style="getCellStyle(element)"
          @remove="(photo) => $emit('remove', photo)"
        />
      </template>
    </draggable>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import { NSpin } from "naive-ui";
import draggable from "vuedraggable";
import PortfolioGridCell from "./PortfolioGridCell.vue";

const DEFAULT_RATIO = 1.5; // 3:2 fallback while loading

const props = defineProps({
  photos: { type: Array, required: true },
  columns: { type: Number, default: 5 },
  gap: { type: Number, default: 3 },
});

const emit = defineEmits(["update:photos", "remove"]);

// ── Container width measurement ────────────────────────────
const wrapperRef = ref(null);
const containerWidth = ref(0);
let resizeObserver = null;

onMounted(() => {
  if (wrapperRef.value) {
    containerWidth.value = wrapperRef.value.clientWidth;
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width;
      }
    });
    resizeObserver.observe(wrapperRef.value);
  }
  measureAllPhotos();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

// ── Aspect ratio resolution ────────────────────────────────
const aspectRatios = ref(new Map());
const ready = ref(false);

function measureAllPhotos() {
  const pending = [];
  for (const photo of props.photos) {
    if (aspectRatios.value.has(photo.id)) continue;
    pending.push(measurePhoto(photo));
  }
  if (pending.length === 0) {
    ready.value = true;
    return;
  }
  Promise.all(pending).then(() => {
    ready.value = true;
  });
}

function measurePhoto(photo) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      aspectRatios.value.set(photo.id, img.naturalWidth / img.naturalHeight);
      resolve();
    };
    img.onerror = () => {
      aspectRatios.value.set(photo.id, DEFAULT_RATIO);
      resolve();
    };
    img.src = photo.thumbnailUrl;
  });
}

// Re-measure when photo list changes (e.g. after restore)
watch(
  () => props.photos.map((p) => p.id).join(","),
  () => measureAllPhotos(),
);

// ── Justified row layout computation ───────────────────────
const layoutMap = computed(() => {
  const map = new Map();
  const cw = containerWidth.value;
  if (!cw || !props.photos.length) return map;

  const cols = props.columns;

  for (let i = 0; i < props.photos.length; i += cols) {
    const rowPhotos = props.photos.slice(i, i + cols);
    const ratios = rowPhotos.map(
      (p) => aspectRatios.value.get(p.id) ?? DEFAULT_RATIO,
    );
    const sumRatios = ratios.reduce((a, b) => a + b, 0);
    const availableWidth = cw - props.gap * (rowPhotos.length - 1);
    const rowHeight = availableWidth / sumRatios;

    rowPhotos.forEach((p, j) => {
      map.set(p.id, {
        width: Math.floor(ratios[j] * rowHeight),
        height: Math.floor(rowHeight),
      });
    });
  }

  return map;
});

function getCellStyle(photo) {
  const dims = layoutMap.value.get(photo.id);
  if (!dims) return {};
  return {
    width: `${dims.width}px`,
    height: `${dims.height}px`,
    flexShrink: 0,
    flexGrow: 0,
  };
}

function onDragEnd() {
  emit("update:photos", [...props.photos]);
}
</script>

<style scoped>
.portfolio-grid-wrapper {
  background: var(--bg-container);
  border-radius: 8px;
  padding: 3px;
  min-height: 200px;
}

.grid-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.portfolio-grid {
  display: flex;
  flex-wrap: wrap;
}

/* Drag states */
.grid-ghost {
  opacity: 0.3;
}

.grid-chosen {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
  z-index: 10;
}

.grid-drag {
  transform: scale(1.02);
  box-shadow: var(--shadow-lg);
  z-index: 20;
}

@media (max-width: 768px) {
  .portfolio-grid-wrapper {
    border-radius: 4px;
    padding: 2px;
  }

  .portfolio-grid {
    gap: 2px;
  }
}
</style>
