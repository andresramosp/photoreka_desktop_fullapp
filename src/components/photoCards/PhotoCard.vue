<template>
  <div
    class="photo-card"
    :class="{
      selected: isSelected,
      'curation-mode': mode === 'curation',
      'selection-mode': mode === 'selection',
      'is-new': props.isNew,
    }"
    @click="mode !== 'curation' && toggleSelection()"
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
        @load="onImageLoad"
        @error="onImageError"
        :style="shouldBlur ? 'filter: blur(8px); transition: filter 0.3s;' : ''"
      />

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
        v-if="props.showStars && (computedStars > 0 || showLowRelevanceIcon)"
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

      <!-- Notes Indicator (top-left corner) -->
      <div v-if="hasNotesChunk" class="notes-indicator">
        <n-tooltip trigger="hover" placement="top">
          <template #trigger>
            <n-icon size="14" class="notes-icon">
              <NotesIcon />
            </n-icon>
          </template>
          <span>Contains notes</span>
        </n-tooltip>
      </div>

      <!-- Action Buttons (center overlay or top-left if reasoning exists) -->
      <div
        v-if="showInfoButton"
        class="action-buttons-overlay"
        :class="{ 'has-reasoning': photo.reasoning }"
      >
        <n-button
          :size="photo.reasoning ? 'small' : 'medium'"
          class="action-button info-button"
          @click.stop="showInfo"
        >
          <template #icon>
            <n-icon :size="photo.reasoning ? 14 : 20">
              <InfoIcon />
            </n-icon>
          </template>
        </n-button>
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

      <!-- Selection indicator -->
      <div v-if="isSelected" class="selection-indicator">
        <n-icon size="20" color="#ffffff">
          <CheckCircleIcon />
        </n-icon>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { NIcon, NTooltip, NButton } from "naive-ui";

// Import @vicons icons from ionicons5 for reliability
import {
  ChevronForwardOutline as ChevronRightIcon,
  ChevronBackOutline as ChevronLeftIcon,
  CheckmarkCircleOutline as CheckCircleIcon,
  HelpCircleOutline as HelpIcon,
  InformationCircleOutline as InfoIcon,
  TrashOutline as TrashIcon,
  DocumentTextOutline as NotesIcon,
} from "@vicons/ionicons5";

import { usePhotoScored } from "@/composables/usePhotoScored.js";
import { InfoCircleFilled } from "@vicons/antd";

// Photo scoring composable
const { computePhotoStars, shouldShowLowRelevanceIcon } = usePhotoScored();

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
  title: string;
  rating: number;
  reasoning?: string;
  matchScore?: number; // AI-generated match score (0 = not scored yet, 1-3 stars)
  labelScore?: "excellent" | "good" | "fair" | "poor"; // New enum-based scoring system
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
  showInfoButton?: boolean; // Control visibility of info button
  showDeleteButton?: boolean; // Control visibility of delete button
}

interface Emits {
  (e: "select", photoId: string): void;
  (e: "info", photo: Photo): void;
  (e: "move-to-selection", photoId: string): void; // For curation mode
  (e: "move-to-curation", photoId: string): void; // For selection mode
  (e: "delete", photoId: string): void; // For deleting individual photos
}

const props = withDefaults(defineProps<Props & { isThinking?: boolean }>(), {
  selected: false,
  mode: "default",
  isThinking: false,
  showStars: true,
  showTags: true,
  showReturnButton: true,
  isNew: false,
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

const showInfo = () => {
  emit("info", props.photo);
};

const isSelected = computed(() => props.selected);
const imageLoaded = ref(false);
const imageError = ref(false);
const showTooltip = ref(false);
const showHoverContent = ref(false);

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

const toggleSelection = () => {
  if (props.mode === "curation") return;
  emit("select", props.photo.id);
};

const onImageLoad = () => {
  imageLoaded.value = true;
};

const onImageError = () => {
  imageError.value = true;
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
}

/* .photo-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
} */

.photo-card.selected {
  border-color: #8b5cf6;
  box-shadow:
    0 0 0 1px #8b5cf640,
    0 8px 24px var(--bg-surface);
}

.photo-container {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: var(--bg-surface);
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

/* Action buttons overlay */
.action-buttons-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 3;
  display: flex;
  gap: 8px;
}

.action-buttons-overlay.has-reasoning {
  top: 8px;
  left: 8px;
  transform: none;
}

.photo-card:hover .action-buttons-overlay {
  opacity: 1;
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

/* Mode-specific styling */
.photo-card.curation-mode {
  border-color: rgba(37, 99, 235, 0.3);
}

.photo-card.curation-mode:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.photo-card.selection-mode {
  border-color: rgba(34, 197, 94, 0.3);
}

.photo-card.selection-mode:hover {
  border-color: var(--success-color);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
}

.matched-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  background-color: color-mix(in srgb, var(--secondary-color), transparent 50%);
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
  background-color: color-mix(in srgb, var(--secondary-color), transparent 80%);
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
  color: color-mix(in srgb, var(--secondary-color), white 20%);
}

.selection-indicator {
  position: absolute;
  top: 8px;
  left: 8px;
  background-color: rgba(139, 92, 246, 0.9);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
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

.photo-card-info.selected {
  border-color: var(--secondary-color);
  /* box-shadow: 0 0 0 1px #8b5cf640, 0 8px 24px rgba(139, 92, 246, 0.2); */
}

/* Loading states */
.photo-card.loading .photo-image {
  background: linear-gradient(90deg, #18181c 25%, #2c2c32 50%, #18181c 75%);
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
