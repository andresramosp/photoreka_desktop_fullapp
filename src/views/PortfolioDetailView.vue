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

            <n-dropdown
              trigger="click"
              :options="exportOptions"
              @select="handleExportSelect"
            >
              <n-button
                :disabled="!photos.length || isExporting"
                :loading="isExporting"
              >
                <template #icon>
                  <n-icon><DownloadOutline /></n-icon>
                </template>
                {{ isExporting ? exportStatus : "Export" }}
              </n-button>
            </n-dropdown>
          </div>
        </div>

        <div v-if="build">
          <h1 class="detail-title">
            {{ build.config?.name || `Portfolio #${build.id}` }}
          </h1>
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
        @add-photos="showAddPhotosDialog = true"
      />

      <PortfolioGrid
        v-model:photos="photos"
        :columns="columns"
        :gap="gap"
        ref="gridRef"
        @remove="handleRemovePhoto"
        @info="handlePhotoInfo"
      />
    </template>

    <PortfolioAddPhotosDialog
      v-if="build"
      v-model="showAddPhotosDialog"
      :build="build"
      :current-photo-ids="currentPhotoIds"
      @add-photos="handleAddPhotos"
    />

    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
      @change-photo="selectedDialogPhoto = $event"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NIcon, NSpin, NButton, NDropdown, useMessage } from "naive-ui";
import {
  SaveOutline,
  HourglassOutline,
  DownloadOutline,
  DocumentTextOutline,
  ImageOutline,
} from "@vicons/ionicons5";
import { h } from "vue";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";
import { usePhotosStore } from "@/stores/photos";
import PortfolioGrid from "@/components/portfolio-builder/PortfolioGrid.vue";
import PortfolioGridToolbar from "@/components/portfolio-builder/PortfolioGridToolbar.vue";
import PortfolioAddPhotosDialog from "@/components/portfolio-builder/PortfolioAddPhotosDialog.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import {
  exportPortfolioToPdf,
  exportPortfolioToJpeg,
} from "@/utils/portfolioPdfExport";

defineOptions({ name: "PortfolioDetailView" });

const route = useRoute();
const router = useRouter();
const message = useMessage();
const store = usePortfolioBuildsStore();
const photosStore = usePhotosStore();

const build = ref(null);
const photos = ref([]);
const removedPhotos = ref([]);
const originalPhotoIds = ref([]);
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref(null);
const columns = ref(2);
const gap = ref(30);
const showAddPhotosDialog = ref(false);
const gridRef = ref(null);
const isExporting = ref(false);
const exportStatus = ref("Exporting…");
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref(null);

const exportOptions = [
  {
    label: "Export as PDF",
    key: "pdf",
    icon: () => h(NIcon, null, { default: () => h(DocumentTextOutline) }),
  },
  {
    label: "Export as JPEG",
    key: "jpeg",
    icon: () => h(NIcon, null, { default: () => h(ImageOutline) }),
  },
];

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

const currentPhotoIds = computed(() => photos.value.map((p) => p.id));

function handleAddPhotos(newPhotos) {
  if (!Array.isArray(newPhotos) || newPhotos.length === 0) return;
  const existing = new Set(photos.value.map((p) => p.id));
  const toAdd = newPhotos.filter((p) => p && p.id && !existing.has(p.id));
  if (toAdd.length === 0) return;
  photos.value.push(
    ...toAdd.map((p) => ({ id: p.id, thumbnailUrl: p.thumbnailUrl })),
  );
  message.success(
    `Added ${toAdd.length} ${toAdd.length === 1 ? "photo" : "photos"}`,
  );
}

async function loadBuild(buildIdParam) {
  isLoading.value = true;
  error.value = null;
  build.value = null;
  photos.value = [];
  removedPhotos.value = [];
  originalPhotoIds.value = [];
  showAddPhotosDialog.value = false;
  showPhotoInfoDialog.value = false;
  selectedDialogPhoto.value = null;

  try {
    const buildId = Number(buildIdParam);
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
}

watch(() => route.params.id, loadBuild, { immediate: true });

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

async function handlePhotoInfo(photo) {
  try {
    const fullPhoto = await photosStore.fetchPhoto(photo.id);
    selectedDialogPhoto.value = fullPhoto;
    showPhotoInfoDialog.value = true;
  } catch (err) {
    console.error("[PortfolioDetailView] fetchPhoto error:", err);
  }
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

function handleExportSelect(key) {
  if (key === "pdf") exportAsPdf();
  else if (key === "jpeg") exportAsJpeg();
}

async function exportAsJpeg() {
  if (!photos.value.length || isExporting.value) return;
  isExporting.value = true;
  exportStatus.value = "Rendering…";
  try {
    const gridEl = gridRef.value?.wrapperRef;
    if (!gridEl) throw new Error("Grid element not available");
    const rawName =
      build.value?.config?.name || `portfolio-${build.value?.id || "export"}`;
    const safeName = rawName.replace(/[^\w.-]+/g, "_");
    await exportPortfolioToJpeg({
      gridElement: gridEl,
      filename: `${safeName}.jpg`,
    });
    message.success("JPEG exported");
  } catch (err) {
    console.error("[PortfolioDetailView] jpeg export error:", err);
    message.error("Failed to export JPEG");
  } finally {
    isExporting.value = false;
    exportStatus.value = "Exporting…";
  }
}

async function exportAsPdf() {
  if (!photos.value.length || isExporting.value) return;
  isExporting.value = true;
  exportStatus.value = "Preparing…";
  try {
    const containerWidthPx = gridRef.value?.containerWidth || 0;
    const rawName =
      build.value?.config?.name || `portfolio-${build.value?.id || "export"}`;
    const safeName = rawName.replace(/[^\w.-]+/g, "_");
    await exportPortfolioToPdf({
      photos: photos.value,
      columns: columns.value,
      gap: gap.value,
      containerWidthPx,
      orientation: "auto",
      filename: `${safeName}.pdf`,
      onProgress: ({ loaded, total }) => {
        exportStatus.value = `Loading ${loaded}/${total}`;
      },
    });
    message.success("PDF exported");
  } catch (err) {
    console.error("[PortfolioDetailView] export error:", err);
    message.error("Failed to export PDF");
  } finally {
    isExporting.value = false;
    exportStatus.value = "Exporting…";
  }
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

.header-actions-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
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
