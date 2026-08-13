<template>
  <!-- Desktop Layout -->
  <PhotoInfoDesktopLayout
    v-if="!isMobile"
    :visible="visible"
    :selectedPhoto="selectedPhoto"
    :groupedTags="getGroupedTags()"
    :photoNotes="photoNotes"
    :wordCount="wordCount"
    :isSavingNotes="isSavingNotes"
    :overallRating="overallRating"
    :scoreScale="scoreScale"
    :selectedGenre="selectedGenre"
    :showCustomWeights="showCustomWeights"
    :artisticScoreWeights="artisticScoreWeights"
    :orderedArtisticScores="orderedArtisticScoresComputed"
    :allPhotoInsights="allPhotoInsights"
    :isGeneratingInsight="isGeneratingInsight"
    :pendingInsightLabel="pendingInsightLabel"
    :customInsightQuestion="customInsightQuestion"
    :customQuestionsRemaining="customQuestionsRemaining"
    :insightTypesAvailable="insightTypesAvailable"
    :canUseInsights="canUseInsights"
    :photoLibrary="photoLibrary"
    :photoCredit="photoCredit"
    :formatDate="formatDate"
    :formatExposureTime="formatExposureTime"
    :formatCategoryName="formatCategoryName"
    :formatCriterionName="formatCriterionName"
    :formatGenreTooltip="formatGenreTooltip"
    :getScoreBgColor="getScoreBgColor"
    :availableGenrePresets="availableGenrePresets"
    :showDelete="showDelete"
    :showAddToCollection="showAddToCollection"
    :showMoveToTool="showMoveToTool"
    :showSendToChat="true"
    :allPhotos="allPhotos"
    :currentPhotoIndex="currentPhotoIndex"
    @update:visible="visible = $event"
    @copy-name="copyNameToClipboard"
    @image-error="handleImageError"
    @download="handleDownloadPhoto"
    @open-fullscreen="openFullscreen"
    @update:photo-notes="photoNotes = $event"
    @update-word-count="updateWordCount"
    @save-notes="saveNotes"
    @apply-genre-preset="applyGenrePresetWithUI"
    @update:artistic-score-weights="artisticScoreWeights = $event"
    @get-insight="getSpecificInsight"
    @update:custom-insight-question="customInsightQuestion = $event"
    @submit-custom-question="submitCustomQuestion"
    @delete-photo="handleDeletePhoto"
    @add-to-collection="handleAddToCollection"
    @move-to-tool="handleMoveToTool"
    @send-to-chat="handleSendToChat"
    @navigate-to-photo="handleNavigateToPhoto"
    @photo-navigate="handlePhotoNavigate"
    @set-flag="handleCycleFlag"
  />

  <!-- Mobile Layout -->
  <PhotoInfoMobileLayout
    v-else
    :visible="visible"
    :selectedPhoto="selectedPhoto"
    :groupedTags="getGroupedTags()"
    :photoNotes="photoNotes"
    :wordCount="wordCount"
    :isSavingNotes="isSavingNotes"
    :overallRating="overallRating"
    :scoreScale="scoreScale"
    :selectedGenre="selectedGenre"
    :showCustomWeights="showCustomWeights"
    :artisticScoreWeights="artisticScoreWeights"
    :orderedArtisticScores="orderedArtisticScoresComputed"
    :allPhotoInsights="allPhotoInsights"
    :isGeneratingInsight="isGeneratingInsight"
    :pendingInsightLabel="pendingInsightLabel"
    :customInsightQuestion="customInsightQuestion"
    :customQuestionsRemaining="customQuestionsRemaining"
    :insightTypesAvailable="insightTypesAvailable"
    :canUseInsights="canUseInsights"
    :photoLibrary="photoLibrary"
    :photoCredit="photoCredit"
    :formatDate="formatDate"
    :formatExposureTime="formatExposureTime"
    :formatCategoryName="formatCategoryName"
    :formatCriterionName="formatCriterionName"
    :formatGenreTooltip="formatGenreTooltip"
    :getScoreBgColor="getScoreBgColor"
    :availableGenrePresets="availableGenrePresets"
    :showDelete="showDelete"
    :showAddToCollection="showAddToCollection"
    :showMoveToTool="showMoveToTool"
    :showSendToChat="true"
    @update:visible="visible = $event"
    @copy-name="copyNameToClipboard"
    @image-error="handleImageError"
    @download="handleDownloadPhoto"
    @open-fullscreen="openFullscreen"
    @update:photo-notes="photoNotes = $event"
    @update-word-count="updateWordCount"
    @save-notes="saveNotes"
    @apply-genre-preset="applyGenrePresetWithUI"
    @update:artistic-score-weights="artisticScoreWeights = $event"
    @get-insight="getSpecificInsight"
    @update:custom-insight-question="customInsightQuestion = $event"
    @submit-custom-question="submitCustomQuestion"
    @delete-photo="handleDeletePhoto"
    @add-to-collection="handleAddToCollection"
    @move-to-tool="handleMoveToTool"
    @send-to-chat="handleSendToChat"
    @navigate-to-photo="handleNavigateToPhoto"
    @set-flag="handleCycleFlag"
  />

  <!-- Collection Modal -->
  <CollectionModal
    :show="showCollectionModal"
    :photo-count="1"
    :photo-ids="selectedPhoto ? [selectedPhoto.id] : []"
    @add-to-collection="handleCollectionAdded"
    @add-to-series="handleCollectionAdded"
    @add-to-portfolio="handleCollectionAdded"
    @cancel="showCollectionModal = false"
  />

  <!-- Photo Tool Selector Modal -->
  <PhotoToolSelector
    :show="showToolSelector"
    :photo-count="1"
    :is-processing="isProcessingTool"
    @tool-selected="handleToolSelected"
    @close="closeToolSelector"
  />

  <!-- Delete Confirmation Modal -->
  <n-modal
    v-model:show="showDeleteConfirm"
    preset="dialog"
    title="Confirm Deletion"
  >
    <template #header>
      <div style="font-size: 18px; font-weight: 600">Confirm Deletion</div>
    </template>
    <div style="padding: 16px 0">
      <p style="font-size: 16px">
        Are you sure you want to delete this photo? This action cannot be
        undone.
      </p>
    </div>
    <template #action>
      <n-button @click="showDeleteConfirm = false">Cancel</n-button>
      <n-button
        type="error"
        :loading="isDeletingPhoto"
        @click="confirmDeletePhoto"
        >Delete</n-button
      >
    </template>
  </n-modal>

  <!-- Fullscreen Photo Modal -->
  <n-modal
    v-model:show="showFullscreenPhoto"
    :mask-closable="true"
    :show-icon="false"
    :closable="false"
    :style="{ padding: '0' }"
    transform-origin="center"
  >
    <div class="fullscreen-container" @click="closeFullscreen">
      <div class="fullscreen-content">
        <!-- Navigation Arrow Left -->
        <n-button
          v-if="hasPreviousPhoto"
          class="nav-arrow nav-arrow-left"
          size="large"
          circle
          type="primary"
          @click.stop="goToPreviousPhoto"
          title="Previous photo (←)"
        >
          <template #icon>
            <n-icon size="24">
              <ChevronBack />
            </n-icon>
          </template>
        </n-button>

        <div v-if="isImageLoading" class="fullscreen-loading-overlay">
          <SpiralGridLoader variant="white" :size="56" />
        </div>

        <img
          :src="
            fullscreenPhoto?.originalUrl ||
            fullscreenPhoto?.url ||
            fullscreenPhoto?.thumbnailUrl
          "
          :alt="fullscreenPhoto?.filename || fullscreenPhoto?.name || 'Photo'"
          class="fullscreen-photo"
          @load="onFullscreenImageLoad"
          @error="
            (e) => {
              handleImageError(e);
              onFullscreenImageError();
            }
          "
          @click="closeFullscreen"
        />

        <!-- Navigation Arrow Right -->
        <n-button
          v-if="hasNextPhoto"
          class="nav-arrow nav-arrow-right"
          size="large"
          circle
          type="primary"
          @click.stop="goToNextPhoto"
          title="Next photo (→)"
        >
          <template #icon>
            <n-icon size="24">
              <ChevronForward />
            </n-icon>
          </template>
        </n-button>

        <!-- Photo Counter -->
        <!-- <div v-if="photoCounter" class="photo-counter">
          {{ photoCounter }}
        </div> -->

        <!-- Close Button -->
        <n-button
          class="close-fullscreen-btn"
          size="large"
          circle
          type="primary"
          @click.stop="closeFullscreen"
          title="Close fullscreen (Esc)"
        >
          <template #icon>
            <n-icon size="20">
              <CloseIcon />
            </n-icon>
          </template>
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { NModal, NIcon, NButton, useMessage } from "naive-ui";
import CollectionModal from "./CollectionModal.vue";
import PhotoToolSelector from "./PhotoToolSelector.vue";
import CustomArtisticWeights from "./CustomArtisticWeights.vue";

