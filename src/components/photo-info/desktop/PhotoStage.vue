<template>
  <div
    class="photo-stage"
    :class="{ 'photo-hovered': isPhotoHovered }"
    @mousemove="handlePhotoAreaMouseMove"
    @mouseleave="isPhotoHovered = false"
  >
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
      :src="selectedPhoto?.thumbnailUrl"
      :alt="selectedPhoto?.filename || selectedPhoto?.name || 'Photo'"
      class="stage-photo"
      @error="emit('image-error', $event)"
    />

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

    <!-- Floating Action Bar centered on hover -->
    <div class="photo-action-bar-overlay">
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

    <!-- Photo Overlay with Actions Only -->
    <div class="photo-overlay">
      <!-- Bottom left: Curation flag + photo credit badge (if available) -->
      <div class="bottom-left-actions">
        <div
          class="flag-control"
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
          <n-icon size="16">
            <FlagOutlineIcon />
          </n-icon>
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

      <!-- Bottom right: Fullscreen -->
      <div class="bottom-right-actions">
        <n-button
          size="small"
          quaternary
          class="fullscreen-btn"
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
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { NButton, NIcon } from "naive-ui";
import {
  ChevronBackOutline as ChevronBack,
  ChevronForwardOutline as ChevronForward,
  FlagOutline as FlagOutlineIcon,
  LogoInstagram,
} from "@vicons/ionicons5";
import { FullscreenOutlined } from "@vicons/material";
import FloatingActionBar from "../../FloatingActionBar.vue";

defineOptions({ name: "PhotoStage" });

const props = defineProps({
  selectedPhoto: { type: Object, default: null },
  photoCredit: { type: Object, default: null },
  allPhotos: { type: Array, default: () => [] },
  currentPhotoIndex: { type: Number, default: -1 },
  showAddToCollection: { type: Boolean, default: true },
  showMoveToTool: { type: Boolean, default: true },
  showSendToChat: { type: Boolean, default: false },
});

const emit = defineEmits([
  "image-error",
  "download",
  "open-fullscreen",
  "add-to-collection",
  "move-to-tool",
  "send-to-chat",
  "set-flag",
  "photo-navigate",
]);

const isPhotoHovered = ref(false);

const handlePhotoAreaMouseMove = (event) => {
  isPhotoHovered.value = !event.target.closest(".dialog-nav-arrow");
};

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
  width: 100%;
  /* Se queda con todo el alto que sobra en la columna izquierda tras el
     filmstrip; la imagen se centra dentro sin recortarse. */
  flex: 1 1 0;
  min-height: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.stage-photo {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: center;
  background-color: transparent;
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

/* Floating action bar overlay - centered on hover */
.photo-action-bar-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.45);
  border-radius: var(--radius-md);
}

.photo-stage.photo-hovered .photo-action-bar-overlay {
  opacity: 1;
  pointer-events: auto;
}

/* Photo overlay */
.photo-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}

.photo-overlay > * {
  pointer-events: auto;
}

.bottom-left-actions {
  position: absolute;
  bottom: var(--spacing-sm);
  left: var(--spacing-sm);
  display: flex;
  align-items: center;
  gap: 8px;
}

.flag-control {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-primary);
  background: var(--bg-surface);
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition:
    background-color 0.2s ease,
    transform 0.15s ease;
}

.flag-control:hover {
  transform: scale(1.08);
}

/* Solo se colorea el icono outlined; el fondo del chip se mantiene neutro
   para no chocar con la interfaz. */
.flag-control.flag-picked {
  color: var(--success-color);
}

.flag-control.flag-rejected {
  color: var(--error-color);
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

.bottom-right-actions {
  position: absolute;
  bottom: var(--spacing-sm);
  right: var(--spacing-sm);
  display: flex;
  gap: var(--spacing-sm);
}

.fullscreen-btn {
  opacity: 0.6;
  transition: opacity 0.3s ease;
  background-color: rgba(0, 0, 0, 0.5) !important;
  backdrop-filter: blur(4px);
  color: white !important;
}

.fullscreen-btn:hover {
  opacity: 1;
  background-color: rgba(0, 0, 0, 0.7) !important;
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
