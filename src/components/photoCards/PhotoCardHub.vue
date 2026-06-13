<template>
  <div
    class="photo-card-info"
    :class="{
      selected: isSelected,
      focused: props.focused,
      duplicate: photo.isDuplicate,
      'with-footer': showFooter,
      'show-hover': showHoverOverlay,
    }"
    @click="handleClick"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchCancel"
    @contextmenu.prevent="() => {}"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
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
          (photo.status === 'processed' ||
            photo.status === 'preprocessed' ||
            photo.isAlreadyAnalyzed) &&
          !isSelectionModeActive
        "
        class="action-buttons-overlay"
      >
        <n-button
          v-if="photo.status == 'processed' && !isMobile"
          size="medium"
          class="action-button info-button"
          :loading="!imageLoaded"
          @click.stop="showInfo"
        >
          <template #icon>
            <n-icon>
              <InfoIcon />
            </n-icon>
          </template>
        </n-button>
        <!-- Swap button for lightbox photos already analyzed in workspace -->
        <n-button
          v-if="photo.isAlreadyAnalyzed && photo.alreadyAnalyzedIds?.length > 0"
          size="medium"
          class="action-button swap-button"
          @click.stop="swapPhoto"
        >
          <template #icon>
            <n-icon>
              <SwapHorizontalOutline />
            </n-icon>
          </template>
        </n-button>
      </div>

      <!-- (Eliminado: el indicador de duplicados ahora va en el footer) -->

      <!-- Checking duplicates overlay with static clock icon -->
      <div v-if="photo.isCheckingDuplicates" class="processing-overlay">
        <n-icon size="32" color="var(--text-secondary)">
          <TimeOutline />
        </n-icon>
      </div>

      <!-- Preprocessing overlay with static clock icon -->
      <div v-if="photo.status === 'preprocessing'" class="processing-overlay">
        <n-icon size="32" color="var(--text-secondary)">
          <TimeOutline />
        </n-icon>
      </div>

      <!-- Selection indicator -->
      <!-- <div v-if="isSelected" class="selection-indicator">
        <n-icon size="20" color="#ffffff">
          <CheckCircleIcon />
        </n-icon>
      </div> -->

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
              src="@/assets/logos/lightroom_logo.png"
              alt="Lightroom"
              class="lightroom-logo"
            />
          </div>
        </template>
        Photo synced with Lightroom
      </n-tooltip>
      <!-- Google Photos source indicator -->
      <n-tooltip
        v-if="photo.descriptions?.source?.type === 'google'"
        trigger="hover"
        placement="top"
      >
        <template #trigger>
          <div class="google-photos-indicator" @click.stop="openInGooglePhotos">
            <img
              src="@/assets/logos/google_photos.png"
              alt="Google Photos"
              class="google-photos-logo"
            />
          </div>
        </template>
        Click to search in Google Photos
      </n-tooltip>
      <!-- Duplicate indicator in top-left corner when footer is hidden -->
      <n-tooltip
        v-if="
          photo.isDuplicate &&
          !photo.isAlreadyAnalyzed &&
          showDuplicate &&
          !showFooter
        "
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
      <!-- Already-analyzed indicator in top-left corner when footer is hidden -->
      <n-tooltip
        v-else-if="photo.isAlreadyAnalyzed && showDuplicate && !showFooter"
        trigger="hover"
        placement="top"
      >
        <template #trigger>
          <div
            class="duplicate-indicator top-left-duplicate-indicator already-analyzed-indicator"
          >
            <n-icon size="16">
              <WarningIcon />
            </n-icon>
          </div>
        </template>
        Already analyzed in workspace
      </n-tooltip>

      <!-- File name in top-right corner of photo (if showName) -->
      <div
        v-if="showName"
        class="photo-filename-topright"
        :title="cleanFileName"
      >
        {{ cleanFileName }}
      </div>

      <!-- Bottom overlay with matched tags -->
      <div
        v-if="matchedTags && matchedTags.length > 0 && showHoverContent"
        class="bottom-overlay"
      >
        <div class="matched-tags">
          <span
            v-for="(tag, index) in matchedTags.slice(0, 3)"
            :key="index"
            class="tag"
          >
            {{ tag }}
          </span>
          <span v-if="matchedTags.length > 3" class="tag-more">
            +{{ matchedTags.length - 3 }}
          </span>
        </div>
      </div>
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
      <!-- Duplicate indicator: lightbox-vs-lightbox duplicate (opens dialog) -->
      <n-tooltip
        v-if="photo.isDuplicate && !photo.isAlreadyAnalyzed && showDuplicate"
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
      <!-- Already-analyzed indicator: lightbox photo matched to workspace (tooltip only, no dialog) -->
      <n-tooltip
        v-else-if="photo.isAlreadyAnalyzed && showDuplicate"
        trigger="hover"
        placement="top"
      >
        <template #trigger>
          <div
            class="duplicate-indicator footer-duplicate-indicator already-analyzed-indicator"
          >
            <n-icon size="16">
              <WarningIcon />
            </n-icon>
          </div>
        </template>
        Already analyzed in workspace
      </n-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { NIcon, NSpin, NTooltip } from "naive-ui";
