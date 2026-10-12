<template>
  <div
    ref="containerRef"
    class="canvas-board-preview show-dots"
    :class="`bg-${canvasBackgroundId}`"
  >
    <v-stage
      v-if="photos.length > 0"
      ref="stageRef"
      :config="stageConfig"
      @wheel="handleWheel"
      @mousedown="handleStagePointerDown"
      @click="handleStageClick"
    >
      <v-layer>
        <v-image
          v-for="photo in sortedPhotos"
          :key="photo.id"
          :config="{
            x: photo.config.x,
            y: photo.config.y,
            width: photo.config.width,
            height: photo.config.height,
            opacity: photo.config.opacity ?? 1,
            image: photo.image,
            // Same idle frame the real board draws (see getPhotoStrokeColor).
            stroke: 'gray',
            strokeWidth: 2.5,
            listening: false,
            // See CanvasView: keeps Konva off the buffer-canvas path that can
            // throw on 0×0 canvases.
            perfectDrawEnabled: false,
          }"
        />
      </v-layer>
    </v-stage>

    <div
      v-else-if="!isLoading"
      class="preview-empty-state"
      @click="openFullCanvas"
    >
      <n-icon size="32" color="var(--text-tertiary)">
        <ImageOutline />
      </n-icon>
      <p>{{ hasCanvas ? "This canvas is empty" : "No canvas yet" }}</p>
      <span class="preview-empty-link">Open the canvas</span>
    </div>

    <!-- Basic zoom controls, the same corner the real canvas keeps them in. -->
    <div v-if="photos.length > 0" class="preview-zoom-controls">
      <n-button-group vertical>
        <n-button size="small" @click="zoomTick(1)">
          <template #icon>
            <n-icon><AddOutline /></n-icon>
          </template>
        </n-button>
        <n-button size="small" @click="zoomTick(-1)">
          <template #icon>
            <n-icon><RemoveOutline /></n-icon>
          </template>
        </n-button>
        <n-button size="small" @click="fitToPhotos">
          <template #icon>
            <n-icon><ExpandAltOutlined /></n-icon>
          </template>
        </n-button>
      </n-button-group>
    </div>
  </div>
</template>

<script setup>
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { NButton, NButtonGroup, NIcon } from "naive-ui";
import { AddOutline, RemoveOutline, ImageOutline } from "@vicons/ionicons5";
import { ExpandAltOutlined } from "@vicons/antd";
import { applyZoom } from "@/composables/canvas/useCanvasStage";
import { useLatestCanvas } from "@/composables/useLatestCanvas";
import { useTheme } from "@/composables/useTheme.js";
// Preview readonly del último canvas: solo zoom y panning del stage. Las fotos
// no escuchan (listening:false), así que ni clic ni selección — cualquier gesto
// es del tablero. Abrir el canvas completo lo resuelve el padre (PhotoUniverse),
// que es quien puede devolver el preview a su modo por defecto.
const emit = defineEmits(["open-full"]);

const props = defineProps({
  // Fotos a pintar en lugar del último canvas ([{id, src, config}]). Con
  // ellas el tablero es un preview de esa lista y no toca useLatestCanvas.
  photos: { type: Array, default: null },
  // Multiplica el zoom del encuadre inicial. Por debajo de 1 el tablero se ve
  // más alejado, para quien pinte algo encima y necesite el margen.
  fitScale: { type: Number, default: 1 },
});

const latest = useLatestCanvas();
const usesLatestCanvas = props.photos === null;
const hasCanvas = computed(() =>
  usesLatestCanvas ? latest.hasCanvas.value : true,
);
const isLoading = computed(() =>
  usesLatestCanvas ? latest.isLoading.value : false,
);
const previewPhotos = computed(() =>
  usesLatestCanvas ? latest.previewPhotos.value : props.photos,
);

// El mismo fondo por defecto del canvas real: "default" (negro) en dark,
// "gray" en light, siguiendo el theme como hace toolbarState.canvasBackground
// en CanvasView hasta que el usuario pisa uno explícito.
const { isDarkMode } = useTheme();
const canvasBackgroundId = computed(() =>
  isDarkMode.value ? "default" : "gray",
);

const containerRef = ref(null);
const stageRef = ref(null);

const stageConfig = reactive({
  width: 0,
  height: 0,
  draggable: true,
});

// [{id, src, config, image}]
const photos = ref([]);

// zIndex manda en el apilado, igual que en el canvas real.
const sortedPhotos = computed(() =>
  [...photos.value].sort(
    (a, b) => (a.config.zIndex ?? 0) - (b.config.zIndex ?? 0),
  ),
);

