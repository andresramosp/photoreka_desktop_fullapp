<template>
  <div
    class="photo-stage"
    :class="{ 'photo-hovered': isPhotoHovered }"
    @mousemove="handlePhotoAreaMouseMove"
    @mouseleave="isPhotoHovered = false"
  >
    <!-- Cierre del dialogo: vive fuera de .stage-chrome porque ese contenedor
         se oculta con opacity, y la X tiene que estar siempre visible. -->
    <n-button
      class="stage-chip stage-close-btn"
      size="small"
      quaternary
      circle
      @click="emit('close')"
      title="Close (Esc)"
    >
      <template #icon>
        <n-icon size="18">
          <CloseIcon />
        </n-icon>
      </template>
    </n-button>

    <!-- Navigation Arrow Left -->
    <n-button
      v-if="canNavigate && hasPreviousPhoto"
      class="dialog-nav-arrow dialog-nav-arrow-left"
      size="small"
      circle
      quaternary
      @click="emit('photo-navigate', currentPhotoIndex - 1)"
      title="Previous photo (left arrow)"
    >
      <template #icon>
        <n-icon size="18">
          <ChevronBack />
        </n-icon>
      </template>
    </n-button>

    <!-- La imagen nunca se deforma: contain + max 100% en ambos ejes, asi que
         horizontal, vertical y cuadrada quedan enmarcadas con su padding. -->
    <img
      :src="selectedPhoto?.originalUrl || selectedPhoto?.thumbNailUrl"
      :alt="selectedPhoto?.filename || selectedPhoto?.name || 'Photo'"
      class="stage-photo"
      @load="emit('image-load')"
      @error="emit('image-error', $event)"
    />

    <!-- Spinner de navegacion: cubre el area de la foto mientras el padre trae
         la siguiente del back y hasta que su imagen termina de cargar. -->
    <div v-if="loading" class="stage-loading-overlay">
      <n-spin size="large" />
    </div>

    <!-- Navigation Arrow Right -->
    <n-button
      v-if="canNavigate && hasNextPhoto"
      class="dialog-nav-arrow dialog-nav-arrow-right"
      size="small"
      circle
      quaternary
      @click="emit('photo-navigate', currentPhotoIndex + 1)"
      title="Next photo (right arrow)"
    >
      <template #icon>
        <n-icon size="18">
          <ChevronForward />
        </n-icon>
      </template>
    </n-button>

    <!-- Los controles viven en las bandas negras reservadas arriba y abajo
         (el padding del stage), asi que nunca tapan la foto, y solo aparecen
         al pasar el raton. -->
    <div class="stage-chrome stage-chrome-top">
      <!-- Top left: filename + photo credit badge (if available) -->
      <div class="top-left-actions">
        <div class="stage-filename" :title="filename">
          {{ filename }}
        </div>

        <a
          v-if="photoCredit"
          :href="photoCredit.url"
          target="_blank"
          rel="noopener noreferrer"
          class="photo-credit-badge"
          :title="'Photo by ' + photoCredit.username"
        >
          <n-icon size="16">
            <LogoInstagram />
          </n-icon>
          <span>{{ photoCredit.username }}</span>
        </a>
      </div>

      <!-- Top right: original en el disco (escritorio) + Fullscreen -->
      <div class="top-right-actions">
        <template v-if="originals.available && selectedPhoto?.id">
          <n-button
            size="small"
            quaternary
            circle
            class="stage-chip"
            @click="originals.showOriginal(selectedPhoto.id)"
            :title="'Show original in ' + originals.fileManagerName"
          >
            <template #icon>
              <n-icon size="18">
                <FolderOpenOutline />
              </n-icon>
            </template>
          </n-button>
          <n-button
            size="small"
            quaternary
            circle
            class="stage-chip"
            @click="originals.openOriginal(selectedPhoto.id)"
            title="Open original"
          >
            <template #icon>
              <n-icon size="18">
                <OpenOutline />
              </n-icon>
            </template>
          </n-button>
        </template>
        <n-button
          size="small"
          quaternary
          circle
          class="stage-chip"
          @click="emit('open-fullscreen')"
          title="View fullscreen"
        >
          <template #icon>
            <n-icon size="18">
              <FullscreenOutlined />
            </n-icon>
          </template>
        </n-button>
      </div>
    </div>

    <!-- Bottom: Floating action bar centrada en la banda inferior -->
    <div class="stage-chrome stage-chrome-bottom">
      <!-- Bottom left: curation flag -->
      <div
        class="stage-chip flag-control"
        :class="'flag-' + (selectedPhoto?.flag || 'none')"
        @click="emit('set-flag')"
        :title="
          selectedPhoto?.flag === 'picked'
            ? 'Picked (click to reject)'
            : selectedPhoto?.flag === 'rejected'
              ? 'Rejected (click to clear)'
              : 'Unflagged (click to pick)'
        "
      >
        <n-icon size="18">
          <FlagOutlineIcon />
        </n-icon>
      </div>

      <FloatingActionBar
        :embedded="true"
        :selected-ids="selectedPhoto?.id ? [selectedPhoto.id] : []"
        :show-add-to-collection="showAddToCollection"
        :show-move-to-tool="showMoveToTool"
        :show-send-to-chat="showSendToChat"
        @download="emit('download')"
        @add-to-collection="emit('add-to-collection')"
        @move-to-tool="emit('move-to-tool')"
        @send-to-chat="emit('send-to-chat')"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { NButton, NIcon, NSpin } from "naive-ui";