// Layout Components
import PhotoInfoDesktopLayout from "./photo-info/layouts/PhotoInfoDesktopLayout.vue";
import PhotoInfoMobileLayout from "./photo-info/layouts/PhotoInfoMobileLayout.vue";

import SpiralGridLoader from "./SpiralGridLoader.vue";

// Composables
import { useIsMobile } from "@/composables/useIsMobile.js";
import { useActivityLogger } from "@/composables/useActivityLogger";
import { useFullscreenPhotoNavigation } from "@/composables/useFullscreenPhotoNavigation.js";
import { useUserStore } from "@/stores/userStore.ts";
import { useCollectionsStore } from "@/stores/collections.js";
import { useSeriesStore } from "@/stores/series.js";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds.js";
import { usePhotosStore } from "@/stores/photos.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";

// Icons from @vicons
import {
  CopyOutline as CopyIcon,
  DownloadOutline as DownloadIcon,
  InformationCircleOutline as InfoIcon,
  PricetagOutline as TagIcon,
  DocumentTextOutline as DocumentTextIcon,
  SparklesOutline as SparklesIcon,
  RefreshOutline as RefreshIcon,
  CreateOutline as EditIcon,
  WalkOutline,
  CameraOutline,
  BriefcaseOutline,
  CloseOutline as CloseIcon,
  ChevronBackOutline as ChevronBack,
  ChevronForwardOutline as ChevronForward,
  GlobeOutline,
  SettingsOutline,
  BrushOutline,
  SendOutline,
} from "@vicons/ionicons5";
import { FullscreenOutlined } from "@vicons/material";
import { Trophy20Regular as ScoresIcon } from "@vicons/fluent";

