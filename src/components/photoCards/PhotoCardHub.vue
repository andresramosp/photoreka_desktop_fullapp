<template>
  <div
    class="photo-card-info"
    :class="{
      selected: isSelected,
      duplicate: photo.isDuplicate,
      'with-footer': showFooter,
    }"
    @click="toggleSelection()"
    :style="{
      cursor: 'pointer',
    }"
  >
    <div class="photo-container">
      <!-- Show actual image when uploaded -->
      <img
        loading="lazy"
        :src="photo.thumbnailUrl || photo.url"
        :alt="photo.name"
        class="photo-image"
        @load="onImageLoad"
        @error="onImageError"
      />

      <!-- Action Buttons (center overlay) - only show when not uploading -->
      <div
        v-if="
          !photo.isCheckingDuplicates &&
          !isUploading &&
          (photo.status === 'processed' || photo.status === 'preprocessed')
        "
        class="action-buttons-overlay"
      >
        <n-button
          v-if="photo.status == 'processed'"
          size="medium"
          class="action-button info-button"
          @click.stop="showInfo"
        >
          <template #icon>
            <n-icon>
              <InfoIcon />
            </n-icon>
          </template>
        </n-button>
        <!-- <n-button
          size="medium"
          class="action-button delete-button"
          @click.stop="deletePhoto"
          v-if="showDelete"
        >
          <template #icon>
            <n-icon>
              <DeleteIcon />
            </n-icon>
          </template>
        </n-button> -->
      </div>

      <!-- (Eliminado: el indicador de duplicados ahora va en el footer) -->

      <!-- Checking duplicates overlay with static clock icon -->
      <div v-if="photo.isCheckingDuplicates" class="processing-overlay">
        <n-icon size="32" color="#ffffffd1">
          <TimeOutline />
        </n-icon>
      </div>

      <!-- Preprocessing overlay with static clock icon -->
      <div v-if="photo.status === 'preprocessing'" class="processing-overlay">
        <n-icon size="32" color="#ffffffd1">
          <TimeOutline />
        </n-icon>
      </div>

      <!-- Selection indicator -->
      <div v-if="isSelected" class="selection-indicator">
        <n-icon size="20" color="#ffffff">
          <CheckCircleIcon />
        </n-icon>
      </div>

      <!-- Artistic Score indicator -->
      <div
        v-if="artisticScore && artisticScore > 0"
        class="artistic-score-indicator"
        :style="{ backgroundColor: scoreBackgroundColor }"
      >
        {{ artisticScore.toFixed(1) }}
      </div>

      <!-- Lightroom source indicator -->
      <n-tooltip
        v-if="photo.descriptions?.source?.type === 'lightroom'"
        trigger="hover"
        placement="top"
      >
        <template #trigger>
          <div class="lightroom-indicator">
            <img
              src="@/assets/onBoarding/lightroom_logo.png"
              alt="Lightroom"
              class="lightroom-logo"
            />
          </div>
        </template>
        Photo synced with Lightroom
      </n-tooltip>
      <!-- Duplicate indicator in top-left corner when footer is hidden -->
      <n-tooltip
        v-if="photo.isDuplicate && showDuplicate && !showFooter"
        trigger="hover"
        placement="top"
      >
        <template #trigger>
          <div
            class="duplicate-indicator top-left-duplicate-indicator"
            @click.stop="showDuplicates"
          >
            <n-icon size="16">
              <DuplicateOutline />
            </n-icon>
          </div>
        </template>
        Click to view duplicates
      </n-tooltip>
    </div>

    <!-- File name in top-right corner of photo (if showName) -->
    <div v-if="showName" class="photo-filename-topright" :title="cleanFileName">
      {{ cleanFileName }}
    </div>

    <!-- Footer with detailed information -->
    <div v-if="showFooter" class="photo-footer">
      <div class="photo-status">
        <!-- Status tags -->

        <n-tag
          v-if="photo.status == 'uploaded' || photo.status == 'preprocessing'"
          size="small"
          type="info"
          class="status-tag"
        >
          Preprocessing
        </n-tag>

        <n-tag
          v-if="photo.status == 'processing'"
          size="small"
          type="info"
          class="status-tag"
        >
          Processing
        </n-tag>

        <n-tooltip
          v-else-if="!isUploading && photo.status == 'preprocessed'"
          trigger="hover"
          placement="top"
        >
          <template #trigger>
            <n-tag
              size="small"
              :bordered="false"
              type="info"
              class="status-tag"
            >
              Lightbox
            </n-tag>
          </template>
          Limited use in tools
        </n-tooltip>

        <n-tooltip
          v-else-if="!isUploading && photo.status == 'processed'"
          trigger="hover"
          placement="top"
        >
          <template #trigger>
            <n-tag
              size="small"
              :bordered="false"
              type="success"
              class="status-tag"
            >
              Worskpace
            </n-tag>
          </template>
          Valid in all tools
        </n-tooltip>
      </div>
      <!-- Duplicate indicator in footer, right-aligned -->
      <n-tooltip
        v-if="photo.isDuplicate && showDuplicate"
        trigger="hover"
        placement="top"
      >
        <template #trigger>
          <div
            class="duplicate-indicator footer-duplicate-indicator"
            @click.stop="showDuplicates"
          >
            <n-icon size="16">
              <WarningIcon />
            </n-icon>
          </div>
        </template>
        Click to view duplicates
      </n-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { NIcon, NSpin, NTooltip } from "naive-ui";

