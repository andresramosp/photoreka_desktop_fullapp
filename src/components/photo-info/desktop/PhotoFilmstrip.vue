<template>
  <div
    v-if="photos.length > 1"
    class="filmstrip"
    :style="{ '--thumb-size': `${THUMB_SIZE}px`, '--thumb-gap': `${GAP}px` }"
  >
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

    <div ref="trackEl" class="strip-track">
      <PhotoCard
        v-for="item in windowItems"
        :key="item.photo.id || item.index"
        :photo="item.photo"
        class="strip-thumb"
        :class="{ active: item.index === currentIndex }"
        :title="item.photo.originalFileName || ''"
        :show-stars="false"
        :show-tags="false"
        :show-info-button="false"
        :show-delete-button="false"
        :hide-fullscreen="true"
        @select="emit('navigate', item.index)"
      />
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
import PhotoCard from "@/components/photoCards/PhotoCard.vue";

defineOptions({ name: "PhotoFilmstrip" });

const props = defineProps({
  photos: { type: Array, default: () => [] },
  currentIndex: { type: Number, default: -1 },
});

const emit = defineEmits(["navigate"]);

// perView necesita el tamano de celda en px, y el CSS no puede pasarselo a JS:
// por eso las medidas viven aqui y se inyectan al CSS como custom properties.
// PhotoCard es siempre cuadrado (aspect-ratio: 1), asi que la celda tambien lo es.
const THUMB_SIZE = 94;
const GAP = 6;

const trackEl = ref(null);
const trackWidth = ref(0);

let resizeObserver = null;

// Se mide la pista y no la tira entera para no tener que restar a mano el ancho
// de las flechas. La pista es flex-basis 0, asi que su ancho sale del espacio
// disponible y no de las miniaturas que contiene (si no, seria circular).
// El nodo va detras de un v-if (listas de una sola foto no pintan tira), y hay
// pantallas que reciben la lista despues de abrir el dialogo: por eso se
// observa el ref y no el onMounted.
watch(trackEl, (el) => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  trackWidth.value = 0;
  if (!el) return;

  resizeObserver = new ResizeObserver((entries) => {
    trackWidth.value = Math.max(0, entries[0]?.contentRect?.width ?? 0);
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
  return Math.max(1, Math.floor((trackWidth.value + GAP) / (THUMB_SIZE + GAP)));
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
/* Sin alto fijo a proposito: lo marca la propia celda (--thumb-size), asi
   subir el tamano de las miniaturas no las recorta contra el contenedor. */
.filmstrip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  flex: 0 0 auto;
  padding: var(--spacing-sm);
  overflow: hidden;
}

.strip-arrow {
  flex: 0 0 auto;
  color: var(--text-tertiary);
}

/* flex-basis 0: el ancho sale del hueco entre las flechas, nunca del contenido.
   Es lo que permite medirla para calcular cuantas miniaturas caben. */
.strip-track {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--thumb-gap);
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
}

/* PhotoCard ya es cuadrado (aspect-ratio: 1); se fija solo el ancho y se
   bloquea el stretch del flex para que nada lo deforme. */
.strip-thumb {
  flex: 0 0 auto;
  align-self: center;
  width: var(--thumb-size);
  height: auto;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  opacity: 0.35;
  transition: opacity 0.2s ease;
}

.strip-thumb:hover {
  opacity: 0.65;
}

.strip-thumb.active {
  opacity: 1;
}
</style>
