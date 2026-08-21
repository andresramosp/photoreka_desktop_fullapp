<template>
  <div class="patterns-section">
    <!-- Header row with mode selector -->
    <div class="section-header-row">
      <div class="section-label section-label--inline">
        Photographic Patterns
      </div>
      <ModePopoverSelector
        v-model="patternsMode"
        :accent="false"
        :singleMode="true"
        icon="settings"
        :width="200"
        :options="patternsModeOptions"
        header="Pattern Type"
        placement="bottom-end"
        aria-label="Change pattern type"
        class="patterns-mode-selector"
      />
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="ps-mini-loading">
      <div class="ps-mini-spinner" />
      <span>Loading patterns…</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="activePatterns.length === 0" class="panel-empty-state">
      <n-icon size="28" color="var(--text-tertiary)">
        <BookIcon />
      </n-icon>
      <p>No {{ activeModeLabel }} patterns yet</p>
    </div>

    <!-- Pattern cards list -->
    <div v-else class="ps-cards-list">
      <div
        v-for="pattern in activePatterns"
        :key="pattern.id"
        class="ps-pattern-card"
        role="button"
        tabindex="0"
        :aria-label="`Open ${pattern.title} in ${activeModeLabel.toLowerCase()} analytics report`"
        @click="navigateToReportSection(patternsMode)"
        @keydown.enter.prevent="navigateToReportSection(patternsMode)"
        @keydown.space.prevent="navigateToReportSection(patternsMode)"
      >
        <!-- Card header -->
        <div class="ps-card-header">
          <h4 class="ps-card-title">{{ pattern.title }}</h4>
          <span class="ps-strength-badge" :class="pattern.strength">
            <n-icon :size="11" :component="getStrengthIcon(pattern.strength)" />
            {{ getStrengthLabel(pattern.strength) }}
          </span>
        </div>

        <!-- Description -->
        <p class="ps-card-description">{{ pattern.description }}</p>

        <!-- Example photos -->
        <div v-if="pattern.examples?.length" class="ps-photos-grid">
          <template v-for="photo in pattern.examples" :key="photo.id">
            <img
              :src="photo.url"
              style="display: none"
              aria-hidden="true"
              @error="markPhotoBroken(photo.id)"
            />
            <PhotoCardHub
              :photo="{
                id: photo.id,
                url: photo.url,
                thumbnailUrl: photo.url,
                name: 'Example Photo',
                status: 'processed',
                isCheckingDuplicates: false,
              }"
              :selected="false"
              :selectable="false"
              :hide-info="true"
              :show-footer="false"
              :show-delete="false"
              :show-name="false"
              :is-uploading="false"
              :show-duplicate="false"
              :show-flag="false"
            />
          </template>
        </div>

        <!-- Footer action -->
        <!-- <div class="ps-card-footer">
          <n-button
            type="primary"
            size="tiny"
            secondary
            @click.stop="openCollectionModal(pattern)"
          >
            <template #icon>
              <n-icon size="11"><BookmarksOutline /></n-icon>
            </template>
            Save as Collection
          </n-button>
        </div> -->
      </div>
    </div>

    <!-- Create Collection Dialog -->
    <n-modal
      v-model:show="showCreateCollectionDialog"
      preset="dialog"
      title="Create Collection from Pattern"
      positive-text="Create Collection"
      negative-text="Cancel"
      @positive-click="createCollectionFromPattern"
      @negative-click="showCreateCollectionDialog = false"
    >
      <div class="ps-create-form">
        <n-form
          ref="formRef"
          :model="collectionFormData"
          :rules="collectionFormRules"
        >
          <n-form-item label="Name" path="title">
            <n-input
              v-model:value="collectionFormData.title"
              placeholder="Enter collection name..."
              maxlength="100"
              show-count
            />
          </n-form-item>
          <n-form-item label="Description" path="description">
            <n-input
              v-model:value="collectionFormData.description"
              type="textarea"
              placeholder="Add a description (optional)..."
              :rows="3"
              maxlength="500"
              show-count
            />
          </n-form-item>
        </n-form>
        <p class="ps-photo-count">
          {{ collectionPhotoIds.length }} photo{{
            collectionPhotoIds.length === 1 ? "" : "s"
          }}
          will be added
        </p>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, watch, h } from "vue";
import {
  NIcon,
  NButton,
  NModal,
  NForm,
  NFormItem,
  NInput,
  useMessage,
  useNotification,
} from "naive-ui";
import { useUserStore } from "@/stores/userStore";
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useRouter } from "vue-router";
import ModePopoverSelector from "@/components/ModePopoverSelector.vue";
import PhotoCardHub from "@/components/photoCards/PhotoCardHub.vue";
import theme from "@/config/theme.js";

import {
  BookOutline as BookIcon,
  Star as StarIcon,
  EllipseOutline as EllipseIcon,
  TrendingUpOutline as TrendingUpIcon,
  BookmarksOutline,
} from "@vicons/ionicons5";

