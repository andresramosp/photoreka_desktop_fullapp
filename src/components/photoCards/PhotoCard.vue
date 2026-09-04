<template>
  <div
    class="photo-card"
    :class="{
      selected: isSelected,
      'curation-mode': mode === 'curation',
      'selection-mode': mode === 'selection',
      'is-new': props.isNew,
      'info-loading': isInfoLoading,
    }"
    @click="handleClick"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchCancel"
    @contextmenu.prevent="() => {}"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    :style="mode === 'curation' ? 'cursor: default;' : ''"
  >
    <div class="photo-container">
      <img
        loading="lazy"
        :src="photo.thumbnailUrl || photo.url"
        :alt="photo.title"
        class="photo-image"
        :class="{ 'is-loaded': imageLoaded, 'has-error': imageError }"
        @load="onImageLoad"
        @error="onImageError"
        :style="shouldBlur ? 'filter: blur(8px); transition: filter 0.3s;' : ''"
      />

      <!-- Spinner mientras el padre trae la foto completa y abre el dialogo:
           el click sobre la card sustituyo al boton flotante de info, que era
           quien daba antes esta senal. -->
      <div v-if="isInfoLoading" class="info-loading-overlay">
        <n-spin size="small" />
      </div>

      <!-- Selection circle (Google Photos style). Hidden for type="item"
           cards: those select on a plain click anywhere, with no info
           destination to protect from being overridden. -->
      <button
        v-if="showsCircle"
        class="selection-circle"
        :class="{ 'is-checked': isSelected }"
        @click.stop="handleCircleClick"
        :aria-label="isSelected ? 'Deselect photo' : 'Select photo'"
        tabindex="0"
      >
        <svg v-if="isSelected" viewBox="0 0 24 24" class="check-icon">
          <path
            fill="currentColor"
            d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
          />
        </svg>
      </button>

      <!-- AI Reasoning Tooltip (for curation mode or default mode with reasoning) -->
      <div
        v-if="
          (mode === 'curation' || (mode === 'default' && photo.reasoning)) &&
          (showTooltip || showAnalyzing)
        "
        class="ai-reasoning-tooltip"
      >
        <p class="reasoning-text">
          {{
            showAnalyzing
              ? "Reviewing..."
              : photo.reasoning ||
                "This photo demonstrates excellent composition with balanced lighting and compelling subject matter that would work well for the intended purpose."
          }}
        </p>
      </div>

      <!-- Match Score Stars (visible en todos los modos) -->
      <div
        v-if="
          props.showStars &&
          (props.highMatch || computedStars > 0 || showLowRelevanceIcon)
        "
        class="match-score-indicator"
      >
        <!-- Icono de poca relevancia para labelScore 'poor' -->
        <div v-if="showLowRelevanceIcon" class="low-relevance-icon">
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-icon size="16" class="warning-icon">
                <HelpIcon />
              </n-icon>
            </template>
            <span
              >Low relevance: The photo may not be relevant to this
              criterion.</span
            >
          </n-tooltip>
        </div>
        <!-- Diamante para highMatch -->
        <div v-else-if="props.highMatch" class="diamond-indicator">
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-icon size="16" class="diamond-icon">
                <DiamondIcon />
              </n-icon>
            </template>
            <span>High-quality match</span>
          </n-tooltip>
        </div>
        <!-- Estrellas para matchScore > 0 -->
        <div v-else class="stars">
          <n-icon
            v-for="star in [...Array(3).keys()].reverse()"
            :key="star"
            :class="[
              'star-icon',
              {
                filled: star + 1 <= computedStars,
                empty: star + 1 > computedStars,
              },
            ]"
            size="12"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22L12 18.77L5.82 22L7 14.14L2 9.27l6.91-1.01L12 2z"
              />
            </svg>
          </n-icon>
        </div>
      </div>

      <!-- Notes Indicator (top-left corner, cedes the corner to the
           selection circle outside curation mode) -->
      <div
        v-if="hasNotesChunk"
        class="notes-indicator"
        :class="{ 'corner-shifted': showsCircle }"
      >
        <n-tooltip trigger="hover" placement="top">
          <template #trigger>
            <n-icon size="14" class="notes-icon">
              <NotesIcon />
            </n-icon>
          </template>
          <span>Contains notes</span>
        </n-tooltip>
      </div>

      <!-- Bottom overlay with matched tags or curation actions -->
      <div class="bottom-overlay">
        <!-- Matched tags for default mode (visible on hover) -->
        <div
          v-if="
            props.showTags &&
            mode === 'default' &&
            tagsToDisplay &&
            tagsToDisplay.length > 0 &&
            showHoverContent
          "
          class="matched-tags"
        >
          <span
            v-for="tag in tagsToDisplay.slice(0, 3)"
            :key="tag.key"
            class="tag"
          >
            <n-tooltip trigger="hover" placement="top">
              <template #trigger>
                <span>
                  {{ tag.text }}
                </span>
              </template>
              <div v-if="tag.isChunk" class="tooltip-content">
                {{ tag.fullText }}
              </div>
              <div v-else class="tooltip-content">
                {{ tag.text }}
              </div>
            </n-tooltip>
          </span>
          <span v-if="tagsToDisplay.length > 3" class="tag-more">
            +{{ tagsToDisplay.length - 3 }}
          </span>
        </div>

        <!-- Curation actions for curation mode -->
        <div v-if="mode === 'curation' && !isThinking" class="curation-actions">
          <n-button
            size="small"
            type="primary"
            @click.stop="moveToSelection"
            class="move-button"
          >
            <template #icon>
              <n-icon>
                <ChevronRightIcon />
              </n-icon>
            </template>
            Curate
          </n-button>
        </div>

        <!-- Selection actions for selection mode -->
        <div
          v-if="mode === 'selection' && props.showReturnButton"
          class="selection-actions"
        >
          <n-button
            size="small"
            type="warning"
            @click.stop="moveToCuration"
            class="move-button"
          >
            <template #icon>
              <n-icon>
                <ChevronLeftIcon />
              </n-icon>
            </template>
            Return
          </n-button>
        </div>
      </div>

      <!-- Delete button (top-right corner) -->
      <div
        v-if="props.showDeleteButton"
        class="delete-button"
        @click.stop="handleDelete"
      >
        <n-icon size="16" color="#ffffff">
          <TrashIcon />
        </n-icon>
      </div>

      <!-- Locate on canvas (center overlay, on hover). The strip's canvas scope
           shows photos already on the board, so the action is "find it", not "add it". -->
      <div
        v-if="props.showLocateButton"
        class="locate-button"
        title="Show on canvas"
        @click.stop="handleLocate"
      >
        <n-icon size="20" color="#ffffff">
          <LocateIcon />
        </n-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import { NIcon, NTooltip, NButton, NSpin } from "naive-ui";
