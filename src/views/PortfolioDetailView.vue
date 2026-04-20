<template>
  <div class="portfolio-detail-view view-container">
    <!-- Header -->
    <div class="detail-header">
      <div class="detail-header-content">
        <div class="detail-header-actions">
          <n-button text @click="goBack" class="detail-back-button">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
                  />
                </svg>
              </n-icon>
            </template>
            Back to Portfolios
          </n-button>

          <div class="header-actions-buttons" v-if="build">
            <n-button
              :type="hasChanges ? 'primary' : 'default'"
              ghost
              :disabled="!hasChanges || isSaving"
              :loading="isSaving"
              @click="saveLayout"
            >
              <template #icon>
                <n-icon><SaveOutline /></n-icon>
              </template>
              Save Layout
            </n-button>
          </div>
        </div>

        <div v-if="build">
          <h1 class="detail-title">Portfolio #{{ build.id }}</h1>
          <p class="detail-meta">
            {{ photos.length }} photos · {{ coherenceLabel }} ·
            {{ formatDate(build.createdAt) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="loading-state">
      <n-spin :size="32" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <n-button @click="goBack">Go back</n-button>
    </div>

    <!-- Not completed state -->
    <div
      v-else-if="build && build.status !== 'completed'"
      class="pending-state"
    >
      <n-icon :size="48" color="var(--warning-color)">
        <HourglassOutline />
      </n-icon>
      <h3>Build In Progress</h3>
      <p>
        This portfolio is still being generated ({{ build.status }}). Check back
        soon.
      </p>
      <n-button @click="goBack">Go back</n-button>
    </div>

    <!-- Grid content -->
    <template v-else-if="build && photos.length > 0">
      <PortfolioGridToolbar
        v-model:columns="columns"
        v-model:gap="gap"
        :photo-count="photos.length"
        :removed-count="removedPhotos.length"
        @undo-last="undoLastRemoval"
        @restore-all="restoreAll"
      />

      <PortfolioGrid
        v-model:photos="photos"
        :columns="columns"
        :gap="gap"
        @remove="handleRemovePhoto"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NIcon, NSpin, NButton, useMessage } from "naive-ui";
import { SaveOutline, HourglassOutline } from "@vicons/ionicons5";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";
import PortfolioGrid from "@/components/portfolio-builder/PortfolioGrid.vue";
import PortfolioGridToolbar from "@/components/portfolio-builder/PortfolioGridToolbar.vue";

defineOptions({ name: "PortfolioDetailView" });

const route = useRoute();
const router = useRouter();
const message = useMessage();
const store = usePortfolioBuildsStore();

const build = ref(null);
const photos = ref([]);
const removedPhotos = ref([]);
const originalPhotoIds = ref([]);
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref(null);
const columns = ref(5);
const gap = ref(3);

const COHERENCE_LABELS = {
  free: "Free Selection",
  visual: "Visual Coherence",
  chromatic: "Chromatic Coherence",
  narrative: "Narrative Coherence",
  heterogeneous: "Diverse",
};

const coherenceLabel = computed(() => {
  if (!build.value?.config?.coherenceMode) return "";
  return (
    COHERENCE_LABELS[build.value.config.coherenceMode] ||
    build.value.config.coherenceMode
  );
});

const hasChanges = computed(() => {
  if (!originalPhotoIds.value.length) return false;
  const currentIds = photos.value.map((p) => p.id);
  if (currentIds.length !== originalPhotoIds.value.length) return true;
  return currentIds.some((id, i) => id !== originalPhotoIds.value[i]);
});

onMounted(async () => {
  try {
    const buildId = Number(route.params.id);
    if (!buildId) {
      error.value = "Invalid build ID.";
      return;
    }

    const data = await store.getBuildStatus(buildId);
    build.value = data;

    if (data.status === "completed" && data.result?.photoItems?.length) {
      photos.value = data.result.photoItems.map((p) => ({ ...p }));
      originalPhotoIds.value = photos.value.map((p) => p.id);
      autoSelectColumns(photos.value.length);
    }
  } catch (err) {
    console.error("[PortfolioDetailView] load error:", err);
    error.value = "Failed to load portfolio build.";
  } finally {
    isLoading.value = false;
  }
});

function autoSelectColumns(count) {
  if (count <= 9) columns.value = 3;
  else if (count <= 16) columns.value = 4;
  else if (count <= 30) columns.value = 5;
  else columns.value = 6;
}

function handleRemovePhoto(photo) {
  const idx = photos.value.findIndex((p) => p.id === photo.id);
  if (idx === -1) return;
  removedPhotos.value.push({ photo, index: idx });
  photos.value.splice(idx, 1);
}

function undoLastRemoval() {
  if (!removedPhotos.value.length) return;
  const last = removedPhotos.value.pop();
  const insertAt = Math.min(last.index, photos.value.length);
  photos.value.splice(insertAt, 0, last.photo);
}

function restoreAll() {
  // Restore in reverse order to preserve original indices
  const toRestore = [...removedPhotos.value].reverse();
  for (const item of toRestore) {
    const insertAt = Math.min(item.index, photos.value.length);
    photos.value.splice(insertAt, 0, item.photo);
  }
  removedPhotos.value = [];
}

async function saveLayout() {
  isSaving.value = true;
  try {
    const photoIds = photos.value.map((p) => p.id);
    await store.saveLayout(build.value.id, photoIds);
    originalPhotoIds.value = [...photoIds];
    removedPhotos.value = [];
    message.success("Layout saved");
  } catch (err) {
    console.error("[PortfolioDetailView] save error:", err);
    message.error("Failed to save layout");
  } finally {
    isSaving.value = false;
  }
}

function goBack() {
  router.push({ name: "portfolios" });
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
</script>

<style scoped>
.portfolio-detail-view {
  padding: var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
}

.loading-state,
.error-state,
.pending-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  gap: 16px;
  color: var(--text-secondary);
  text-align: center;
}

.pending-state h3 {
  margin: 0;
  color: var(--text-primary);
}

.pending-state p {
  margin: 0;
  max-width: 400px;
}

@media (max-width: 768px) {
  .portfolio-detail-view {
    padding: var(--spacing-lg);
  }
}
</style>
