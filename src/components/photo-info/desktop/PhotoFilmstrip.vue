<template>
  <div v-if="photos.length > 1" ref="stripEl" class="filmstrip">
    <n-button
      class="strip-arrow"
      size="tiny"
      circle
      quaternary
      :disabled="currentIndex <= 0"
      @click="emit('navigate', currentIndex - 1)"
      title="Previous photo (left arrow)"
    >
      <template #icon>
        <n-icon size="16"><ChevronBack /></n-icon>
      </template>
    </n-button>

    <div class="strip-track">
      <button
        v-for="item in windowItems"
        :key="item.photo.id || item.index"
        type="button"
        class="strip-thumb"
        :class="{ active: item.index === currentIndex }"
        :title="item.photo.originalFileName || ''"
        @click="emit('navigate', item.index)"
      >
        <img
          :src="item.photo.thumbnailUrl"
          :alt="item.photo.originalFileName || 'Photo'"
          loading="lazy"
        />
      </button>
    </div>

    <n-button
      class="strip-arrow"
      size="tiny"
      circle
      quaternary
      :disabled="currentIndex >= photos.length - 1"
      @click="emit('navigate', currentIndex + 1)"
      title="Next photo (right arrow)"
    >
      <template #icon>
        <n-icon size="16"><ChevronForward /></n-icon>
      </template>
    </n-button>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { NButton, NIcon } from "naive-ui";
import {
  ChevronBackOutline as ChevronBack,
  ChevronForwardOutline as ChevronForward,
} from "@vicons/ionicons5";

defineOptions({ name: "PhotoFilmstrip" });

const props = defineProps({
  photos: { type: Array, default: () => [] },
  currentIndex: { type: Number, default: -1 },
});

const emit = defineEmits(["navigate"]);

// Ancho de celda + gap, en sincronia con el CSS de .strip-thumb.
const THUMB_WIDTH = 84;
const GAP = 6;
const ARROWS_WIDTH = 76;

const stripEl = ref(null);
const trackWidth = ref(0);

let resizeObserver = null;

// El nodo va detras de un v-if (listas de una sola foto no pintan tira), y hay
// pantallas que reciben la lista despues de abrir el dialogo: por eso se
// observa el ref y no el onMounted.
watch(stripEl, (el) => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  trackWidth.value = 0;
  if (!el) return;

  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect?.width ?? 0;
    trackWidth.value = Math.max(0, width - ARROWS_WIDTH);
  });
  resizeObserver.observe(el);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

// Cuantas miniaturas caben de verdad. Se pinta exactamente esa ventana y no
// mas: con listas de miles de fotos, renderizarlas todas (o dejar que la tira
// scrollee) cuesta memoria y pelea con el auto-centrado en cada navegacion.
const perView = computed(() => {
  if (!trackWidth.value) return 0;
  return Math.max(1, Math.floor((trackWidth.value + GAP) / (THUMB_WIDTH + GAP)));
});

const windowItems = computed(() => {
  const list = props.photos || [];
  const count = Math.min(perView.value, list.length);
  if (count <= 0) return [];

  const anchor = props.currentIndex >= 0 ? props.currentIndex : 0;
  let start = anchor - Math.floor(count / 2);
  start = Math.max(0, Math.min(start, list.length - count));

  return list
    .slice(start, start + count)
    .map((photo, offset) => ({ photo, index: start + offset }));
});
</script>

<style scoped>
.filmstrip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  height: 76px;
  flex: 0 0 auto;
  padding: 0 var(--spacing-xs);
  overflow: hidden;
}

.strip-arrow {
  flex: 0 0 auto;
  color: var(--text-tertiary);
}

.strip-track {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.strip-thumb {
  flex: 0 0 auto;
  width: 84px;
  height: 64px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-surface);
  opacity: 0.55;
  transition:
    opacity 0.2s ease,
    border-color 0.2s ease;
}

.strip-thumb:hover {
  opacity: 0.85;
}

.strip-thumb.active {
  opacity: 1;
  border-color: var(--primary-color);
}

.strip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