// Import @vicons icons from ionicons5 for reliability
import {
  InformationCircleOutline as InfoIcon,
  WarningOutline as WarningIcon,
  DuplicateOutline,
  CheckmarkCircleOutline as CheckCircleIcon,
  TrashOutline as DeleteIcon,
  TimeOutline,
} from "@vicons/ionicons5";
import { useArtisticScores } from "@/composables/useArtisticScores.js";

interface PhotoInfo {
  id: string;
  name: string;
  size: number | string;
  url: string;
  thumbnailUrl: string;
  uploadDate?: Date;
  date?: string;
  isDuplicate?: boolean;
  duplicates?: string[];
  status?:
    | "uploaded"
    | "preprocessing"
    | "preprocessed"
    | "processing"
    | "processed";
  aiTags?: number;
  faces?: number;
  width?: number;
  height?: number;
  originalFileName: string;
  isCheckingDuplicates: boolean;
  descriptions?: {
    artistic_scores?: Record<string, number>;
    source?: {
      type?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

interface Props {
  photo: PhotoInfo;
  selected?: boolean;
  showFooter: boolean;
  showDelete: boolean;
  showName: boolean;
  isUploading: boolean;
  showDuplicate: boolean;
  artisticScore?: number | null;
}

interface Emits {
  (e: "select", photoId: string): void;
  (e: "info", photo: PhotoInfo): void;
  (e: "delete", photoId: string): void;
  (e: "show-duplicates", duplicates: string[]): void;
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
});

const emit = defineEmits<Emits>();
const { getScoreBgColor } = useArtisticScores();

// Utilidad para limpiar extensión y acortar nombre
function removeExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

const cleanFileName = computed(() =>
  removeExtension(props.photo.originalFileName)
);

const scoreBackgroundColor = computed(() => {
  if (!props.artisticScore || props.artisticScore === 0) {
    return "#6b7280";
  }
  return getScoreBgColor(props.artisticScore);
});

const isSelected = computed(() => props.selected);
const imageLoaded = ref(false);
const imageError = ref(false);

const toggleSelection = () => {
  emit("select", props.photo.id);
};

const showInfo = () => {
  emit("info", props.photo);
};

const deletePhoto = () => {
  emit("delete", props.photo.id);
};

const showDuplicates = () => {
  if (props.photo.duplicates && props.photo.duplicates.length > 0) {
    // Include the current photo plus its duplicates
    const allDuplicates = [props.photo.id, ...props.photo.duplicates];
    emit("show-duplicates", allDuplicates);
  }
};

const onImageLoad = () => {
  imageLoaded.value = true;
};

const onImageError = () => {
  imageError.value = true;
};
</script>

<style scoped>
@import "@/assets/global.scss";

.photo-card-info {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  cursor: pointer;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid transparent;
  background-color: #2c2c32;
  display: flex;
  flex-direction: column;

  /* Habilitar container queries */
  container-type: inline-size;
  container-name: photo-card;
}

.photo-card-info.with-footer {
  aspect-ratio: 3/4 !important;
}

.photo-card-info:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.photo-card-info.selected {
  border-color: #8b5cf6;
  box-shadow: 0 0 0 1px #8b5cf640, 0 8px 24px rgba(139, 92, 246, 0.2);
}

.photo-container {
  position: relative;
  width: 100%;
  background-color: #2c2c32;
  flex: 1;
  min-height: 0; /* Allow shrinking */
}

.photo-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: #2c2c32;
}

/* Note: Photo skeleton styles moved to global.scss */

/* Action buttons overlay */
.action-buttons-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 3;
  display: flex;
  gap: 8px;
}

