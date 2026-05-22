<template>
  <n-modal
    v-model:show="showModal"
    :mask-closable="true"
    :close-on-esc="true"
    @update:show="handleClose"
  >
    <div class="summary-modal-container">
      <!-- Confetti overlay -->
      <ConfettiEffect
        v-if="!isMobile"
        :show="showConfettiEffect"
        @hide="showConfettiEffect = false"
        :duration="3000"
        :colors="[
          'var(--accent-color)',
          '#06b6d4',
          '#10b981',
          '#f59e0b',
          '#ef4444',
          '#f43f5e',
        ]"
        :count="80"
      />

      <!-- Close button -->
      <v-button v-if="isMobile" class="modal-close-btn" @click="handleClose">
        <n-icon size="20">
          <DismissRegular />
        </n-icon>
      </v-button>

      <!-- Header Section -->
      <div class="summary-header">
        <div class="header-title-wrapper">
          <n-icon size="32" color="var(--success-color)">
            <CheckmarkCircleOutline />
          </n-icon>
          <h2 class="header-title">
            Analysis of {{ totalPhotos }} Photo{{
              totalPhotos !== 1 ? "s" : ""
            }}
            Complete!
          </h2>
        </div>
        <!-- <p class="header-subtitle">
          {{ totalPhotos }} photo{{ totalPhotos !== 1 ? "s" : "" }} analyzed
        </p> -->

        <!-- Genre Breakdown -->
        <div class="genre-breakdown">
          <span
            v-for="(genre, index) in genreBreakdown"
            :key="index"
            class="genre-badge"
          >
            {{ genre.count }} {{ genre.name }}
          </span>
        </div>
      </div>

      <!-- Top Photos Section -->
      <div class="top-photos-section">
        <h3 class="section-title">
          <n-icon size="18" color="var(--warning-color)">
            <Trophy20Regular />
          </n-icon>
          Top Highlights
        </h3>
        <div class="top-photos-grid">
          <div
            v-for="highlight in topPhotos"
            :key="highlight.photo.id"
            class="highlight-card"
            :class="{ 'record-card': breaksRecord(highlight.photo) }"
          >
            <div class="photo-wrapper">
              <PhotoCardHub
                :photo="highlight.photo"
                :show-delete="false"
                :show-name="false"
                :show-footer="false"
                :showDuplicate="false"
                :is-uploading="false"
                :show-info-button="true"
                @info="handleShowPhotoInfo"
              />
            </div>
            <div
              class="highlight-badge"
              :class="{ 'record-badge': breaksRecord(highlight.photo) }"
            >
              <n-icon size="14" class="badge-icon">
                <component :is="highlight.icon" />
              </n-icon>
              <span class="badge-text">{{ highlight.label }}</span>
              <n-icon
                v-if="breaksRecord(highlight.photo)"
                size="16"
                class="record-icon"
              >
                <Trophy20Regular />
              </n-icon>
              <span v-if="breaksRecord(highlight.photo)" class="badge-tooltip">
                New Record! Score: {{ calculateMaxScore(highlight.photo) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="summary-footer">
        <n-button
          type="primary"
          size="large"
          class="explore-btn"
          @click="handleExplorePhotos"
        >
          Explore Your Photos
        </n-button>
        <n-button
          secondary
          type="info"
          size="large"
          class="chatlab-btn"
          @click="handleAskChatlab"
        >
          <template #icon>
            <n-icon><RobotOutlined /></n-icon>
          </template>
          Ask Chatlab
        </n-button>
      </div>
    </div>
  </n-modal>

  <!-- Photo Info Dialog -->
  <PhotoInfoDialog
    v-model="showPhotoInfoDialog"
    :selected-photo="selectedPhotoForInfo"
    @change-photo="selectedPhotoForInfo = $event"
  />
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { NModal, NIcon, NButton } from "naive-ui";
import {
  CheckmarkCircleOutline,
  CloseOutline as DismissRegular,
} from "@vicons/ionicons5";
import { RobotOutlined } from "@vicons/antd";

import { Trophy20Regular } from "@vicons/fluent";
import PhotoCardHub from "../photoCards/PhotoCardHub.vue";
import ConfettiEffect from "../ConfettiEffect.vue";
import PhotoInfoDialog from "../PhotoInfoDialog.vue";
import { useArtisticScores } from "@/composables/useArtisticScores";
import { useUserStore } from "@/stores/userStore";
import { getArtisticSchema, getProfileVariant } from "@/config/photo_schema";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { usePhotosStore } from "@/stores/photos";

const { isMobile } = useIsMobile();

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  job: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["close"]);
const { artisticScores, getCriterionIcon } = useArtisticScores({
  profile: () => useUserStore().user?.profiles,
});
const router = useRouter();
const photosStore = usePhotosStore();

const showModal = ref(false);
const showConfettiEffect = ref(false);
const showPhotoInfoDialog = ref(false);
const selectedPhotoForInfo = ref(null);

// Ensure store is loaded
watch(
  () => props.show,
  async (val) => {
    if (val && !photosStore.isInitialized) {
      await photosStore.getOrFetch();
    }
  },
  { immediate: true },
);

watch(
  () => props.show,
  (val) => {
    showModal.value = val;
    if (val) {
      showConfettiEffect.value = true;
    }
  },
  { immediate: true },
);

function handleClose() {
  showModal.value = false;
  showConfettiEffect.value = false;
  selectedPhotoForInfo.value = null;
  showPhotoInfoDialog.value = false;
  emit("close");
}

function handleExplorePhotos() {
  handleClose();
  router.push("/workspace");
}

async function handleAskChatlab() {
  const photos = topPhotos.value.map((h) => ({
    id: String(h.photo.id),
    title: h.photo.name || h.photo.originalFileName || String(h.photo.id),
    name: h.photo.name || h.photo.originalFileName || String(h.photo.id),
    url: h.photo.url || h.photo.thumbnailUrl || "",
    thumbnailUrl: h.photo.thumbnailUrl || h.photo.url || "",
    rating: 0,
    isUploading: false,
    file: null,
    needProcess: false,
    isDuplicate: false,
    originalFileName: h.photo.originalFileName || h.photo.name || "",
    isCheckingDuplicates: false,
    status: h.photo.status || "processed",
  }));

  sessionStorage.setItem("chat_context_photos", JSON.stringify(photos));
  sessionStorage.setItem(
    "chat_pending_message",
    "I just added these photos to my catalog. What do you suggest I do with them? Please give me actionable, specific tips based on their characteristics to integrate into my catalog.",
  );

  // Cierra el modal completamente
  handleClose();

  // Espera a que el cierre se procese antes de navegar
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // Navega al chat
  router.push("/chat-lab");
}

async function handleShowPhotoInfo(photo) {
  console.log(
    "[ProcessingSummaryModal] handleShowPhotoInfo called with photo:",
    photo,
  );

  try {
    // Fetch full photo data from API
    const fullPhoto = await photosStore.fetchPhoto(photo.id);
    console.log(
      "[ProcessingSummaryModal] Full photo fetched from API:",
      fullPhoto,
    );

    if (fullPhoto) {
      selectedPhotoForInfo.value = fullPhoto;
      showPhotoInfoDialog.value = true;
    } else {
      console.error("[ProcessingSummaryModal] Photo not found:", photo.id);
    }
  } catch (error) {
    console.error("[ProcessingSummaryModal] Error fetching photo:", error);
  }
}

// --- Computed: stats from real data only ---
const allPhotos = computed(() => {
  if (props.job && props.job.photos && props.job.photos.length > 0) {
    // Extract photo IDs from job
    const jobPhotoIds = props.job.photos.map((p) => p.id);

    // Get full photo data from store
    const fullPhotos = photosStore.processedPhotos.filter((photo) =>
      jobPhotoIds.includes(photo.id),
    );

    // If we found photos in the store, use them; otherwise fallback to job preview
    if (fullPhotos.length > 0) {
      return fullPhotos;
    }

    // Fallback to job preview if store doesn't have them yet
    return props.job.photos;
  }

  return [];
});
const totalPhotos = computed(() => allPhotos.value.length);

const genreBreakdown = computed(() => {
  const counts = {};
  allPhotos.value.forEach((p) => {
    const genre = p.descriptions?.visual_aspects?.genre?.[0] || "unknown";
    counts[genre] = (counts[genre] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.map(([genre, count]) => ({
    name: capitalize(genre),
    count,
  }));
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- Derive fundamental criterion keys from the user's variant schema ---
const FUNDAMENTAL_CRITERIA_KEYS =
  getArtisticSchema(getProfileVariant(useUserStore().user?.profiles))
    .find((g) => g.key === "fundamentals")
    ?.criteria.map((c) => c.key) ?? [];

// --- Calculate maximum individual score for a photo (highest fundamental) ---
function calculateMaxScore(photo) {
  const scores = photo.descriptions?.artistic_scores;
  if (!scores) return 0;

  // Return the highest individual fundamental score
  return Math.max(
    0,
    ...FUNDAMENTAL_CRITERIA_KEYS.map((key) => scores[key] || 0),
  );
}

// --- Get maximum individual score from user's catalog ---
const catalogMaxScore = computed(() => {
  const processedPhotos = photosStore.processedPhotos || [];
  console.log(
    "🔍 [RECORD DEBUG] Catalog processed photos count:",
    processedPhotos.length,
  );

  if (processedPhotos.length === 0) {
    console.log("⚠️ [RECORD DEBUG] Catalog is empty, returning 0");
    return 0;
  }

  let maxScore = 0;
  let maxPhoto = null;

  processedPhotos.forEach((photo) => {
    const photoMaxScore = calculateMaxScore(photo);
    if (photoMaxScore > maxScore) {
      maxScore = photoMaxScore;
      maxPhoto = photo;
    }
  });

  console.log("📊 [RECORD DEBUG] Catalog maximum individual score:", maxScore);
  if (maxPhoto) {
    console.log(
      "🏆 [RECORD DEBUG] Photo with max score:",
      maxPhoto.name || maxPhoto.id,
    );
    console.log("   - Scores:", maxPhoto.descriptions?.artistic_scores);
  }

  return maxScore;
});

// --- Check if a photo breaks the catalog record ---
function breaksRecord(photo) {
  const photoMaxScore = calculateMaxScore(photo);
  const catalogMax = catalogMaxScore.value;

  const isRecord = photoMaxScore > catalogMax;

  // Log for debugging
  if (photoMaxScore >= 9) {
    console.log(`🎯 [RECORD DEBUG] Photo "${photo.name || photo.id}"`);
    console.log(`   - Photo max score: ${photoMaxScore}`);
    console.log(`   - Catalog max: ${catalogMax}`);
    console.log(`   - Is record: ${isRecord}`);
    console.log(`   - Scores:`, photo.descriptions?.artistic_scores);
  }

  return isRecord;
}

// --- Fundamental artistic scores highlight labels ---
// Variant-aware: derived from the active profile's `fundamentals` criteria.
// The map intentionally uses presentation-specific highlight strings (not
// the criterion's canonical UI label).
const FUNDAMENTAL_HIGHLIGHTS = {
  aesthetic_quality: "Great Aesthetic",
  composition: "Strong Composition",
  storytelling: "Compelling Story",
  strangeness: "Strikingly Original",
  commercial_intent: "Commercially Strong",
};
const fundamentalLabels = computed(() => {
  const out = {};
  for (const c of artisticScores.fundamentals.criteria) {
    out[c.value] = FUNDAMENTAL_HIGHLIGHTS[c.value] ?? c.label;
  }
  return out;
});

const fundamentalIcons = computed(() => {
  const icons = {};
  artisticScores.fundamentals.criteria.forEach((c) => {
    icons[c.value] = getCriterionIcon(c.value);
  });
  return icons;
});

// Select up to 5 photos with best fundamental scores, each highlighting a different criterion when possible
const topPhotos = computed(() => {
  const fundamentalKeys = Object.keys(fundamentalLabels.value);
  const candidates = [];

  // For each photo, collect ALL its fundamental scores (sorted by value)
  allPhotos.value.forEach((photo) => {
    const scores = photo.descriptions?.artistic_scores || {};

    // Get all fundamentals sorted by score
    const photoScores = fundamentalKeys
      .map((key) => ({
        key,
        score: scores[key] || 0,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (photoScores.length > 0) {
      candidates.push({
        photo,
        allScores: photoScores, // Keep all scores for flexible selection
        primaryCriterion: photoScores[0].key,
        primaryScore: photoScores[0].score,
      });
    }
  });

  // Add flag for record-breaking photos
  candidates.forEach((c) => {
    c.isRecord = breaksRecord(c.photo);
    c.maxScore = calculateMaxScore(c.photo);
  });

  // Sort by: record-breaking first, then by primary score descending
  candidates.sort((a, b) => {
    if (a.isRecord && !b.isRecord) return -1;
    if (!a.isRecord && b.isRecord) return 1;
    return b.primaryScore - a.primaryScore;
  });

  // Determine target count: 4 if total < 8, otherwise 8
  const targetCount = allPhotos.value.length < 8 ? 4 : 8;

  const selected = [];
  const criterionCount = {};

  // Helper to select the best available criterion for a photo
  const selectBestCriterion = (candidate) => {
    // First pass: check each score in descending order for ones with < 3 uses
    for (const scoreItem of candidate.allScores) {
      const count = criterionCount[scoreItem.key] || 0;

      // If this criterion appears less than 3 times, use it immediately
      if (count < 3) {
        return scoreItem;
      }
    }

    // Second pass: all criteria have 3+ uses, look for alternatives >= 7
    for (const scoreItem of candidate.allScores) {
      if (scoreItem.score >= 7) {
        return scoreItem;
      }
    }

    // Third pass: no alternatives >= 7 found, use the best score anyway (allow repetition)
    return candidate.allScores[0];
  };

  // Select photos with criterion diversity
  for (const candidate of candidates) {
    if (selected.length >= targetCount) break;

    // Skip if already selected
    if (selected.find((s) => s.photo.id === candidate.photo.id)) {
      continue;
    }

    const selectedScore = selectBestCriterion(candidate);

    // Update criterion count
    criterionCount[selectedScore.key] =
      (criterionCount[selectedScore.key] || 0) + 1;

    selected.push({
      photo: candidate.photo,
      criterion: selectedScore.key,
      score: selectedScore.score,
      label: fundamentalLabels.value[selectedScore.key],
      icon: fundamentalIcons.value[selectedScore.key],
      isRecord: candidate.isRecord,
      maxScore: candidate.maxScore,
    });
  }

  return selected;
});
</script>

<style scoped>
.summary-modal-container {
  position: relative;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg, 16px);
  width: 90vw;
  max-width: 880px;
  max-height: 90vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding-left: 32px;
  padding-right: 32px;
  padding-top: 24px;
  padding-bottom: 24px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  -webkit-overflow-scrolling: touch;
}

/* Close button */
.modal-close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  z-index: 10;
}

.modal-close-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-color-hover);
  background: var(--bg-surface-hover);
}

/* Header */
.summary-header {
  text-align: center;
  margin-bottom: 12px;
  padding-top: 8px;
}

.header-title-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.header-icon-wrapper {
  margin-bottom: 12px;
}

.header-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  margin-bottom: 12px;
}

.header-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
}

/* Genre Breakdown */
.genre-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  align-items: center;
}

.genre-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* Top Photos Section */
.top-photos-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 16px 0;
}

.top-photos-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.highlight-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Force GPU acceleration and separate compositing layer */
  will-change: transform;
  transform: translateZ(0);
}