const fitToPhotos = () => {
  const stage = stageRef.value?.getStage();
  if (!stage || photos.value.length === 0) return;

  const bounds = photos.value.reduce(
    (acc, p) => {
      const { x, y, width, height } = p.config;
      acc.minX = Math.min(acc.minX, x);
      acc.minY = Math.min(acc.minY, y);
      acc.maxX = Math.max(acc.maxX, x + width);
      acc.maxY = Math.max(acc.maxY, y + height);
      return acc;
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );

  const margin = 40;
  const paddingRatio = 0.1;
  const paddingX = (bounds.maxX - bounds.minX) * paddingRatio;
  const paddingY = (bounds.maxY - bounds.minY) * paddingRatio;
  bounds.minX -= paddingX;
  bounds.maxX += paddingX;
  bounds.minY -= paddingY;
  bounds.maxY += paddingY;

  const contentWidth = bounds.maxX - bounds.minX + margin * 2;
  const contentHeight = bounds.maxY - bounds.minY + margin * 2;
  const zoom =
    Math.min(stage.width() / contentWidth, stage.height() / contentHeight, 2) *
    props.fitScale;

  stage.scale({ x: zoom, y: zoom });
  stage.position({
    x:
      (stage.width() - contentWidth * zoom) / 2 -
      bounds.minX * zoom +
      margin * zoom,
    y:
      (stage.height() - contentHeight * zoom) / 2 -
      bounds.minY * zoom +
      margin * zoom,
  });
  stage.batchDraw();
};

const handleWheel = (e) => {
  e.evt.preventDefault();
  const stage = stageRef.value?.getStage();
  if (!stage) return;
  const pointer = stage.getPointerPosition();
  const oldScale = stage.scaleX();
  const scaleBy = 1.11;
  const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
  applyZoom(stage, newScale, null, pointer);
};

const zoomTick = (direction = 1) => {
  const stage = stageRef.value?.getStage();
  if (!stage) return;
  const scaleBy = 1.11;
  const oldScale = stage.scaleX();
  const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
  applyZoom(stage, newScale, null, {
    x: stage.width() / 2,
    y: stage.height() / 2,
  });
};

// Un click en el tablero abre el canvas completo. Hay que distinguirlo de un
// pan: Konva dispara click al soltar aunque el puntero haya arrastrado el
// stage, así que se mide el recorrido entre mousedown y click como en
// CanvasView (STAGE_CLICK_DRAG_THRESHOLD).
let pointerDownPos = null;
const CLICK_DRAG_THRESHOLD = 6;

const openFullCanvas = () => emit("open-full");

const handleStagePointerDown = (e) => {
  const stage = e.target.getStage();
  pointerDownPos = stage ? stage.getPointerPosition() : null;
};

const handleStageClick = (e) => {
  const stage = e.target.getStage();
  const end = stage?.getPointerPosition();
  const start = pointerDownPos;
  pointerDownPos = null;
  if (
    start &&
    end &&
    Math.hypot(end.x - start.x, end.y - start.y) > CLICK_DRAG_THRESHOLD
  ) {
    return;
  }
  openFullCanvas();
};

// Las imágenes se cargan fuera de la reactividad profunda (markRaw), como en
// CanvasView: un Proxy de Vue en drawImage rompe el render de Konva.
watch(
  previewPhotos,
  (incoming) => {
    photos.value = incoming.map((p) => ({ ...p, image: null }));
    photos.value.forEach((photo) => {
      const img = new Image();
      img.onload = () => {
        photo.image = markRaw(img);
        stageRef.value?.getStage()?.batchDraw();
      };
      img.src = photo.src;
    });
    nextTick(() => fitToPhotos());
  },
  { immediate: true },
);

const handleResize = () => {
  const stage = stageRef.value?.getStage();
  const container = containerRef.value;
  if (!stage || !container) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  // Nunca colapsar a 0: un resize puede llegar con el panel oculto y un stage
  // 0×0 dejaría el fit a escala 0.
  if (w > 0 && h > 0) {
    stage.width(w);
    stage.height(h);
    stageConfig.width = w;
    stageConfig.height = h;
  }
};

let resizeObserver = null;

onMounted(async () => {
  resizeObserver = new ResizeObserver(() => {
    handleResize();
    fitToPhotos();
  });
  if (containerRef.value) resizeObserver.observe(containerRef.value);

  // useLatestCanvas is a shared singleton: PhotoUniverse already awaited this
  // same load before mounting this panel, so it resolves immediately here.
  if (usesLatestCanvas) await latest.loadLatestCanvas();

  await nextTick();
  handleResize();
  fitToPhotos();

  const stage = stageRef.value?.getStage();
  // Pointer en vez de grab: el gesto principal del preview es el click (abre
  // el canvas), no el arrastre, aunque el panning siga disponible.
  if (stage) stage.container().style.cursor = "pointer";
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<style scoped>
.canvas-board-preview {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Fondos y puntos idénticos a los de CanvasView: el stage es transparente, así
   que es el contenedor el que pinta el tablero (y tapa el halo azul del
   dashboard, que no aplica aquí). */
.canvas-board-preview.bg-default {
  background-color: #000000;
}

.canvas-board-preview.bg-gray {
  background-color: #d3d3d3;
}

.canvas-board-preview.show-dots.bg-default {
  background-image: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.15) 1.2px,
    transparent 1.2px
  );
  background-size: 45px 45px;
}

.canvas-board-preview.show-dots.bg-gray {
  background-image: radial-gradient(
    circle,
    rgba(0, 0, 0, 0.15) 1.2px,
    transparent 1.2px
  );
  background-size: 45px 45px;
}

.preview-empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-tertiary);
  cursor: pointer;
}

.preview-empty-state p {
  margin: 0;
  font-size: 13px;
}

.preview-empty-link {
  font-size: 12px;
  color: var(--primary-color);
  text-decoration: none;
}

.preview-empty-link:hover {
  text-decoration: underline;
}

.preview-zoom-controls {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 10;
}
</style>
