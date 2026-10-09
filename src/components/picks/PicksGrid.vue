<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { computeJustifiedLayout, type LayoutBox } from "@/utils/picks/justifiedLayout";
import { formatScore } from "@/utils/picks/ranking";
import PicksCopiesBadge from "./PicksCopiesBadge.vue";
import type { RankedPhoto } from "@/utils/picks/types";

const props = defineProps<{
  items: RankedPhoto[];
  scroller: HTMLElement | null;
}>();
const emit = defineEmits<{ open: [photoId: string] }>();

// Tiles further than this from the viewport are not rendered at all.
const RENDER_BUFFER_PX = 900;

const root = ref<HTMLElement | null>(null);
const width = ref(0);
const viewTop = ref(0);
const viewHeight = ref(0);
const animated = ref(false);
const entering = ref(true);

const rowHeight = computed(() =>
  width.value < 640 ? 132 : width.value < 1100 ? 196 : 244,
);
const gap = computed(() => (width.value < 640 ? 6 : 10));

const layout = computed(() =>
  computeJustifiedLayout(
    props.items.map((item) => ({
      id: item.photo.id,
      ratio: item.photo.width / Math.max(1, item.photo.height),
    })),
    width.value,
    rowHeight.value,
    gap.value,
  ),
);

const boxById = computed(() => {
  const map = new Map<string, LayoutBox>();
  for (const box of layout.value.boxes) map.set(box.id, box);
  return map;
});

const visible = computed(() => {
  const top = viewTop.value - RENDER_BUFFER_PX;
  const bottom = viewTop.value + viewHeight.value + RENDER_BUFFER_PX;
  return props.items.filter((item) => {
    const box = boxById.value.get(item.photo.id);
    return box && box.y + box.h >= top && box.y <= bottom;
  });
});

function tileStyle(item: RankedPhoto, index: number) {
  const box = boxById.value.get(item.photo.id);
  if (!box) return { display: "none" };
  return {
    width: `${box.w}px`,
    height: `${box.h}px`,
    transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
    "--i": String(Math.min(index, 24)),
  };
}

let frame = 0;
function measureViewport() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (!root.value || !props.scroller) return;
    const gridTop = root.value.getBoundingClientRect().top;
    const scrollerTop = props.scroller.getBoundingClientRect().top;
    viewTop.value = scrollerTop - gridTop;
    viewHeight.value = props.scroller.clientHeight;
  });
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!root.value) return;
  resizeObserver = new ResizeObserver(([entry]) => {
    width.value = entry.contentRect.width;
    measureViewport();
  });
  resizeObserver.observe(root.value);
  // Transitions only after the first real layout, so tiles do not fly in from 0,0.
  requestAnimationFrame(() => requestAnimationFrame(() => (animated.value = true)));
  setTimeout(() => (entering.value = false), 1400);
});

watch(
  () => props.scroller,
  (el, prev) => {
    prev?.removeEventListener("scroll", measureViewport);
    el?.addEventListener("scroll", measureViewport, { passive: true });
    measureViewport();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  props.scroller?.removeEventListener("scroll", measureViewport);
  cancelAnimationFrame(frame);
});

function onImageLoad(event: Event) {
  (event.target as HTMLElement).classList.add("is-loaded");
}
</script>