import { api } from "@/utils/axios.js";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import {
  useArtisticScores,
  getDefaultGenreFromProfile,
} from "@/composables/useArtisticScores.js";
import { getGenrePresetKeys, getProfileVariant } from "@/config/photo_schema";
import { tagCategoryNameMap } from "@/stores/photos.js";
import { BookOpen16Regular } from "@vicons/fluent";
import { PaletteOutlined } from "@vicons/material";

// Mobile detection
const { isMobile } = useIsMobile();
const { logActivity } = useActivityLogger();
const userStore = useUserStore();
const collectionsStore = useCollectionsStore();
const seriesStore = useSeriesStore();
const portfolioBuildsStore = usePortfolioBuildsStore();
const photosStore = usePhotosStore();
const {
  takeToTool,
  takeToChat,
  showToolSelector,
  isProcessing: isProcessingTool,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  selectedPhoto: {
    type: Object,
    default: null,
  },
  allPhotos: {
    type: Array,
    default: () => [],
  },
  currentPhotoIndex: {
    type: Number,
    default: -1,
  },
  showDelete: {
    type: Boolean,
    default: true,
  },
  showAddToCollection: {
    type: Boolean,
    default: true,
  },
  showMoveToTool: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits([
  "update:modelValue",
  "photo-navigate",
  "change-photo",
]);

const message = useMessage();
const { downloadPhoto } = usePhotoDownload();
const {
  scoreScale,
  calculateArtisticScore,
  getScoreBgColor,
  formatCriterionName,
  formatGenreTooltip,
  artisticScoreWeights,
  selectedGenre,
  applyGenrePreset,
  getActiveArtisticScores,
  getOrderedArtisticScores,
} = useArtisticScores({ profile: () => userStore.user?.profiles });

// Genre presets shown in the scores section derive from the user's
// profile-variant via the central schema's `getGenrePresetKeys`.
const GENRE_PRESET_META = {
  general: { label: "General", icon: CameraOutline },
  street: { label: "Street", icon: WalkOutline },
  documentary: { label: "Documentary", icon: BookOpen16Regular },
  abstract: { label: "Artistic", icon: PaletteOutlined },
  commercial: { label: "Commercial", icon: BriefcaseOutline },
};
const availableGenrePresets = computed(() => {
  const variant = getProfileVariant(userStore.user?.profiles);
  return getGenrePresetKeys(variant).map((key) => ({
    key,
    label: GENRE_PRESET_META[key]?.label ?? key,
    icon: GENRE_PRESET_META[key]?.icon ?? CameraOutline,
  }));
});

// Simple session limits (resets on app restart)
const MAX_QUESTIONS = 3; // Max custom questions per photo
const MAX_PHOTOS_INSIGHTS = 3; // Max photos that can have insights per session

// Session usage tracking (in-memory, resets on reload)
const sessionPhotoUsage = ref(new Map()); // photoId -> { types: Set, customQuestions: number }
const sessionPhotoCount = ref(new Set()); // Set of photoIds that have been used
const sessionPhotoInsights = ref(new Map()); // photoId -> { insights: [], currentIndex: 0 }

// Reactive state
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

watch(visible, (isOpen) => {
  if (isOpen) {
    // El preset de género es estado de sesión del diálogo: se mantiene al pasar
    // de foto en foto con las flechas y sólo vuelve al preset del perfil cuando
    // se reabre el diálogo.
    applyGenrePresetWithUI(
      getDefaultGenreFromProfile(userStore.user?.profiles),
    );

    logActivity("ui_action", {
      action: "photo_info_open",
      photoId: props.selectedPhoto?.id,
    });
  }
});

const photoTags = ref([]);
const newTagName = ref("");
const isAddingTag = ref(false);
const photoInsight = ref("");
const isGeneratingInsight = ref(false);
const pendingInsightLabel = ref("");
const customInsightQuestion = ref("");
const photoNotes = ref("");
const isSavingNotes = ref(false);
const wordCount = ref(0);

const showCustomWeights = ref(false);
const showCollectionModal = ref(false);
const showDeleteConfirm = ref(false);
const isDeletingPhoto = ref(false);

// Fullscreen viewer: open/close, prev/next navigation, keyboard shortcuts,
// adjacent-image preloading and the loading spinner are all shared with the
// photo cards' own fullscreen (PhotoCard.vue / PhotoCardHub.vue) via
// useFullscreenPhotoNavigation. This dialog runs it in "controlled" mode:
// the current index lives in the parent (props.currentPhotoIndex), so
// navigating emits photo-navigate instead of tracking its own photo.
const {
  showFullscreenPhoto,
  fullscreenPhoto,
  isImageLoading,
  hasPrevious: hasPreviousPhoto,
  hasNext: hasNextPhoto,
  openFullscreen: openPhotoFullscreen,
  closeFullscreen,
  goToPrevious: navigateToPreviousPhoto,
  goToNext: navigateToNextPhoto,
  onFullscreenImageLoad,
  onFullscreenImageError,
} = useFullscreenPhotoNavigation({
  photo: () => props.selectedPhoto,
  allPhotos: () => props.allPhotos,
  currentIndex: () => props.currentPhotoIndex,
  onNavigate: (index) => emit("photo-navigate", index),
});

const photoCounter = computed(() => {
  if (!props.allPhotos?.length || props.currentPhotoIndex < 0) return "";
  return `${props.currentPhotoIndex + 1} / ${props.allPhotos.length}`;
});

// Computed: collections, series and portfolios that contain this photo
const photoLibrary = computed(() => {
  const photoId = props.selectedPhoto?.id;
  if (!photoId) return { collections: [], series: [], portfolios: [] };

  const collections = collectionsStore.allCollections
    .filter((c) => c.photos?.some((p) => String(p.id) === String(photoId)))
    .map((c) => ({ id: c.id, name: c.name || c.title }));

  const series = seriesStore.allSeries
    .filter((s) => s.photos?.some((p) => String(p.id) === String(photoId)))
    .map((s) => ({ id: s.id, name: s.name || s.title }));

  const portfolios = portfolioBuildsStore.allBuilds
    .filter((b) => b.photoItems?.some((p) => String(p.id) === String(photoId)))
    .map((b) => ({ id: b.id, name: b.config?.name || `Portfolio #${b.id}` }));

  return { collections, series, portfolios };
});

// Generic photo credit info for any user
const photoCredit = computed(() => {
  // Check if user is demo user
  const isDemoUser = userStore.user?.email === "demo@photorekatest.com";
  if (!isDemoUser) return null;

  // Check if filename contains "DSCF" for flaneur_oo credit
  const filename =
    props.selectedPhoto?.originalFileName ||
    props.selectedPhoto?.filename ||
    props.selectedPhoto?.name ||
    "";

  const process986 = props.selectedPhoto?.analyzerProcessId === 986;

  if (
    filename.toUpperCase().includes("DSCF") ||
    filename.toUpperCase().includes("_DSC") ||
    process986
  ) {
    return {
      username: "@flaneur_oo",
      url: "https://www.instagram.com/flaneur_oo",
    };
  }

  return null;
});

// Navigation methods (activity logging wraps the shared nav logic)
const goToPreviousPhoto = () => {
  if (!hasPreviousPhoto.value) return;
  logActivity("ui_action", {
    action: "photo_info_navigate",
    direction: "prev",
    fromIndex: props.currentPhotoIndex,
    photoId: props.selectedPhoto?.id,
  });
  navigateToPreviousPhoto();
};

const goToNextPhoto = () => {
  if (!hasNextPhoto.value) return;
  logActivity("ui_action", {
    action: "photo_info_navigate",
    direction: "next",
    fromIndex: props.currentPhotoIndex,
    photoId: props.selectedPhoto?.id,
  });
  navigateToNextPhoto();
};

// Handler for dialog-level navigation (from arrow buttons in desktop layout)
const handlePhotoNavigate = (index) => {
  emit("photo-navigate", index);
};

// Function to show custom weight controls
const showCustomControls = () => {
  selectedGenre.value = "custom";
  showCustomWeights.value = true; // Show custom weights for manual configuration
  // Don't reset weights, keep current configuration
};

// Override applyGenrePreset to also control showCustomWeights
const applyGenrePresetWithUI = (genre) => {
  applyGenrePreset(genre);
  showCustomWeights.value = false; // Hide custom weights when applying preset
};

// Watch for photo changes and load persistent data
watch(
  () => props.selectedPhoto,
  (newPhoto) => {
    if (newPhoto) {
      // Initialize tags from photo data
      photoTags.value = newPhoto.tags ? [...newPhoto.tags] : [];

      // Initialize description and notes if they exist
      photoInsight.value = newPhoto.description || "";
      photoNotes.value = newPhoto.descriptions?.notes || "";
      updateWordCount(); // Update word count when photo changes

      // Load insights from session storage (persist across dialog openings)
      if (sessionPhotoInsights.value.has(newPhoto.id)) {
        const savedData = sessionPhotoInsights.value.get(newPhoto.id);
        allPhotoInsights.value = savedData.insights;
        currentInsightIndex.value = savedData.currentIndex;
      } else {
        // Initialize empty if first time viewing this photo
        allPhotoInsights.value = [];
        currentInsightIndex.value = 0;
      }

      isGeneratingInsight.value = false;
      customInsightQuestion.value = "";
      pendingInsightLabel.value = "";
    }
  },
  { immediate: true },
);

// Helper functions
const formatDate = (dateString) => {
  if (!dateString) return "Unknown";

  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return "Unknown";

  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const formatExposureTime = (exposureTime) => {
  if (!exposureTime) return "Unknown";

  if (exposureTime >= 1) {
    return `${exposureTime}s`;
  } else {
    return `1/${Math.round(1 / exposureTime)}`;
  }
};

const openFullscreen = () => {
  openPhotoFullscreen();
  logActivity("ui_action", {
    action: "photo_info_fullscreen_open",
    photoId: props.selectedPhoto?.id,
  });
};

const formatCategoryName = (category) => {
  // Check if there's a custom mapping first
  if (tagCategoryNameMap[category]) {
    return tagCategoryNameMap[category];
  }

  // Fallback: Convert snake_case to Title Case
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Group tags by their transformed category name, excluding 'misc' group
const getGroupedTags = () => {
  if (!photoTags.value || photoTags.value.length === 0) {
    return {};
  }

  // Filter out misc group and group by 'group' property
  const filteredTags = photoTags.value.filter((tag) => tag.group !== "misc");

  // Group tags by their group property, applying category name transformation first
  const grouped = filteredTags.reduce((acc, tag) => {
    const originalCategory = tag.category || "General";
    // Apply category name mapping BEFORE grouping
    const transformedGroupName = formatCategoryName(originalCategory);

    if (!acc[transformedGroupName]) {
      acc[transformedGroupName] = [];
    }
    acc[transformedGroupName].push(tag);
    return acc;
  }, {});

  // Return as object/map for direct access by category name
  return grouped;
};

const formatGroupName = (groupName) => {
  // Convert snake_case or camelCase to Title Case
  return groupName
    .replace(/([A-Z])/g, " $1") // Handle camelCase
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
};

const splitArtisticReview = (text) => {
  if (!text) return [];

  // Split into sentences, keeping the period
  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];

  if (sentences.length <= 3) {
    return sentences;
  }

  // Calculate approximately equal chunks
  const totalSentences = sentences.length;
  const sentencesPerParagraph = Math.ceil(totalSentences / 3);

  const paragraphs = [];
  for (let i = 0; i < 3; i++) {
    const start = i * sentencesPerParagraph;
    const end = Math.min(start + sentencesPerParagraph, totalSentences);
    const paragraph = sentences.slice(start, end).join(" ").trim();
    if (paragraph) {
      paragraphs.push(paragraph);
    }
  }

  return paragraphs;
};

const getFilteredVisualAspects = (visualAspects) => {
  // Filter out the summary field from visual aspects
  const filtered = { ...visualAspects };
  delete filtered.summary;
  return filtered;
};

const handleImageError = (event) => {
  console.warn("Failed to load original image, falling back to thumbnail");
  // Could implement fallback logic here
};

const copyNameToClipboard = async () => {
  const name = props.selectedPhoto?.originalFileName || "Untitled";

  try {
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(name);
      message.success("Photo name copied to clipboard");
    } else {
      // Fallback for environments where clipboard API is not available
      fallbackCopyTextToClipboard(name);
    }
  } catch (error) {
    console.warn("Clipboard API failed, trying fallback method:", error);
    fallbackCopyTextToClipboard(name);
  }
};

const fallbackCopyTextToClipboard = (text) => {
  try {
    // Create a temporary textarea element
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    // Try to copy using the old execCommand method
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);

    if (successful) {
      message.success("Photo name copied to clipboard");
    } else {
      message.warning(
        "Unable to copy automatically. Please copy manually: " + text,
      );
    }
  } catch (err) {
    console.warn("All copy methods failed:", err);
    message.warning("Copy not supported. Photo name: " + text);
  }
};