import { useMobilePhotoSelection } from "@/composables/useMobilePhotoSelection";

// Import @vicons icons from ionicons5 for reliability
import {
  InformationCircleOutline as InfoIcon,
  WarningOutline as WarningIcon,
  DuplicateOutline,
  CheckmarkCircleOutline as CheckCircleIcon,
  TrashOutline as DeleteIcon,
  TimeOutline,
  SwapHorizontalOutline,
} from "@vicons/ionicons5";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { useIsMobile } from "@/composables/useIsMobile";
import { useBackgroundImageCache } from "@/composables/useBackgroundImageCache.js";

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
  isAlreadyAnalyzed?: boolean;
  alreadyAnalyzedIds?: string[];
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
  focused?: boolean;
  showFooter: boolean;
  showDelete: boolean;
  showName: boolean;
  isUploading: boolean;
  showDuplicate: boolean;
  artisticScore?: number | null;
  matchedTags?: string[];
}

interface Emits {
  (e: "select", photoId: string, event?: MouseEvent): void;
  (e: "info", photo: PhotoInfo): void;
  (e: "delete", photoId: string): void;
  (e: "show-duplicates", duplicates: string[]): void;
  (e: "swap-photo", newPhotoId: string, targetIds: string[]): void;
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  focused: false,
  matchedTags: () => [],
});

const emit = defineEmits<Emits>();
const { getScoreBgColor } = useArtisticScores();
const { scheduleBackgroundCache } = useBackgroundImageCache();

// Mobile selection composable
const {
  isSelectionModeActive,
  showHoverOverlay,
  isMobile,
  handleTouchStart: baseTouchStart,
  handleTouchMove: baseTouchMove,
  handleTouchEnd: baseTouchEnd,
  handleTouchCancel: baseTouchCancel,
  handleClick: baseHandleClick,
  cleanup,
} = useMobilePhotoSelection();

// Utilidad para limpiar extensión y acortar nombre
function removeExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

const cleanFileName = computed(() =>
  removeExtension(props.photo.originalFileName),
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
const showHoverContent = ref(false);

// Event handlers for mobile touch
const handleTouchStart = (event: TouchEvent) => {
  baseTouchStart(event, props.photo.id, (id) => emit("select", id));
};

const handleTouchMove = (event: TouchEvent) => {
  baseTouchMove(event);
};

const handleTouchEnd = (event: TouchEvent) => {
  baseTouchEnd(event, props.photo.id, (id) => emit("select", id), showInfo);
};

const handleTouchCancel = () => {
  baseTouchCancel();
};

const handleClick = (event: MouseEvent) => {
  baseHandleClick(event, props.photo.id, (id, evt) => emit("select", id, evt));
};

const handleMouseEnter = () => {
  showHoverContent.value = true;
};

const handleMouseLeave = () => {
  showHoverContent.value = false;
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

const swapPhoto = () => {
  if (
    props.photo.alreadyAnalyzedIds &&
    props.photo.alreadyAnalyzedIds.length > 0
  ) {
    emit("swap-photo", props.photo.id, props.photo.alreadyAnalyzedIds);
  }
};

const onImageLoad = () => {
  imageLoaded.value = true;
  scheduleBackgroundCache(
    props.photo.id,
    props.photo.thumbnailUrl || props.photo.url,
  );
};

const onImageError = () => {
  imageError.value = true;
};

const openInGooglePhotos = () => {
  // Google Photos Picker API does not expose a usable web URL per photo.
  // Search by exact capture date from EXIF, falling back to filename.
  const rawDate =
    props.photo.descriptions?.EXIF?.dateTaken ||
    props.photo.date ||
    props.photo.uploadDate;
  let query = "";

  if (rawDate) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      const month = d.toLocaleString("en-US", { month: "long" });
      const day = d.getDate();
      const year = d.getFullYear();
      query = `${month} ${day} ${year}`;
    }
  }

  if (!query) {
    query = removeExtension(props.photo.originalFileName || props.photo.name);
  }

  const url = query
    ? `https://photos.google.com/search/${encodeURIComponent(query)}`
    : "https://photos.google.com/";
  window.open(url, "_blank", "noopener,noreferrer");
};