import { useMobilePhotoSelection } from "@/composables/useMobilePhotoSelection";

// Import @vicons icons from ionicons5 for reliability
import {
  ChevronForwardOutline as ChevronRightIcon,
  ChevronBackOutline as ChevronLeftIcon,
  HelpCircleOutline as HelpIcon,
  TrashOutline as TrashIcon,
  DocumentTextOutline as NotesIcon,
  DiamondOutline as DiamondIcon,
  EyeOutline as LocateIcon,
} from "@vicons/ionicons5";

import { usePhotoScored } from "@/composables/usePhotoScored.js";
import { useBackgroundImageCache } from "@/composables/useBackgroundImageCache.js";

// Photo scoring composable
const { computePhotoStars, shouldShowLowRelevanceIcon } = usePhotoScored();
const { scheduleBackgroundCache } = useBackgroundImageCache();

// Calcula la cantidad de estrellas a mostrar (1-3) usando matchScore o labelScore
const computedStars = computed(() => {
  return props.computedStars ?? computePhotoStars(props.photo);
});

// Mostrar icono de poca relevancia cuando labelScore es 'poor'
const showLowRelevanceIcon = computed(() => {
  return props.showLowRelevanceIcon ?? shouldShowLowRelevanceIcon(props.photo);
});

// Check if photo has a notes chunk
const hasNotesChunk = computed(() => {
  return (
    props.photo.matchingChunks &&
    props.photo.matchingChunks.some((chunk) => chunk.category === "notes")
  );
});