const handleDownloadPhoto = () => {
  downloadPhoto(props.selectedPhoto);
};

// Tags management
const addTag = async () => {
  const tagName = newTagName.value.trim();
  if (!tagName) return;

  // Check if tag already exists
  if (photoTags.value.some((tag) => (tag.name || tag) === tagName)) {
    message.warning("Tag already exists");
    return;
  }

  isAddingTag.value = true;

  try {
    // Create new tag object
    const newTag = {
      id: Date.now(), // Temporary ID, would be replaced by backend
      name: tagName,
    };

    photoTags.value.push(newTag);
    newTagName.value = "";

    // Here you would typically save to backend
    // await saveTagsToPhoto(props.selectedPhoto.id, photoTags.value)

    message.success("Tag added successfully");
  } catch (error) {
    photoTags.value.pop(); // Remove the tag if save failed
    console.error("Add tag failed:", error);
  } finally {
    isAddingTag.value = false;
  }
};

const removeTag = async (tagToRemove) => {
  const index = photoTags.value.findIndex(
    (tag) =>
      (tag.id && tag.id === tagToRemove.id) ||
      (tag.name || tag) === (tagToRemove.name || tagToRemove),
  );

  if (index === -1) return;

  try {
    photoTags.value.splice(index, 1);

    // Here you would typically save to backend
    // await saveTagsToPhoto(props.selectedPhoto.id, photoTags.value)

    message.success("Tag removed successfully");
  } catch (error) {
    // Restore the tag if removal failed
    photoTags.value.splice(index, 0, tagToRemove);
    console.error("Remove tag failed:", error);
  }
};