<template>
  <div
    ref="root"
    class="pk-grid"
    :class="{ 'is-animated': animated, 'is-entering': entering }"
    :style="{ height: `${layout.height}px` }"
  >
    <button
      v-for="(item, index) in visible"
      :key="item.photo.id"
      class="pk-tile"
      :class="{ 'is-top': item.rank <= 10 }"
      :style="tileStyle(item, index)"
      @click="emit('open', item.photo.id)"
    >
      <img
        :src="item.photo.thumbUrl"
        :alt="item.photo.name"
        loading="lazy"
        decoding="async"
        @load="onImageLoad"
      />
      <span class="pk-tile-ph" />
      <span class="pk-tile-rank">{{ item.rank }}</span>
      <PicksCopiesBadge :copies="item.photo.duplicates" />
      <span class="pk-tile-foot">
        <span class="pk-tile-text">
          <span v-if="item.photo.critique" class="pk-tile-critique">{{ item.photo.critique }}</span>
          <span class="pk-tile-name">{{ item.photo.name }}</span>
        </span>
        <span class="pk-tile-score">{{ formatScore(item.score) }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.pk-grid {
  position: relative;
  width: 100%;
}

.pk-tile {
  position: absolute;
  top: 0;
  left: 0;
  padding: 0;
  border: 0;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  color: inherit;
  background: #0e0e13;
  will-change: transform;
}

.pk-tile-ph {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(
      110deg,
      rgba(255, 255, 255, 0.02) 30%,
      rgba(255, 255, 255, 0.07) 50%,
      rgba(255, 255, 255, 0.02) 70%
    )
    0 0 / 300% 100%;
  animation: pk-shimmer 1.8s linear infinite;
}

.pk-tile img.is-loaded + .pk-tile-ph {
  display: none;
}

.pk-grid.is-animated .pk-tile {
  transition:
    transform 0.85s var(--pk-ease),
    width 0.85s var(--pk-ease),
    height 0.85s var(--pk-ease),
    box-shadow 0.3s var(--pk-ease);
}

.pk-grid.is-entering .pk-tile {
  animation: pk-tile-in 0.7s var(--pk-ease) both;
  animation-delay: calc(var(--i) * 28ms);
}

.pk-tile img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transform: scale(1.02);
  transition:
    opacity 0.6s var(--pk-ease),
    transform 0.9s var(--pk-ease);
}

.pk-tile img.is-loaded {
  opacity: 1;
  transform: scale(1);
}

.pk-tile:hover {
  z-index: 2;
  box-shadow:
    0 0 0 1.5px rgba(255, 255, 255, 0.5),
    0 22px 50px -12px rgba(0, 0, 0, 0.8);
}

.pk-tile:hover img.is-loaded {
  transform: scale(1.04);
}

.pk-tile-rank {
  position: absolute;
  z-index: 2;
  top: 8px;
  left: 8px;
  min-width: 30px;
  padding: 4px 9px 5px 8px;
  border-radius: 999px;
  text-align: center;
  font-family: var(--pk-serif);
  font-style: italic;
  font-size: 15px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.95);
  background: rgba(8, 8, 12, 0.55);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-variant-numeric: lining-nums;
}

.pk-tile.is-top .pk-tile-rank {
  color: var(--pk-gold-2);
  border-color: rgba(244, 183, 64, 0.6);
  box-shadow: 0 0 14px rgba(244, 183, 64, 0.3);
}

.pk-tile-foot {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  padding: 26px 8px 8px 10px;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.7), transparent);
  transition: background 0.3s var(--pk-ease);
}

.pk-tile:hover .pk-tile-foot {
  background: linear-gradient(0deg, rgba(4, 4, 7, 0.92) 0%, rgba(4, 4, 7, 0.6) 65%, transparent);
}

.pk-tile-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}

/* Hidden until hover; long critiques end in an ellipsis instead of covering the photo. */
.pk-tile-critique {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  max-height: 0;
  font-family: var(--pk-serif);
  font-style: italic;
  font-size: 13px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.92);
  opacity: 0;
  transition:
    opacity 0.3s var(--pk-ease),
    max-height 0.35s var(--pk-ease);
}

.pk-tile:hover .pk-tile-critique {
  max-height: 4.2em;
  opacity: 1;
}

.pk-tile-name {
  min-width: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 0.3s var(--pk-ease),
    transform 0.3s var(--pk-ease);
}

.pk-tile:hover .pk-tile-name {
  opacity: 1;
  transform: none;
}

.pk-tile-score {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  font-family: var(--pk-serif);
  font-size: 13px;
  font-variant-numeric: lining-nums tabular-nums;
  color: var(--pk-text);
  background: rgba(8, 8, 12, 0.6);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.pk-tile.is-top .pk-tile-score {
  color: #1a1206;
  background: var(--pk-gold-gradient);
  border-color: transparent;
}

@keyframes pk-shimmer {
  to {
    background-position: -300% 0;
  }
}

@keyframes pk-tile-in {
  from {
    opacity: 0;
    filter: blur(6px);
  }
}

@media (max-width: 640px) {
  .pk-tile {
    border-radius: 6px;
  }
  .pk-tile-rank {
    top: 5px;
    left: 5px;
    min-width: 24px;
    padding: 3px 7px 4px 6px;
    font-size: 12px;
  }
  .pk-tile-score {
    font-size: 11px;
    padding: 2px 7px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pk-grid.is-animated .pk-tile {
    transition: none;
  }
}
</style>