export interface Photo {
  id: string;
  url: string;
  thumbnailUrl: string;
  originalUrl?: string;
  title: string;
  rating: number;
  reasoning?: string;
  matchScore?: number; // AI-generated match score (0 = not scored yet, 1-3 stars)
  labelScore?: "excellent" | "good" | "fair" | "poor"; // New enum-based scoring system
  highMatch?: boolean; // High-quality match indicator (shows diamond instead of stars)
  matchingTags?: any[];
  matchingChunks?: any[]; // AI-generated matching description chunks
  width?: number;
  height?: number;
  isUploading: boolean;
  file: any;
  needProcess: boolean;
  isDuplicate: boolean;
  isNew?: boolean; // Flag to mark newly arrived photos
  totalScore?: number; // Score opcional para mostrar en chunks
}

interface Props {
  photo: Photo;
  selected?: boolean;
  mode?: "default" | "curation" | "selection"; // Different modes for different contexts
  showStars?: boolean; // Control visibility of match score stars
  showTags?: boolean; // Control visibility of matched tags
  showReturnButton?: boolean; // Control visibility of return button in selection mode
  isNew?: boolean; // Mark photo as newly arrived
  computedStars?: number; // Pre-computed stars (0-3)
  showLowRelevanceIcon?: boolean; // Pre-computed low relevance indicator
  highMatch?: boolean; // High-quality match indicator (shows diamond instead of stars)
  /** Off (default) means this card has no info destination to open — click
   *  falls back to toggling selection directly instead of opening info. */
  showInfoButton?: boolean;
  showDeleteButton?: boolean; // Control visibility of delete button
  /** Shows an eye button that asks the parent to pan the canvas to this photo.
   *  Used in the related-photos strip's canvas scope, where the pool IS the board. */
  showLocateButton?: boolean;
  requireLongPress?: boolean; // Require long press for mobile selection (default: true)
  allPhotos?: Photo[];
  /**
   * True when the grid this card belongs to already has at least one photo
   * selected. While true, a plain click toggles selection instead of
   * opening info — set by the parent from its own selection state.
   */
  isSelectionMode?: boolean;
  /** Off means this card is display-only: no selection circle, no `select`
   *  emit from click/long-press. Ignored in curation mode, which never
   *  supports selection regardless. */
  selectable?: boolean;
  /**
   * "default" (default): click opens info (when available) and selection
   * is deliberate via the circle. "item": no circle, no info — a plain
   * click anywhere always toggles selection, matching the pre-circle
   * behaviour. For picker-style filmstrips/trays that have no info
   * destination at all, so there's nothing for selection to override.
   */
  type?: "card" | "item";
}

interface Emits {
  (e: "select", photoId: string, event?: MouseEvent): void;
  (e: "info", photo: Photo): void;
  (e: "move-to-selection", photoId: string): void; // For curation mode
  (e: "move-to-curation", photoId: string): void; // For selection mode
  (e: "delete", photoId: string): void; // For deleting individual photos
  (e: "locate", photo: Photo): void; // Pan the canvas to this photo
}

const props = withDefaults(defineProps<Props & { isThinking?: boolean }>(), {
  selected: false,
  mode: "default",
  isThinking: false,
  showStars: true,
  showTags: true,
  showReturnButton: true,
  isNew: false,
  requireLongPress: true,
  allPhotos: () => [],
  isSelectionMode: false,
  selectable: true,
  type: "card",
});
// Show "Reviewing..." label and blur if isThinking and reasoning is "Reviewing..."
const showAnalyzing = computed(
  () =>
    props.mode === "curation" &&
    props.isThinking &&
    (!props.photo.reasoning || props.photo.reasoning === "Reviewing..."),
);

const shouldBlur = computed(() => showAnalyzing.value);

const emit = defineEmits<Emits>();

// Mobile selection composable — long-press timing / tap-vs-scroll detection
// only. Which grid is "in selection mode" is owned by the parent and comes
// in via the isSelectionMode prop, not tracked here.
const {
  isMobile,
  handleTouchStart: baseTouchStart,
  handleTouchMove: baseTouchMove,
  handleTouchEnd: baseTouchEnd,
  handleTouchCancel: baseTouchCancel,
  reportSelectionMode,
  cleanup,
} = useMobilePhotoSelection();