defineOptions({ name: "PatternsSection" });

const { colors } = theme;

const PATTERNS_MODE_KEY = "photoreka:dashboard:patterns:mode";

const savedMode =
  typeof window !== "undefined"
    ? window.localStorage.getItem(PATTERNS_MODE_KEY)
    : null;

const validModes = ["general", "story", "context"];
const patternsMode = ref(
  validModes.includes(savedMode) ? savedMode : "general",
);

const patternsModeOptions = [
  { label: "Overall", value: "general" },
  { label: "Narrative", value: "story" },
  { label: "Contextual", value: "context" },
];

const activeModeLabel = computed(
  () =>
    patternsModeOptions.find((o) => o.value === patternsMode.value)?.label ??
    "Overall",
);

watch(patternsMode, (mode) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PATTERNS_MODE_KEY, mode);
  }
});

// ── Stores ─────────────────────────────────────────────────────────────────
const userStore = useUserStore();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const message = useMessage();
const notification = useNotification();
const router = useRouter();

// ── Patterns data ───────────────────────────────────────────────────────────
const rawPatternSections = ref([]);
const isLoading = ref(false);
const brokenPhotoIds = ref(new Set());

const markPhotoBroken = (photoId) => {
  brokenPhotoIds.value = new Set([...brokenPhotoIds.value, photoId]);
};

const sectionConfig = {
  story: {
    title: "Narrative Patterns",
    color: colors.blue[600],
  },
  context: {
    title: "Contextual Patterns",
    color: colors.purple[600],
  },
  general: {
    title: "Overall Patterns",
    color: colors.orange ? colors.orange[600] : "#fb923c",
  },
};

const catalogPatterns = computed(
  () =>
    userStore.user?.catalogPatternsResult ||
    userStore.user?.catalog_patterns ||
    null,
);

const loadPatternsData = () => {
  const patterns = catalogPatterns.value;
  if (!patterns) {
    rawPatternSections.value = [];
    return;
  }

  const sections = [];
  Object.keys(patterns).forEach((key) => {
    const categoryPatterns = patterns[key];
    if (Array.isArray(categoryPatterns) && categoryPatterns.length > 0) {
      const config = sectionConfig[key] || {
        title: key.charAt(0).toUpperCase() + key.slice(1) + " Patterns",
        color: colors.blue[600],
      };
      sections.push({
        key,
        title: config.title,
        color: config.color,
        patterns: categoryPatterns.map((pattern) => ({
          id: pattern.patternId,
          title: pattern.title,
          percentage: Math.round(pattern.percentage * 100) / 100,
          description: pattern.description,
          photoCount: pattern.photoCount,
          strength: pattern.strength,
          samplePhotos: pattern.samplePhotos || [],
          clusterPhotos: pattern.clusterPhotos || [],
        })),
      });
    }
  });
  rawPatternSections.value = sections;
};

watch(
  catalogPatterns,
  (val) => {
    if (val) loadPatternsData();
  },
  {
    immediate: true,
  },
);

// Resolve live photos and filter broken ones
const resolvedSections = computed(() => {
  const livePhotosById = new Map(photosStore.photos.map((p) => [p.id, p]));
  const broken = brokenPhotoIds.value;

  return rawPatternSections.value.map((section) => ({
    ...section,
    patterns: section.patterns.map((pattern) => {
      const examples = pattern.samplePhotos
        .filter((p) => livePhotosById.has(p.id) && !broken.has(p.id))
        .map((p) => ({ id: p.id, url: p.thumbnailUrl }));

      if (examples.length < 4) {
        const usedIds = new Set(pattern.samplePhotos.map((p) => p.id));
        for (const clusterId of pattern.clusterPhotos) {
          if (examples.length >= 4) break;
          if (usedIds.has(clusterId) || broken.has(clusterId)) continue;
          const livePhoto = livePhotosById.get(clusterId);
          if (livePhoto) {
            examples.push({ id: livePhoto.id, url: livePhoto.thumbnailUrl });
            usedIds.add(clusterId);
          }
        }
      }
      return { ...pattern, examples: examples.slice(0, 4) };
    }),
  }));
});

// Active patterns filtered by selected mode
const activePatterns = computed(() => {
  const section = resolvedSections.value.find(
    (s) => s.key === patternsMode.value,
  );
  return section?.patterns ?? [];
});

// ── Strength helpers ────────────────────────────────────────────────────────
const getStrengthLabel = (strength) =>
  ({ strong: "Strong", moderate: "Moderate", weak: "Emerging" })[strength] ??
  strength;

const getStrengthIcon = (strength) =>
  ({ strong: StarIcon, moderate: EllipseIcon, weak: TrendingUpIcon })[
    strength
  ] ?? null;

const navigateToReportSection = (patternType) => {
  router.push({
    name: "report",
    hash: "#patterns",
    query: { patternType },
  });
};

