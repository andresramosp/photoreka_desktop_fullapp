<template>
  <div ref="wrapperRef" class="pk-grid-wrapper">
    <div v-if="layoutMap.size" class="pk-grid" :style="{ gap: `${gap}px` }">
      <button
        v-for="(photo, index) in photos"
        :key="photo.id"
        type="button"
        class="pk-cell"
        :class="{ 'is-loaded': loadedIds.has(photo.id) }"
        :style="cellStyle(photo, index)"
        :aria-label="photo.title || `Photo ${index + 1}`"
        @click="$emit('open', index)"
      >
        <img
          :src="photo.originalUrl"
          :alt="photo.title || ''"
          loading="lazy"
          decoding="async"
          draggable="false"
          @load="onImageLoad(photo, $event)"
        />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import {
  buildPortfolioRows,
  responsiveColumns,
  responsiveGap,
  PORTFOLIO_DEFAULT_RATIO,
} from "@/utils/portfolioGridLayout";

const props = defineProps({
  photos: { type: Array, required: true },
  gridSettings: { type: Object, default: null },
});

defineEmits(["open"]);

const settings = computed(
  () => props.gridSettings ?? { columns: 3, gap: 30, fillAvailableSpace: true },
);

// ── Container width ────────────────────────────────────────
const wrapperRef = ref(null);
const containerWidth = ref(0);
let resizeObserver = null;

onMounted(() => {
  if (!wrapperRef.value) return;
  containerWidth.value = wrapperRef.value.clientWidth;
  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) containerWidth.value = entry.contentRect.width;
  });
  resizeObserver.observe(wrapperRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

// ── Aspect ratios ──────────────────────────────────────────
// Seeded from the payload so the first paint is already right, then corrected
// by the real image in case a photo was replaced since publishing.
const aspectRatios = ref(new Map());
const loadedIds = ref(new Set());

watch(
  () => props.photos,
  (photos) => {
    const seeded = new Map();
    for (const photo of photos) {
      if (photo.aspectRatio) seeded.set(photo.id, photo.aspectRatio);
    }
    aspectRatios.value = seeded;
    loadedIds.value = new Set();
    measureUnseeded(photos);
  },
  { immediate: true },
);

// Photos without a stored ratio are measured up front, the way the editor
// grid does, so the layout settles once at load instead of shifting rows under
// the visitor as lazy images arrive. It also warms the cache for those images.
function measureUnseeded(photos) {
  for (const photo of photos) {
    if (aspectRatios.value.has(photo.id)) continue;
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      aspectRatios.value = new Map(aspectRatios.value).set(
        photo.id,
        img.naturalWidth / img.naturalHeight,
      );
    };
    img.src = photo.originalUrl;
  }
}

function onImageLoad(photo, event) {
  loadedIds.value = new Set(loadedIds.value).add(photo.id);
  const { naturalWidth, naturalHeight } = event.target;
  if (!naturalWidth || !naturalHeight) return;
  const measured = naturalWidth / naturalHeight;
  if (Math.abs((aspectRatios.value.get(photo.id) ?? 0) - measured) < 0.005)
    return;
  aspectRatios.value = new Map(aspectRatios.value).set(photo.id, measured);
}

// ── Layout ─────────────────────────────────────────────────
const columns = computed(() =>
  responsiveColumns(settings.value.columns, containerWidth.value),
);
const gap = computed(() =>
  responsiveGap(settings.value.gap, containerWidth.value),
);

const layoutMap = computed(() => {
  const map = new Map();
  if (!containerWidth.value || !props.photos.length) return map;

  const rows = buildPortfolioRows({
    photos: props.photos,
    columns: columns.value,
    gap: gap.value,
    containerWidth: containerWidth.value,
    fillAvailableSpace: settings.value.fillAvailableSpace,
    defaultRatio: PORTFOLIO_DEFAULT_RATIO,
    getAspectRatio: (photo) => aspectRatios.value.get(photo.id),
  });

  for (const row of rows) {
    row.photos.forEach((photo, index) => {
      map.set(photo.id, {
        width: Math.floor(row.widths[index]),
        height: Math.floor(row.rowHeight),
      });
    });
  }
  return map;
});

function cellStyle(photo, index) {
  const dims = layoutMap.value.get(photo.id);
  if (!dims) return { display: "none" };
  return {
    width: `${dims.width}px`,
    height: `${dims.height}px`,
    // Stagger only the first screenful; later rows arrive as they load.
    "--pk-delay": `${Math.min(index, 8) * 60}ms`,
  };
}
</script>

<style scoped>
.pk-grid {
  display: flex;
  flex-wrap: wrap;
}

.pk-cell {
  position: relative;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  overflow: hidden;
  background: var(--pk-placeholder);
  cursor: zoom-in;
  opacity: 0;
  transition: opacity 0.9s var(--pk-ease) var(--pk-delay, 0ms);
}

.pk-cell.is-loaded {
  opacity: 1;
}

/* The reveal transform sits on the clipped image, never on the cell: a
   transformed cell would extend the page's scrollable area and shrink it
   again as rows load, bouncing the visitor off the bottom. */
.pk-cell img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: translateY(10px);
  transition: transform 1.2s var(--pk-ease) var(--pk-delay, 0ms);
}

.pk-cell.is-loaded img {
  transform: none;
}

@media (hover: hover) {
  .pk-cell:hover img {
    transform: scale(1.025);
  }
}

.pk-cell:focus-visible {
  outline: 2px solid var(--pk-fg);
  outline-offset: 3px;
}
</style>