// Feeds app-level UI (e.g. the assistant FAB) that wants to know "some grid
// is in selection mode on mobile" without owning that state itself.
watch(() => isMobile.value && props.isSelectionMode, reportSelectionMode, {
  immediate: true,
});

const showInfo = () => {
  isInfoLoading.value = true;
  if (infoLoadingTimer) clearTimeout(infoLoadingTimer);
  // La card no se entera de cuando abre el dialogo, asi que el spinner se
  // apaga solo. El margen es generoso a proposito: pasarse no se ve (el
  // dialogo ya tapa la card), quedarse corto deja la card muda esperando.
  infoLoadingTimer = setTimeout(() => {
    isInfoLoading.value = false;
  }, 1500);
  emit("info", props.photo);
};

// Only open info when this card was explicitly given an info destination —
// showInfoButton defaults to off, matching the pre-circle button visibility.
const hasInfoDestination = computed(
  () => props.type !== "item" && !!props.showInfoButton,
);

// "item" cards select on any click, with no circle to make it deliberate.
const showsCircle = computed(
  () => props.mode !== "curation" && props.selectable && props.type !== "item",
);

const handleCircleClick = () => {
  if (props.mode === "curation") return;
  emit("select", props.photo.id);
};

const isSelected = computed(() => props.selected);
const imageLoaded = ref(false);
const imageError = ref(false);
const showTooltip = ref(false);
const showHoverContent = ref(false);
const isInfoLoading = ref(false);
let infoLoadingTimer: ReturnType<typeof setTimeout> | null = null;

const uniqueMatchingTags = computed(() =>
  Array.from(new Set(props.photo.matchingTags)),
);

// Computed for formatted matching chunks
const formattedMatchingChunks = computed(() => {
  if (!props.photo.matchingChunks || props.photo.matchingChunks.length === 0) {
    return "";
  }
  // Prioritize chunks with category "notes"
  const notesChunks = props.photo.matchingChunks.filter(
    (mc) => mc.category === "notes",
  );
  const chunksToUse =
    notesChunks.length > 0 ? notesChunks : props.photo.matchingChunks;
  return chunksToUse.map((mc) => mc.chunk).join("... ");
});

// New computed property for tags to display
const tagsToDisplay = computed(() => {
  // Priority 1: Always check for chunks with category "notes" first
  if (props.photo.matchingChunks && props.photo.matchingChunks.length > 0) {
    const notesChunk = props.photo.matchingChunks.find(
      (chunk) => chunk.category === "notes",
    );

    if (notesChunk) {
      // Truncate to 5 words + "..."
      const words = notesChunk.chunk.split(" ");
      const truncatedText =
        words.length > 5
          ? words.slice(0, 5).join(" ") + "..."
          : notesChunk.chunk;

      return [
        {
          text: truncatedText,
          fullText: notesChunk.chunk,
          score: notesChunk.score,
          isChunk: true,
          key: `chunk-notes-${notesChunk.score}`,
        },
      ];
    }
  }

  // Priority 2: If no "notes" chunks, use matchingTags
  if (uniqueMatchingTags.value && uniqueMatchingTags.value.length > 0) {
    return uniqueMatchingTags.value.map((tag) => ({
      text: typeof tag === "object" ? tag.name || tag : tag,
      fullText: typeof tag === "object" ? tag.name || tag : tag,
      score:
        typeof tag === "object" && tag.proximity !== undefined
          ? tag.proximity
          : null,
      isChunk: false,
      key: typeof tag === "object" ? tag.name || tag.id : tag,
    }));
  }

  // Priority 3: If no "notes" chunks and no matchingTags, use highest scoring chunk
  if (props.photo.matchingChunks && props.photo.matchingChunks.length > 0) {
    const selectedChunk = props.photo.matchingChunks.reduce((prev, current) =>
      current.score > prev.score ? current : prev,
    );

    // Truncate to 5 words + "..."
    const words = selectedChunk.chunk.split(" ");
    const truncatedText =
      words.length > 5
        ? words.slice(0, 5).join(" ") + "..."
        : selectedChunk.chunk;

    return [
      {
        text: truncatedText,
        fullText: selectedChunk.chunk,
        score: selectedChunk.score,
        isChunk: true,
        key: `chunk-${selectedChunk.score}`,
      },
    ];
  }

  return [];
});