// Description generation
const allPhotoInsights = ref([]);
const currentInsightIndex = ref(0);

// Computed properties for insight availability (simple session-based)
const insightTypesAvailable = computed(() => {
  if (!props.selectedPhoto?.id)
    return { cultural: true, technical: true, artistic: true };

  const photoUsage = sessionPhotoUsage.value.get(props.selectedPhoto.id);
  if (!photoUsage) return { cultural: true, technical: true, artistic: true };

  return {
    cultural: !photoUsage.types.has("cultural"),
    technical: !photoUsage.types.has("technical"),
    artistic: !photoUsage.types.has("artistic"),
  };
});

const customQuestionsRemaining = computed(() => {
  if (!props.selectedPhoto?.id) return MAX_QUESTIONS;

  const photoUsage = sessionPhotoUsage.value.get(props.selectedPhoto.id);
  const usedQuestions = photoUsage?.customQuestions || 0;

  return Math.max(0, MAX_QUESTIONS - usedQuestions);
});

const canUseInsights = computed(() => {
  if (!props.selectedPhoto?.id) return false;

  // If photo already has usage, it's counted
  if (sessionPhotoUsage.value.has(props.selectedPhoto.id)) return true;

  // Check if we're under the session photo limit
  return sessionPhotoCount.value.size < MAX_PHOTOS_INSIGHTS;
});