import {
  ChevronBackOutline as ChevronBack,
  ChevronForwardOutline as ChevronForward,
  CloseOutline as CloseIcon,
  FlagOutline as FlagOutlineIcon,
  FolderOpenOutline,
  LogoInstagram,
  OpenOutline,
} from "@vicons/ionicons5";
import { FullscreenOutlined } from "@vicons/material";
import FloatingActionBar from "../../FloatingActionBar.vue";
import { useOriginals } from "@/composables/useOriginals.js";

defineOptions({ name: "PhotoStage" });

const props = defineProps({
  selectedPhoto: { type: Object, default: null },
  photoCredit: { type: Object, default: null },
  allPhotos: { type: Array, default: () => [] },
  currentPhotoIndex: { type: Number, default: -1 },
  showAddToCollection: { type: Boolean, default: true },
  showMoveToTool: { type: Boolean, default: true },
  showSendToChat: { type: Boolean, default: false },
  /** Pinta el spinner sobre la foto: lo gobierna el layout, que sabe cuando
   *  hay una navegacion en vuelo. */
  loading: { type: Boolean, default: false },
});

const emit = defineEmits([
  "image-load",
  "image-error",
  "download",
  "open-fullscreen",
  "add-to-collection",
  "move-to-tool",
  "send-to-chat",
  "set-flag",
  "photo-navigate",
  "close",
]);

const originals = useOriginals();

const isPhotoHovered = ref(false);

const handlePhotoAreaMouseMove = (event) => {
  isPhotoHovered.value = !event.target.closest(".dialog-nav-arrow");
};

const filename = computed(
  () => props.selectedPhoto?.originalFileName || "Untitled",
);

const canNavigate = computed(() => props.allPhotos?.length > 1);

const hasPreviousPhoto = computed(
  () => props.allPhotos?.length > 0 && props.currentPhotoIndex > 0,
);

const hasNextPhoto = computed(
  () =>
    props.allPhotos?.length > 0 &&
    props.currentPhotoIndex < props.allPhotos.length - 1,
);
</script>

<style scoped>
.photo-stage {
  /* Banda negra reservada arriba y abajo para los controles, y margen lateral
     para que las flechas de navegacion tampoco pisen la foto. Al ser padding
     del contenedor el margen es igual para horizontales, verticales y
     cuadradas, y no encoge la foto de forma desigual como haria un
     max-width en porcentaje. */
  --stage-chrome: 54px;
  width: 100%;
  /* No hay border-box global en el proyecto, asi que sin esto el padding se
     sumaria al 100% y el stage se saldria por encima del panel derecho. */
  box-sizing: border-box;
  /* Se queda con todo el alto que sobra en la columna izquierda tras el
     filmstrip; la imagen se centra dentro sin recortarse. */
  flex: 1 1 0;
  min-height: 0;
  padding: var(--stage-chrome) clamp(20px, 3%, 44px);
  background: var(--bg-body);
  border: 1px solid var(--border-color);
  /* border-radius: var(--radius-md); */
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.stage-photo {
  /* 100% del area util (el content box, ya sin el padding): la foto ocupa
     todo lo que puede sin deformarse ni invadir las bandas. */
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: center;
  background-color: transparent;
}

/* Tapa toda la caja del stage (bandas incluidas) para que la foto anterior no
   se lea como la nueva mientras llega la que se ha pedido. */
.stage-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-body), transparent 35%);
  backdrop-filter: blur(2px);
}