// ── Create collection dialog ────────────────────────────────────────────────
const showCreateCollectionDialog = ref(false);
const collectionPhotoIds = ref([]);
const formRef = ref(null);
const collectionFormData = ref({ title: "", description: "" });
const collectionFormRules = {
  title: { required: true, message: "Please enter a name", trigger: "blur" },
};

const openCollectionModal = (pattern) => {
  const photoIds = pattern.clusterPhotos || [];
  if (photoIds.length === 0) {
    message.warning("No photos associated with this pattern");
    return;
  }
  collectionPhotoIds.value = photoIds;
  collectionFormData.value = {
    title: pattern.title || "",
    description: pattern.description || "",
  };
  showCreateCollectionDialog.value = true;
};

const createCollectionFromPattern = async () => {
  try {
    await formRef.value?.validate();
    const newCollection = await collectionsStore.createCollection({
      title: collectionFormData.value.title,
      description: collectionFormData.value.description,
      photoIds: collectionPhotoIds.value,
    });

    notification.success({
      title: "Collection created",
      content: `"${collectionFormData.value.title}" created with ${collectionPhotoIds.value.length} photo${collectionPhotoIds.value.length === 1 ? "" : "s"}`,
      action: () =>
        h(
          "button",
          {
            style: {
              color: "var(--accent-color)",
              fontWeight: "600",
              padding: "6px 12px",
              background: "rgba(139, 92, 246, 0.1)",
              borderRadius: "6px",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              cursor: "pointer",
            },
            onClick: () => router.push(`/collections/${newCollection.id}`),
          },
          "View collection",
        ),
      duration: 5000,
    });

    showCreateCollectionDialog.value = false;
    collectionPhotoIds.value = [];
    collectionFormData.value = { title: "", description: "" };
  } catch {
    // validation or network error
  }
};
</script>

<style scoped>
/* ── Section layout ───────────────────────────────────────────────────── */
.patterns-section {
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  gap: var(--dashboard-label-gap, 8px);
  min-height: 0;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.section-label--inline {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin: 0;
}

.patterns-mode-selector {
  flex-shrink: 0;
}

/* ── Loading ───────────────────────────────────────────────────────────── */
.ps-mini-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.ps-mini-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: ps-spin 0.9s linear infinite;
  flex-shrink: 0;
}

@keyframes ps-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Empty state lives in global.scss (.panel-empty-state), shared with the
   dashboard's other panel placeholders so they line up. */

/* ── Cards list ────────────────────────────────────────────────────────── */
.ps-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Pattern card ──────────────────────────────────────────────────────── */
.ps-pattern-card {
  background-color: var(--bg-card, var(--bg-container));
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.ps-pattern-card:hover,
.ps-pattern-card:focus-visible {
  border-color: var(--primary-color);
  box-shadow: 0 2px 12px
    color-mix(in srgb, var(--primary-color) 12%, transparent);
}

.ps-pattern-card:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  outline-offset: 2px;
}

/* ── Card header ───────────────────────────────────────────────────────── */
.ps-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.ps-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
}

/* ── Strength badge ────────────────────────────────────────────────────── */
.ps-strength-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  flex-shrink: 0;
  white-space: nowrap;
}

.ps-strength-badge.strong {
  background-color: var(--accent-color-light, rgba(16, 185, 129, 0.12));
  color: var(--accent-color);
}

.ps-strength-badge.moderate {
  background-color: var(--primary-color-light, rgba(99, 102, 241, 0.12));
  color: var(--primary-color);
}

.ps-strength-badge.weak {
  background-color: var(--warning-color-light, rgba(245, 158, 11, 0.12));
  color: var(--warning-color, #f59e0b);
}

/* ── Description ───────────────────────────────────────────────────────── */
.ps-card-description {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.55;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Photos grid — 4 columns, smaller than original ───────────────────── */
.ps-photos-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
}

/* Shrink PhotoCardHub thumbnails inside this context */
.ps-photos-grid :deep(.photo-card),
.ps-photos-grid :deep(.photo-card-hub) {
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  overflow: hidden;
}

.ps-photos-grid :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ── Footer ────────────────────────────────────────────────────────────── */
.ps-card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-top: 4px;
  border-top: 1px solid var(--border-color);
}

/* ── Create form ───────────────────────────────────────────────────────── */
.ps-create-form {
  padding-top: 16px;
}

.ps-photo-count {
  color: var(--text-secondary);
  font-size: 12px;
  margin: 8px 0 0 0;
}

/* ── Responsive ────────────────────────────────────────────────────────── */
@media (max-width: 680px) {
  .ps-cards-list {
    gap: 8px;
  }

  .ps-pattern-card {
    padding: 10px;
  }

  .ps-card-title {
    font-size: 12px;
  }

  .ps-card-description {
    -webkit-line-clamp: 4;
  }
}
</style>