.photo-card-info:hover .action-buttons-overlay {
  opacity: 1;
}

/* Duplicate indicator */
.duplicate-indicator {
  background-color: rgba(245, 158, 11, 0.9);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.3s ease;
}

.footer-duplicate-indicator {
  position: static;
  margin-left: auto;
  margin-right: 0;
}

.top-left-duplicate-indicator {
  position: absolute;
  top: 5px;
  left: 8px;
  z-index: 4;
}

/* Variantes responsivas para el indicador de duplicados */
@container photo-card (max-width: 200px) {
  .top-left-duplicate-indicator {
    width: 18px;
    height: 18px;
    top: 5px;
    left: 6px;
  }

  .top-left-duplicate-indicator .n-icon {
    font-size: 14px !important;
  }
}

@container photo-card (max-width: 150px) {
  .top-left-duplicate-indicator {
    width: 13px;
    height: 13px;
    top: 2px;
    left: 4px;
  }

  .top-left-duplicate-indicator .n-icon {
    font-size: 12px !important;
  }
}

/* Soporte para navegadores sin container queries */
@media (max-width: 768px) {
  .top-left-duplicate-indicator {
    width: 22px;
    height: 22px;
    top: 6px;
    left: 6px;
  }

  .top-left-duplicate-indicator .n-icon {
    font-size: 14px !important;
  }
}

@media (max-width: 480px) {
  .top-left-duplicate-indicator {
    width: 18px;
    height: 18px;
    top: 4px;
    left: 4px;
  }

  .top-left-duplicate-indicator .n-icon {
    font-size: 12px !important;
  }
}

/* Processing overlay */
.processing-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}

/* Action buttons */
.action-button {
  border-radius: 8px !important;
  backdrop-filter: blur(8px);
  border: none !important;
  width: 40px;
  height: 40px;
  opacity: 0.9;
  transition: opacity 0.2s ease !important;
}

.action-button:hover {
  opacity: 1 !important;
}

.info-button {
  background-color: var(--info-color) !important;
  color: white !important;
}

.delete-button {
  background-color: var(--error-color) !important;
  color: white !important;
}

/* Selection indicator */
.selection-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: rgba(139, 92, 246, 0.9);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
}

/* Artistic Score indicator */
.artistic-score-indicator {
  position: absolute;
  bottom: 8px;
  left: 8px;
  border-radius: 6px;
  padding: 4px 8px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  z-index: 4;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  min-width: 32px;
  text-align: center;
}