.photo-wrapper {
  position: relative;
  border-radius: var(--radius-md, 12px);
  overflow: hidden;
  /* Reserve space for box-shadow to prevent reflow */
  box-shadow:
    0 0 0 3px transparent,
    0 0 20px transparent,
    0 0 40px transparent;
}

/* Allow buttons in action overlay to be clickable */
.photo-wrapper :deep(.action-buttons-overlay) {
  pointer-events: auto;
}

.photo-wrapper :deep(.info-button) {
  pointer-events: auto;
}

.record-card .photo-wrapper {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent-color) 30%, transparent),
    0 0 20px color-mix(in srgb, var(--accent-color) 40%, transparent),
    0 0 40px color-mix(in srgb, var(--accent-color) 20%, transparent);
}

.highlight-badge {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-surface);
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm, 8px);
  justify-content: center;
  cursor: pointer;
  box-shadow:
    0 0 12px transparent,
    0 0 24px transparent;
}

/* Pure CSS tooltip — respects app theme */
.badge-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  padding: 8px 12px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.badge-tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: var(--bg-container);
}

.highlight-badge:hover .badge-tooltip {
  opacity: 1;
}

.highlight-badge.record-badge {
  /* background: linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #ffd700 100%); */
  border-color: var(--accent-color);
  box-shadow:
    0 0 12px color-mix(in srgb, var(--accent-color) 40%, transparent),
    0 0 24px color-mix(in srgb, var(--accent-color) 20%, transparent);
}