// Event handlers for mobile touch and click
const handleTouchStart = (event: TouchEvent) => {
  if (props.mode === "curation") return;
  baseTouchStart(
    event,
    props.photo.id,
    (id) => emit("select", id),
    props.requireLongPress,
    props.selectable,
  );
};

const handleTouchMove = (event: TouchEvent) => {
  if (props.mode === "curation") return;
  baseTouchMove(event);
};

const handleTouchEnd = (event: TouchEvent) => {
  if (props.mode === "curation") return;
  // A short tap either opens info or, when there's nowhere to route it,
  // falls back to toggling selection directly (only when this card is
  // selectable at all) — same fallback the desktop click uses.
  const onTap = hasInfoDestination.value
    ? showInfo
    : props.selectable
      ? () => emit("select", props.photo.id)
      : undefined;
  baseTouchEnd(
    event,
    props.photo.id,
    (id) => emit("select", id),
    onTap,
    props.requireLongPress,
    props.selectable,
    props.isSelectionMode,
  );
};

const handleTouchCancel = () => {
  if (props.mode === "curation") return;
  baseTouchCancel();
};

const handleClick = (event: MouseEvent) => {
  if (props.mode === "curation") return;
  if (isMobile.value) {
    // On mobile, touch handlers drive selection/info; suppress the
    // synthetic click that follows a touch to avoid double-handling.
    event.preventDefault();
    return;
  }
  if (props.selectable && props.isSelectionMode) {
    emit("select", props.photo.id, event);
  } else if (hasInfoDestination.value) {
    showInfo();
  } else if (props.selectable) {
    emit("select", props.photo.id, event);
  }
};

const toggleSelection = () => {
  if (props.mode === "curation") return;
  emit("select", props.photo.id);
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
  imageLoaded.value = true;
};

const moveToSelection = () => {
  emit("move-to-selection", props.photo.id);
};

const moveToCuration = () => {
  emit("move-to-curation", props.photo.id);
};

const handleDelete = () => {
  emit("delete", props.photo.id);
};

const handleLocate = () => {
  emit("locate", props.photo);
};

const handleMouseEnter = () => {
  if (props.mode === "curation") {
    showTooltip.value = true;
  } else if (props.mode === "default") {
    // Show reasoning tooltip if photo has reasoning
    if (props.photo.reasoning) {
      showTooltip.value = true;
    }
    // Show hover content for other modes when there are tags to display
    if (tagsToDisplay.value && tagsToDisplay.value.length > 0) {
      showHoverContent.value = true;
    }
  }
};

const handleMouseLeave = () => {
  showTooltip.value = false;
  showHoverContent.value = false;
};

// Cleanup on unmount
onUnmounted(() => {
  cleanup();
  if (infoLoadingTimer) clearTimeout(infoLoadingTimer);
});
</script>

<style scoped>
@import "@/assets/global.scss";

.photo-card {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  cursor: pointer;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid transparent;
  background-color: var(--bg-surface);

  /* Lets the selection circle shrink by actual card width (dense grids can
     be tiny even on a wide viewport, where a plain media query wouldn't help). */
  container-type: inline-size;
  container-name: photo-card;
}

.photo-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.photo-card.selected {
  border-color: var(--accent-color);
  box-shadow:
    0 0 0 1px var(--accent-color) 40,
    0 8px 24px var(--bg-surface);
}

.photo-container {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: var(--bg-surface);
}

.photo-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  opacity: 0;
  transition:
    opacity 0.28s ease,
    filter 0.3s ease;
}

.photo-image.is-loaded,
.photo-image.has-error {
  opacity: 1;
}

@media (hover: none) and (pointer: coarse) {
  .photo-image {
    opacity: 1;
    transition: filter 0.3s ease;
  }
}

/* .photo-card:hover .photo-image {
  transform: scale(1.03);
} */

.bottom-overlay {
  position: absolute;
  bottom: 8px;
  left: 5px;
  right: 5px;
  z-index: 2;
}

/* AI Reasoning Tooltip - styles moved to global.scss */

