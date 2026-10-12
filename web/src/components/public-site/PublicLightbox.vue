<template>
  <Teleport to="body">
    <Transition name="pk-lb">
      <div
        v-if="isOpen"
        class="pk-lb"
        role="dialog"
        aria-modal="true"
        :aria-label="current?.title || `Photo ${index + 1} of ${photos.length}`"
        @click.self="close"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <button
          type="button"
          class="pk-lb-btn pk-lb-close"
          aria-label="Close"
          @click="close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </button>

        <button
          v-if="photos.length > 1"
          type="button"
          class="pk-lb-btn pk-lb-arrow pk-lb-prev"
          aria-label="Previous photo"
          @click.stop="prev"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <button
          v-if="photos.length > 1"
          type="button"
          class="pk-lb-btn pk-lb-arrow pk-lb-next"
          aria-label="Next photo"
          @click.stop="next"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <div class="pk-lb-stage" @click.self="close">
          <Transition :name="`pk-slide-${direction}`" mode="out-in">
            <figure v-if="current" :key="current.id" class="pk-lb-figure">
              <div class="pk-lb-frame">
                <img
                  class="pk-lb-img pk-lb-img-preview"
                  :src="current.thumbnailUrl"
                  alt=""
                  aria-hidden="true"
                  draggable="false"
                />
                <img
                  class="pk-lb-img pk-lb-img-full"
                  :class="{ 'is-loaded': fullLoaded }"
                  :src="current.originalUrl || current.thumbnailUrl"
                  :alt="current.title || ''"
                  draggable="false"
                  @load="fullLoaded = true"
                />
              </div>
              <figcaption v-if="current.title" class="pk-lb-caption">
                {{ current.title }}
              </figcaption>
            </figure>
          </Transition>
        </div>

        <p v-if="photos.length > 1" class="pk-lb-counter">
          {{ index + 1 }}&thinsp;/&thinsp;{{ photos.length }}
        </p>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";

const props = defineProps({
  photos: { type: Array, required: true },
  index: { type: Number, default: -1 },
});

const emit = defineEmits(["update:index"]);

const isOpen = computed(() => props.index >= 0 && props.index < props.photos.length);
const current = computed(() => (isOpen.value ? props.photos[props.index] : null));

const direction = ref("next");
const fullLoaded = ref(false);

function go(target, dir) {
  const count = props.photos.length;
  if (!count) return;
  direction.value = dir;
  emit("update:index", (target + count) % count);
}

function next() {
  go(props.index + 1, "next");
}

function prev() {
  go(props.index - 1, "prev");
}

function close() {
  emit("update:index", -1);
}

function onKeydown(event) {
  if (!isOpen.value) return;
  if (event.key === "Escape") close();
  else if (event.key === "ArrowRight") next();
  else if (event.key === "ArrowLeft") prev();
}

// ── Swipe ──────────────────────────────────────────────────
let touchStartX = 0;
let touchStartY = 0;

function onTouchStart(event) {
  touchStartX = event.changedTouches[0].clientX;
  touchStartY = event.changedTouches[0].clientY;
}

function onTouchEnd(event) {
  const dx = event.changedTouches[0].clientX - touchStartX;
  const dy = event.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
  if (dx < 0) next();
  else prev();
}

// ── Side effects ───────────────────────────────────────────
function preload(photo) {
  if (!photo?.originalUrl) return;
  const img = new Image();
  img.src = photo.originalUrl;
}

let previousOverflow = "";

watch(isOpen, (open) => {
  if (open) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeydown);
  } else {
    document.body.style.overflow = previousOverflow;
    document.removeEventListener("keydown", onKeydown);
  }
});

watch(current, (photo) => {
  fullLoaded.value = false;
  if (!photo) return;
  const count = props.photos.length;
  preload(props.photos[(props.index + 1) % count]);
  preload(props.photos[(props.index - 1 + count) % count]);
});

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow;
  document.removeEventListener("keydown", onKeydown);
});
</script>

<style scoped>
/* The lightbox is deliberately dark in both themes. */
.pk-lb {
  --lb-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --lb-gutter: clamp(16px, 4vw, 56px);
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(8, 8, 8, 0.94);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  color: #f2f2f2;
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.pk-lb-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--lb-gutter);
}

.pk-lb-figure {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 100%;
  max-height: 100%;
}

.pk-lb-frame {
  position: relative;
  display: grid;
  max-width: calc(100vw - 2 * var(--lb-gutter));
  max-height: calc(100svh - 2 * var(--lb-gutter) - 40px);
}

.pk-lb-img {
  grid-area: 1 / 1;
  display: block;
  max-width: calc(100vw - 2 * var(--lb-gutter));
  max-height: calc(100svh - 2 * var(--lb-gutter) - 40px);
  width: auto;
  height: auto;
  object-fit: contain;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
  user-select: none;
}

.pk-lb-img-full {
  opacity: 0;
  transition: opacity 0.6s var(--lb-ease);
}

.pk-lb-img-full.is-loaded {
  opacity: 1;
}

.pk-lb-caption {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: rgba(242, 242, 242, 0.7);
}

.pk-lb-btn {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.65;
  transition:
    opacity 0.3s var(--lb-ease),
    background-color 0.3s var(--lb-ease);
}

.pk-lb-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.08);
}

.pk-lb-btn svg {
  width: 24px;
  height: 24px;
}

.pk-lb-close {
  top: 18px;
  right: 18px;
}

.pk-lb-arrow {
  top: 50%;
  transform: translateY(-50%);
  width: 56px;
  height: 56px;
}

.pk-lb-prev {
  left: 12px;
}

.pk-lb-next {
  right: 12px;
}

.pk-lb-counter {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18px;
  margin: 0;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: rgba(242, 242, 242, 0.55);
  pointer-events: none;
}

/* ── Transitions ─────────────────────────────────────────── */
.pk-lb-enter-active {
  transition: opacity 0.35s var(--lb-ease);
}

.pk-lb-leave-active {
  transition: opacity 0.25s var(--lb-ease);
}

.pk-lb-enter-from,
.pk-lb-leave-to {
  opacity: 0;
}

.pk-lb-enter-active .pk-lb-figure {
  animation: pk-lb-zoom 0.45s var(--lb-ease);
}

@keyframes pk-lb-zoom {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.pk-slide-next-enter-active,
.pk-slide-prev-enter-active {
  transition:
    opacity 0.35s var(--lb-ease),
    transform 0.35s var(--lb-ease);
}

.pk-slide-next-leave-active,
.pk-slide-prev-leave-active {
  transition:
    opacity 0.18s var(--lb-ease),
    transform 0.18s var(--lb-ease);
}

.pk-slide-next-enter-from {
  opacity: 0;
  transform: translateX(18px);
}

.pk-slide-next-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.pk-slide-prev-enter-from {
  opacity: 0;
  transform: translateX(-18px);
}

.pk-slide-prev-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

@media (max-width: 760px) {
  .pk-lb-arrow {
    width: 44px;
    height: 44px;
    top: auto;
    bottom: 44px;
    transform: none;
  }

  .pk-lb-prev {
    left: 16px;
  }

  .pk-lb-next {
    right: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pk-lb *,
  .pk-lb {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
</style>