/* Lightroom source indicator */
.lightroom-indicator {
  position: absolute;
  bottom: 8px;
  right: 8px;
  border-radius: 6px;
  padding: 4px;
  opacity: 0.8;
  background-color: rgba(49, 168, 240, 0.9);
  z-index: 4;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.lightroom-logo {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

/* Variantes responsivas para el indicador de selección */
@container photo-card (max-width: 200px) {
  .selection-indicator {
    width: 26px;
    height: 26px;
    top: 6px;
    right: 6px;
  }

  .selection-indicator .n-icon {
    font-size: 16px !important;
  }

  .artistic-score-indicator {
    font-size: 11px;
    padding: 3px 6px;
    bottom: 6px;
    left: 6px;
  }

  .lightroom-indicator {
    bottom: 6px;
    right: 6px;
    padding: 3px;
  }

  .lightroom-logo {
    width: 18px;
    height: 18px;
  }
}

@container photo-card (max-width: 150px) {
  .selection-indicator {
    width: 22px;
    height: 22px;
    top: 4px;
    right: 4px;
  }

  .selection-indicator .n-icon {
    font-size: 14px !important;
  }

  .artistic-score-indicator {
    font-size: 10px;
    padding: 2px 5px;
    bottom: 4px;
    left: 4px;
  }

  .lightroom-indicator {
    bottom: 4px;
    right: 4px;
    padding: 2px;
  }

  .lightroom-logo {
    width: 16px;
    height: 16px;
  }
}

/* Soporte para navegadores sin container queries - selection indicator */
@media (max-width: 768px) {
  .selection-indicator {
    width: 26px;
    height: 26px;
    top: 6px;
    right: 6px;
  }

  .selection-indicator .n-icon {
    font-size: 16px !important;
  }

  .artistic-score-indicator {
    font-size: 11px;
    padding: 3px 6px;
    bottom: 6px;
    left: 6px;
  }

  .lightroom-indicator {
    bottom: 6px;
    right: 6px;
    padding: 3px;
  }

  .lightroom-logo {
    width: 18px;
    height: 18px;
  }
}

@media (max-width: 480px) {
  .selection-indicator {
    width: 22px;
    height: 22px;
    top: 4px;
    right: 4px;
  }

  .selection-indicator .n-icon {
    font-size: 14px !important;
  }

  .artistic-score-indicator {
    font-size: 10px;
    padding: 2px 5px;
    bottom: 4px;
    left: 4px;
  }

  .lightroom-indicator {
    bottom: 4px;
    right: 4px;
    padding: 2px;
  }

  .lightroom-logo {
    width: 16px;
    height: 16px;
  }
}

/* Photo footer */
.photo-footer {
  padding: 9px;
  background-color: #1a1a1f;
  display: flex;
  border-top: 1px solid #2c2c32;
  align-items: center;
  align-content: center;
  justify-content: space-between;
}

.photo-title {
  font-size: 12px;
  /* font-weight: 500; */
  color: #ffffffd1;
  margin: 0 0 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Status tags */
.status-tag {
  flex-shrink: 0;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .photo-card-info {
    aspect-ratio: 1; /* Square on mobile for space efficiency */
  }
}
.photo-filename-topright {
  position: absolute;
  top: -2px;
  right: 2px;
  color: var(--text-secondary);
  font-size: 22px;
  font-weight: 500;
  border-radius: 0 12px 0 8px;
  max-width: 70%;
  min-width: 0; /* Permite que el contenedor se encoja */
  opacity: 0.65;
  z-index: 2;
  pointer-events: none;
  backdrop-filter: blur(4px);
  transition: opacity 0.2s ease;

  /* Manejo inteligente del texto */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  /* Mejoras para legibilidad */
  /* text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); */
  letter-spacing: 0.025em;
}

.photo-filename-topright:hover {
  opacity: 1;
}

/* Variante para contenedores más pequeños */
@container photo-card (max-width: 200px) {
  .photo-filename-topright {
    font-size: 12px;
    /* padding: 4px 6px; */
    max-width: 75%;
  }
}

/* Variante para contenedores muy pequeños */
@container photo-card (max-width: 150px) {
  .photo-filename-topright {
    font-size: 11px;
    /* padding: 3px 5px; */
    max-width: 80%;
  }
}

/* Soporte para navegadores sin container queries */
@media (max-width: 768px) {
  .photo-filename-topright {
    font-size: 12px;
    /* padding: 4px 6px; */
    max-width: 75%;
  }
}

@media (max-width: 480px) {
  .photo-filename-topright {
    font-size: 11px;
    /* padding: 3px 5px; */
    max-width: 80%;
  }
}
</style>