// Computed property for overall rating - automatically updates when weights change
const overallRating = computed(() => {
  if (!props.selectedPhoto?.descriptions?.artistic_scores) {
    return { average: 0, rating: "N/A", total: 0, count: 0 };
  }

  // Use custom weights if in custom mode, otherwise use the selected genre
  const customWeights =
    selectedGenre.value === "custom" ? artisticScoreWeights.value : null;
  return calculateArtisticScore(
    props.selectedPhoto.descriptions.artistic_scores,
    selectedGenre.value,
    customWeights,
  );
});

// Computed property for ordered artistic scores (for layout components)
const orderedArtisticScoresComputed = computed(() => {
  if (!props.selectedPhoto?.descriptions?.artistic_scores) {
    return [];
  }
  return getOrderedArtisticScores(
    props.selectedPhoto.descriptions.artistic_scores,
  );
});

// Get insight type label for display
const getInsightLabel = (type, question = null) => {
  const labels = {
    cultural: "Cultural Context",
    technical: "Technical Analysis",
    artistic: "Artistic Perspective",
    custom: question
      ? `Q: ${question.substring(0, 50)}${question.length > 50 ? "..." : ""}`
      : "Custom Question",
  };
  return labels[type] || type;
};

// Build insight history for API call (last 3 interactions)
const buildInsightHistory = (insights) => {
  // Take the last 3 insights
  const recentInsights = insights.slice(-3);

  const history = [];
  for (const insight of recentInsights) {
    history.push({
      role: "user",
      content: insight.label,
    });
    history.push({
      role: "assistant",
      content: insight.text,
    });
  }

  return history;
};

// Get specific insight by type
const getSpecificInsight = async (type) => {
  if (!props.selectedPhoto?.id) {
    message.error("No photo selected");
    return;
  }

  // Check if this insight type is available
  const availability = insightTypesAvailable.value;
  if (!availability[type]) {
    message.warning(
      `You've already requested a ${type} insight for this photo in this session`,
    );
    return;
  }

  // Check if we can use insights on this photo (session limit)
  if (!canUseInsights.value) {
    message.warning(
      "You've reached your session limit of photos with insights (20 photos)",
    );
    return;
  }

  isGeneratingInsight.value = true;
  pendingInsightLabel.value = getInsightLabel(type);

  try {
    const { data } = await api.post(
      `/api/photoInsightSpecific/${props.selectedPhoto.id}`,
      {
        type: type,
        provider: "gpt",
      },
    );

    if (data && data.insightType) {
      const insightText = data[type] || data.response;
      if (insightText) {
        // Record usage in session
        if (!sessionPhotoUsage.value.has(props.selectedPhoto.id)) {
          sessionPhotoUsage.value.set(props.selectedPhoto.id, {
            types: new Set(),
            customQuestions: 0,
          });
          sessionPhotoCount.value.add(props.selectedPhoto.id);
        }
        sessionPhotoUsage.value.get(props.selectedPhoto.id).types.add(type);

        allPhotoInsights.value.push({
          type: type,
          label: getInsightLabel(type),
          text: insightText,
        });

        // Persist insights for this photo
        sessionPhotoInsights.value.set(props.selectedPhoto.id, {
          insights: allPhotoInsights.value,
          currentIndex: currentInsightIndex.value,
        });
      } else {
        message.warning("No insight content received");
      }
    } else {
      message.warning("No insights found for this photo");
    }
  } catch (error) {
    console.error("Generate insight failed:", error);
  } finally {
    isGeneratingInsight.value = false;
    pendingInsightLabel.value = "";
  }
};