// Cleanup on unmount
onUnmounted(() => {
  cleanup();
});
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
  background-color: var(--bg-container);
  display: flex;
  flex-direction: column;

  /* Habilitar container queries */
  container-type: inline-size;
  container-name: photo-card;

  box-sizing: border-box;
  border: 2px solid transparent;
  transition: border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.photo-card-info.with-footer {
  aspect-ratio: 3/4 !important;
}

.photo-card-info.selected {
  border: solid 2px var(--accent-color);
}

.photo-card-info.focused:not(.selected) {
  border: 2px dashed var(--accent-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color) 30%, transparent);
}

.photo-container {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0; /* Allow shrinking */
}

.photo-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: var(--bg-surface);
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

.photo-card-info:hover .action-buttons-overlay,
.photo-card-info.show-hover .action-buttons-overlay {
  opacity: 1;
}

/* Duplicate indicator */
.duplicate-indicator {
  background-color: rgba(245, 158, 11, 0.9);
  border-radius: 50%;
  width: 26px;
  height: 26px;
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

.already-analyzed-indicator {
  cursor: default;
  background-color: rgba(245, 158, 11, 0.6);
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

.swap-button {
  background-color: var(--warning-color, #f59e0b) !important;
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
  background-color: var(--accent-color);
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

/* Google Photos source indicator */
.google-photos-indicator {
  position: absolute;
  bottom: 8px;
  right: 8px;
  border-radius: 6px;
  padding: 4px;
  opacity: 1;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}

.google-photos-indicator:hover {
  transform: scale(1.15);
  opacity: 0.85;
}

.google-photos-logo {
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

  .google-photos-indicator {
    bottom: 4px;
    right: 4px;
    padding: 2px;
  }

  .google-photos-logo {
    width: 16px;
    height: 16px;
  }

  .action-button {
    width: 28px;
    height: 28px;
    border-radius: 6px !important;
  }

  .action-button :deep(.n-icon) {
    font-size: 14px !important;
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

  .google-photos-indicator {
    bottom: 6px;
    right: 6px;
    padding: 3px;
  }

  .google-photos-logo {
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

  .google-photos-indicator {
    bottom: 4px;
    right: 4px;
    padding: 2px;
  }

  .google-photos-logo {
    width: 16px;
    height: 16px;
  }

  .action-button {
    width: 28px;
    height: 28px;
    border-radius: 6px !important;
  }

  .action-button :deep(.n-icon) {
    font-size: 14px !important;
  }
}

/* Photo footer */
.photo-footer {
  padding: 9px;
  background-color: var(--bg-body);
  display: flex;
  border-top: 1px solid #2c2c32;
  align-items: center;
  align-content: center;
  justify-content: space-between;
}

.photo-title {
  font-size: 12px;
  /* font-weight: 500; */
  color: var(--text-secondary);
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

/* Bottom overlay with matched tags */
.bottom-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.matched-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.tag {
  display: inline-block;
  padding: 2px 8px;
  background-color: color-mix(in srgb, var(--accent-color), transparent 50%);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  font-size: 11px;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
  font-weight: 500;
  opacity: 0.9;
}

.tag-more {
  display: inline-block;
  padding: 2px 8px;
  background-color: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  font-size: 11px;
  color: #ffffff;
  font-weight: 600;
}
</style>