/* Hover Content Overlay (for chunks and tags) */
.hover-content-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.2);
  color: white;
  padding: 12px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.4;
  z-index: 5;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: center;
  width: 90%;
  max-width: 250px;
  /* backdrop-filter: blur(4px); */
}

.matching-chunks {
  margin: 0;
}

.chunks-text {
  margin: 0;
  font-size: 40px;
  font-weight: 800;
  opacity: 0.95;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Curation Actions */
.curation-actions,
.selection-actions {
  display: flex;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.photo-card.curation-mode:hover .curation-actions,
.photo-card.selection-mode:hover .selection-actions {
  opacity: 1;
}

.move-button {
  font-size: 11px;
  height: 28px;
  padding: 0 12px;
  backdrop-filter: blur(4px);
}

/* Info loading overlay: por encima de la imagen y de los indicadores, por
   debajo del circulo de seleccion (que sigue siendo clicable). */
.info-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

/* Selection circle (Google Photos style) — same visual language as
   CollectionCard.vue, so selection reads consistently across the app. */
.selection-circle {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 6;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.35);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  opacity: 0;
  transition:
    opacity 0.18s,
    background 0.18s,
    border-color 0.18s;
  backdrop-filter: blur(4px);
}

.photo-card:hover .selection-circle,
.photo-card.selected .selection-circle {
  opacity: 1;
}

.selection-circle.is-checked {
  background: var(--accent-color, #6366f1);
  border-color: var(--accent-color, #6366f1);
}

.selection-circle .check-icon {
  width: 16px;
  height: 16px;
  color: #fff;
}

/* No real hover on touch devices — keep the circle dimly visible so it's
   discoverable without first having something selected. */
@media (hover: none) {
  .selection-circle {
    opacity: 0.55;
  }
}

/* Shrinks with the actual card width, not just the viewport — dense grids
   can render tiny cards even on a wide screen. */
@container photo-card (max-width: 200px) {
  .selection-circle {
    width: 17px;
    height: 17px;
    top: 6px;
    left: 6px;
    border-width: 1.5px;
  }

  .selection-circle .check-icon {
    width: 12px;
    height: 12px;
  }

  .notes-indicator.corner-shifted {
    left: 24px;
  }
}

@container photo-card (max-width: 150px) {
  .selection-circle {
    width: 14px;
    height: 14px;
    top: 4px;
    left: 4px;
    border-width: 1.25px;
  }

  .selection-circle .check-icon {
    width: 10px;
    height: 10px;
  }

  .notes-indicator.corner-shifted {
    left: 20px;
  }
}

/* Mode-specific styling */
.photo-card.curation-mode {
  border-color: rgba(37, 99, 235, 0.3);
}

.photo-card.curation-mode:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.matched-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  background-color: color-mix(in srgb, var(--accent-color), transparent 50%);
  color: #ffffff;
  font-size: 10px;
  /* font-weight: 500; */
  opacity: 0.9;
  padding: 2px 6px;
  border-radius: 8px;
  text-transform: lowercase;
}

.tag-more {
  background-color: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 8px;
}

/* Match Score Stars */
.match-score-indicator {
  position: absolute;
  top: 5px;
  right: 4px;

  backdrop-filter: blur(4px);
  border-radius: 12px;

  z-index: 3;
  display: flex;
  align-items: center;
  gap: 2px;
}

.stars {
  display: flex;
  gap: 1px;
}

.star-icon {
  transition: color 0.2s ease;
}

.star-icon.filled {
  color: #fbbf24; /* Yellow for filled stars */
}

.star-icon.empty {
  color: rgba(255, 255, 255, 0.3); /* Semi-transparent white for empty stars */
}

/* Diamond Indicator */
.diamond-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
}

.diamond-icon {
  color: #60a5fa; /* Blue color for diamond */
  filter: drop-shadow(0 0 4px rgba(96, 165, 250, 0.5));
  animation: diamondPulse 2s ease-in-out infinite;
}

@keyframes diamondPulse {
  0%,
  100% {
    filter: drop-shadow(0 0 4px rgba(96, 165, 250, 0.5));
  }
  50% {
    filter: drop-shadow(0 0 8px rgba(96, 165, 250, 0.8));
  }
}

/* Low Relevance Icon */
.low-relevance-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Warning icon style (interrogativo) */
.warning-icon {
  color: var(--warning-color);
  transition: color 0.2s ease;
}

/* Notes Indicator */
.notes-indicator {
  position: absolute;
  top: 5px;
  left: 5px;
  backdrop-filter: blur(4px);
  background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
  border-radius: 8px;
  padding: 4px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notes-icon {
  color: var(--text-on-secondary);
  transition: color 0.2s ease;
}

.notes-indicator:hover .notes-icon {
  color: color-mix(in srgb, var(--accent-color), white 20%);
}

/* Cedes the corner to the selection circle outside curation mode, same
   pattern as PhotoCardHub's duplicate/basket badge. */
.notes-indicator.corner-shifted {
  left: 34px;
}

/* Delete button */
.delete-button {
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: rgba(239, 68, 68, 0.9);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
}

.photo-card:hover .delete-button {
  opacity: 1;
}

.delete-button:hover {
  background-color: rgba(239, 68, 68, 1);
  transform: scale(1.1);
}

/* Locate button — centered, appears on hover, same visual language as the
   action buttons in PhotoCardHub. */
.locate-button {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background-color: var(--info-color, #2080f0);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
  cursor: pointer;
  opacity: 0;
  backdrop-filter: blur(8px);
  transition:
    opacity 0.2s ease,
    transform 0.15s ease;
}

.photo-card:hover .locate-button {
  opacity: 0.9;
}

.locate-button:hover {
  opacity: 1 !important;
  transform: translate(-50%, -50%) scale(1.08);
}

.photo-card-info.selected {
  border-color: var(--accent-color);
  /* box-shadow: 0 0 0 1px var(--accent-color)40, 0 8px 24px rgba(139, 92, 246, 0.2); */
}

/* Loading states */
.photo-card.loading .photo-image {
  background: linear-gradient(
    90deg,
    var(--bg-card) 25%,
    var(--bg-surface-hover) 50%,
    var(--bg-card) 75%
  );
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Tooltip content styling */
.tooltip-content {
  max-width: 300px;
  word-wrap: break-word;
  white-space: normal;
  line-height: 1.4;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .photo-card {
    border-radius: 8px;
  }

  .tag {
    font-size: 9px;
    padding: 1px 4px;
  }

  .tag-more {
    font-size: 8px;
    padding: 1px 4px;
  }

  .hover-content-overlay {
    font-size: 10px;
    padding: 10px;
  }

  .move-button {
    font-size: 10px;
    height: 24px;
    padding: 0 8px;
  }

  .tooltip-content {
    max-width: 150px;
  }

  .selection-circle {
    width: 19px;
    height: 19px;
    top: 6px;
    left: 6px;
  }

  .selection-circle .check-icon {
    width: 14px;
    height: 14px;
  }
}

/* Soporte para navegadores sin container queries */
@media (max-width: 480px) {
  .selection-circle {
    width: 15px;
    height: 15px;
    top: 4px;
    left: 4px;
    border-width: 1.5px;
  }

  .selection-circle .check-icon {
    width: 11px;
    height: 11px;
  }

  .notes-indicator.corner-shifted {
    left: 20px;
  }
}

.photo-card.duplicate {
  border-color: #f59e0b;
}

/* New photo highlight - thick and bright border with glow */
.photo-card.is-new {
  border: 3px solid #22d3ee;
  box-shadow:
    0 0 0 1px #22d3ee40,
    0 0 20px rgba(34, 211, 238, 0.4),
    0 4px 12px rgba(34, 211, 238, 0.2);
  animation: newPhotoGlow 2s ease-in-out infinite alternate;
}

@keyframes newPhotoGlow {
  0% {
    box-shadow:
      0 0 0 1px #22d3ee40,
      0 0 15px rgba(34, 211, 238, 0.3),
      0 4px 12px rgba(34, 211, 238, 0.15);
  }
  100% {
    box-shadow:
      0 0 0 1px #22d3ee60,
      0 0 25px rgba(34, 211, 238, 0.5),
      0 4px 12px rgba(34, 211, 238, 0.25);
  }
}
</style>