// Submit custom question
const submitCustomQuestion = async () => {
  const question = customInsightQuestion.value.trim();
  if (!question) return;

  if (!props.selectedPhoto?.id) {
    message.error("No photo selected");
    return;
  }

  // Check if we have remaining custom questions
  if (customQuestionsRemaining.value <= 0) {
    message.warning(
      "You've reached the limit of custom questions for this photo in this session (5 max)",
    );
    return;
  }

  // Check if we can use insights on this photo (session limit)
  if (!canUseInsights.value) {
    message.warning(
      "You've reached your session limit of photos with insights (20 photos)",
    );
    return;
  }

  isGeneratingInsight.value = true;
  pendingInsightLabel.value = getInsightLabel("custom", question);
  const savedQuestion = question;
  customInsightQuestion.value = "";

  try {
    const history = buildInsightHistory(allPhotoInsights.value);

    const { data } = await api.post(
      `/api/photoInsightSpecific/${props.selectedPhoto.id}`,
      {
        type: "custom",
        question: savedQuestion,
        provider: "gpt",
        history: history,
      },
    );

    if (data && data.response) {
      // Record usage in session
      if (!sessionPhotoUsage.value.has(props.selectedPhoto.id)) {
        sessionPhotoUsage.value.set(props.selectedPhoto.id, {
          types: new Set(),
          customQuestions: 0,
        });
        sessionPhotoCount.value.add(props.selectedPhoto.id);
      }
      sessionPhotoUsage.value.get(props.selectedPhoto.id).customQuestions++;

      allPhotoInsights.value.push({
        type: "custom",
        label: getInsightLabel("custom", savedQuestion),
        text: data.response,
      });

      // Persist insights for this photo
      sessionPhotoInsights.value.set(props.selectedPhoto.id, {
        insights: allPhotoInsights.value,
        currentIndex: currentInsightIndex.value,
      });
    } else {
      message.warning("No response received");
    }
  } catch (error) {
    console.error("Custom question failed:", error);
  } finally {
    isGeneratingInsight.value = false;
    pendingInsightLabel.value = "";
  }
};