.badge-icon {
  color: var(--warning-color);
  flex-shrink: 0;
}

.record-badge .badge-icon {
  color: var(--accent-color);
}

.badge-text {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.record-badge .badge-text {
  color: var(--accent-color);
  font-weight: 700;
}

.record-icon {
  color: var(--accent-color);
  flex-shrink: 0;
  margin-left: 2px;
}

/* Footer */
.summary-footer {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding-top: 4px;
  flex-wrap: wrap;
}

.explore-btn {
  min-width: 180px;
  font-weight: 600;
}

.chatlab-btn {
  font-weight: 600;
}

/* Responsive */
@media (max-width: 600px) {
  .summary-modal-container {
    padding: 20px 16px;
    width: 95vw;
    max-height: 100vh;
    overflow-y: auto;
  }

  .header-title {
    font-size: 20px;
  }

  .header-title-wrapper {
    gap: 8px;
    margin-bottom: 10px;
  }

  .header-subtitle {
    font-size: 13px;
  }

  .genre-breakdown {
    gap: 4px;
  }

  .genre-badge {
    font-size: 11px;
    padding: 3px 8px;
  }

  .top-photos-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .badge-text {
    font-size: 10px;
  }

  .section-title {
    font-size: 14px;
  }
}

/* Scrollbar styling */
.summary-modal-container::-webkit-scrollbar {
  width: 6px;
}
.summary-modal-container::-webkit-scrollbar-track {
  background: transparent;
}
.summary-modal-container::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}
</style>