/* Chip gris comun a todos los controles del stage (cerrar, bandera,
   fullscreen): el negro translucido se perdia sobre la banda negra. */
.stage-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-primary) !important;
  background: var(--bg-surface) !important;
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition:
    background-color 0.2s ease,
    transform 0.15s ease;
}

.stage-chip:hover {
  transform: scale(1.08);
  background: var(--border-color-hover) !important;
}

/* La X de cierre no depende del hover: es el unico control del dialogo ahora
   que no hay cabecera, asi que tiene que estar siempre a la vista. */
.stage-close-btn {
  position: absolute;
  top: calc((var(--stage-chrome) - 32px) / 2);
  left: var(--spacing-sm);
  z-index: 7;
}

/* Dialog-level navigation arrows */
.dialog-nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 6;
  background: rgba(0, 0, 0, 0.35) !important;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  color: white !important;
  width: 32px;
  height: 32px;
  opacity: 0;
  transition:
    opacity 0.25s ease,
    background 0.2s ease,
    transform 0.2s ease;
}

.photo-stage:hover .dialog-nav-arrow {
  opacity: 0.7;
}

.dialog-nav-arrow:hover {
  opacity: 1 !important;
  background: rgba(0, 0, 0, 0.55) !important;
  border-color: rgba(255, 255, 255, 0.3) !important;
  transform: translateY(-50%) scale(1.1);
}

.dialog-nav-arrow:active {
  transform: translateY(-50%) scale(0.95);
}

.dialog-nav-arrow-left {
  left: 8px;
}

.dialog-nav-arrow-right {
  right: 8px;
}

/* Bandas de controles: ocupan exactamente el padding reservado del stage, asi
   que siempre quedan sobre negro y nunca encima de la foto. Solo en hover. */
.stage-chrome {
  position: absolute;
  left: 0;
  right: 0;
  height: var(--stage-chrome);
  box-sizing: border-box;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-sm);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.photo-stage.photo-hovered .stage-chrome {
  opacity: 1;
  pointer-events: auto;
}

.stage-chrome-top {
  top: 0;
  justify-content: space-between;
}

/* La barra de acciones va centrada en el hueco negro bajo la foto; la bandera
   se ancla a la izquierda para no descentrarla. */
.stage-chrome-bottom {
  bottom: 0;
  justify-content: center;
}

.stage-chrome-bottom .flag-control {
  position: absolute;
  left: var(--spacing-sm);
}

.top-left-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  /* Hueco para la X, que va absoluta en la misma esquina. */
  padding-left: 40px;
  min-width: 0;
}

/* Sustituye a la cabecera: el nombre solo aparece con el resto del chrome. */
/* Texto suelto sobre la banda negra: sustituye al titulo de la cabecera, no
   es un control, asi que no lleva pastilla. */
.stage-filename {
  /* Centrado respecto a toda la banda superior (no al hueco entre las
     acciones de izquierda y derecha), por eso sale del flujo flex. */
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  min-width: 0;
  max-width: min(420px, 40vw);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-right-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* Solo se colorea el icono outlined; el fondo del chip se mantiene neutro
   para no chocar con la interfaz. */
.flag-control.flag-picked {
  color: var(--success-color) !important;
}

.flag-control.flag-rejected {
  color: var(--error-color) !important;
}

/* Tachado tipo "reject" de Lightroom, igual que el indicador de la card */
.flag-control.flag-rejected .n-icon {
  position: relative;
}

.flag-control.flag-rejected .n-icon::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 120%;
  height: 2px;
  background: currentColor;
  transform: rotate(-45deg);
}

/* Photo credit badge - generic for any user */
.photo-credit-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  border-radius: 20px;
  color: white;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  opacity: 0.8;
  transition: all 0.3s ease;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.photo-credit-badge:hover {
  opacity: 1;
  background: rgba(225, 48, 108, 0.8);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(225, 48, 108, 0.3);
}

.photo-credit-badge span {
  line-height: 1;
}
</style>