// Function to highlight matching chunks in text
const highlightMatchingChunks = (text) => {
  if (
    !text ||
    !props.selectedPhoto?.matchingChunks ||
    props.selectedPhoto.matchingChunks.length === 0
  ) {
    return text;
  }

  let highlightedText = text;

  // Sort chunks by length (longest first) to avoid partial replacements
  const sortedChunks = [...props.selectedPhoto.matchingChunks]
    .filter((chunkObj) => chunkObj.chunk && chunkObj.chunk.trim().length > 0)
    .sort((a, b) => b.chunk.length - a.chunk.length);

  sortedChunks.forEach((chunkObj) => {
    const { chunk, isFullQuery, proximity } = chunkObj;
    const className = isFullQuery
      ? "highlighted-chunk-full"
      : "highlighted-chunk";

    // Format proximity for display
    const proximityText = proximity
      ? `Proximity: ${proximity.toFixed(2)}`
      : "No proximity data";
    const queryType = isFullQuery ? " (Full Query)" : " (Partial Query)";
    const tooltipText = proximityText + queryType;

    // Create a case-insensitive regex to find the chunk
    const regex = new RegExp(
      `(${chunk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi",
    );
    highlightedText = highlightedText.replace(
      regex,
      `<span class="${className}" title="${tooltipText}">$1</span>`,
    );
  });

  return highlightedText;
};

// Notes management
const updateWordCount = () => {
  const text = photoNotes.value.trim();
  if (!text) {
    wordCount.value = 0;
    return;
  }
  // Count words by splitting on whitespace and filtering empty strings
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  wordCount.value = words.length;
};

const saveNotes = async () => {
  // Check word limit before saving
  if (wordCount.value > 50) {
    message.warning("Please reduce your notes to 50 words or less");
    return;
  }

  isSavingNotes.value = true;

  try {
    // Here you would typically save to backend
    await api.post(`/api/catalog/${props.selectedPhoto.id}/note`, {
      note: photoNotes.value,
    });

    message.success("Notes saved successfully!");
  } catch (error) {
    console.error("Save notes failed:", error);
  } finally {
    isSavingNotes.value = false;
  }
};

// Cicla el flag de curación de la foto abierta (null → picked → rejected → null).
// Actualiza la copia abierta en el diálogo y persiste/propaga vía el store (grid).
const handleCycleFlag = () => {
  const photo = props.selectedPhoto;
  if (!photo?.id) return;
  const order = [null, "picked", "rejected"];
  const idx = order.indexOf(photo.flag ?? null);
  const nextFlag = order[(idx + 1) % order.length];
  photo.flag = nextFlag;
  photosStore.setPhotoFlag(photo.id, nextFlag);
};

// ─── Action Bar Handlers ───────────────────────────────────────────

const handleDeletePhoto = () => {
  showDeleteConfirm.value = true;
};

const confirmDeletePhoto = async () => {
  if (!props.selectedPhoto?.id) return;
  isDeletingPhoto.value = true;
  try {
    await photosStore.deletePhotos([props.selectedPhoto.id]);
    showDeleteConfirm.value = false;
    visible.value = false;
    message.success("Photo deleted");
  } catch (error) {
    console.error("Delete photo failed:", error);
    message.error("Failed to delete photo");
  } finally {
    isDeletingPhoto.value = false;
  }
};

const handleAddToCollection = () => {
  showCollectionModal.value = true;
};

const handleCollectionAdded = () => {
  showCollectionModal.value = false;
};

const handleMoveToTool = () => {
  openToolSelector();
};

const handleToolSelected = async (toolId, canvasId = null) => {
  if (!props.selectedPhoto?.id) return;
  visible.value = false;
  await takeToTool(toolId, [props.selectedPhoto.id], () => {}, canvasId);
  closeToolSelector();
};

const handleSendToChat = async () => {
  if (!props.selectedPhoto?.id) return;
  visible.value = false;
  await takeToChat([props.selectedPhoto.id], () => {});
};

const handleNavigateToPhoto = async (photo) => {
  logActivity("ui_action", {
    action: "photo_info_navigate_related",
    fromPhotoId: props.selectedPhoto?.id,
    toPhotoId: photo.id,
  });
  const fullPhoto = await photosStore.fetchPhoto(photo.id);
  if (fullPhoto) {
    emit("change-photo", fullPhoto);
    // Scroll dialog content to top after photo change
    nextTick(() => {
      const scrollable =
        document.querySelector(".dialog-content") ||
        document.querySelector(".n-drawer-body-content-wrapper");
      if (scrollable) scrollable.scrollTop = 0;
    });
  }
};

// Handle ResizeObserver errors gracefully
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    if (e.message && e.message.includes("ResizeObserver loop limit exceeded")) {
      e.stopImmediatePropagation();
    }
  });
}
</script>

<style scoped>
/* Fullscreen Photo Modal Styles */
.fullscreen-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: pointer;
  padding: 40px;
  box-sizing: border-box;
}

.fullscreen-content {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

.fullscreen-photo {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: center;
  border-radius: var(--radius-md);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.fullscreen-loading-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  pointer-events: none;
}

.close-fullscreen-btn {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.15) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
  color: white !important;
  transition: all 0.3s ease;
  z-index: 10001;
  width: 44px;
  height: 44px;
}

.close-fullscreen-btn:hover {
  background: rgba(255, 255, 255, 0.25) !important;
  border-color: rgba(255, 255, 255, 0.5) !important;
  transform: scale(1.1);
}

/* Responsive adjustments for fullscreen */
@media (max-width: 768px) {
  .fullscreen-container {
    padding: 20px;
  }

  .close-fullscreen-btn {
    top: 15px;
    right: 15px;
    width: 40px;
    height: 40px;
  }
}

@media (max-height: 600px) {
  .fullscreen-container {
    padding: 20px;
  }
}

/* Navigation Arrows */
.nav-arrow {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10001;
  background: rgba(0, 0, 0, 0.6) !important;
  backdrop-filter: blur(8px);
  border: 2px solid rgba(255, 255, 255, 0.2) !important;
  width: 56px;
  height: 56px;
  transition: all 0.3s ease;
  opacity: 0.7;
  color: white !important;
}

.nav-arrow:hover:not(:disabled) {
  opacity: 1;
  background: rgba(0, 0, 0, 0.8) !important;
  border-color: rgba(255, 255, 255, 0.4) !important;
  transform: translateY(-50%) scale(1.1);
}

.nav-arrow:active:not(:disabled) {
  transform: translateY(-50%) scale(0.95);
}

.nav-arrow:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-arrow-left {
  left: 24px;
}

.nav-arrow-right {
  right: 24px;
}

/* Photo Counter */
.photo-counter {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  color: white;
  padding: 10px 20px;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 10001;
  user-select: none;
  -webkit-user-select: none;
  letter-spacing: 0.5px;
}

/* Responsive for navigation arrows */
@media (max-width: 768px) {
  .nav-arrow {
    width: 48px;
    height: 48px;
  }

  .nav-arrow-left {
    left: 12px;
  }

  .nav-arrow-right {
    right: 12px;
  }

  .photo-counter {
    bottom: 20px;
    font-size: 12px;
    padding: 8px 16px;
  }
}

@media (max-height: 600px) {
  .nav-arrow {
    width: 44px;
    height: 44px;
  }

  .photo-counter {
    bottom: 16px;
  }
}

/* Override modal styles for fullscreen */
:deep(.n-modal-mask) {
  background-color: transparent !important;
}

:deep(.n-modal-container) {
  background: transparent !important;
}
</style>
