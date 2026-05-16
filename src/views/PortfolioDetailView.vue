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
            {{ backLabel }}
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
                :disabled="!photos.length || isExporting || isDownloadingZip"
                :loading="isExporting || isDownloadingZip"
              >
                <template #icon>
                  <n-icon><DownloadOutline /></n-icon>
                </template>
                {{
                  isExporting
                    ? exportStatus
                    : isDownloadingZip
                      ? "Preparing ZIP…"
                      : "Export"
                }}
              </n-button>
            </n-dropdown>

            <n-button
              type="error"
              ghost
              @click="showDeleteConfirmation"
              class="detail-delete-button"
            >
              <template #icon>
                <n-icon>
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                    />
                  </svg>
                </n-icon>
              </template>
              Delete Portfolio
            </n-button>
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
      <n-spin size="large" />
      <p class="loading-state-text">Loading your portfolio…</p>
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
        v-model:fill-available-space="fillAvailableSpace"
        :photo-count="photos.length"
        :removed-count="removedPhotos.length"
        :photos="photos"
        :selected-ids="selectedPhotoIds"
        @undo-last="undoLastRemoval"
        @restore-all="restoreAll"
        @add-photos="showAddPhotosDialog = true"
        @build-variant="openVariantWizard"
        @select-all="handleSelectAll"
        @deselect-all="clearAllSelections"
      />

      <PortfolioGrid
        v-model:photos="photos"
        :columns="columns"
        :gap="gap"
        :fill-available-space="fillAvailableSpace"
        :selected-ids="selectedPhotoIds"
        ref="gridRef"
        @select="(photo) => togglePhotoSelection(photo.id)"
        @remove="handleRemovePhoto"
        @info="handlePhotoInfo"
      />
    </template>

    <!-- Empty portfolio state (manual portfolios or after removing all photos) -->
    <div
      v-else-if="build && build.status === 'completed' && photos.length === 0"
      class="empty-portfolio-state"
    >
      <n-icon :size="64" color="var(--text-tertiary)">
        <ImagesOutline />
      </n-icon>
      <h3>This portfolio is empty</h3>
      <p>
        {{
          isManualBuild
            ? "Start adding photos to build your portfolio manually."
            : "All photos have been removed. Add some back to continue."
        }}
      </p>
      <n-button type="primary" @click="showAddPhotosDialog = true">
        <template #icon>
          <n-icon><AddOutline /></n-icon>
        </template>
        Add Photos
      </n-button>
    </div>

    <PortfolioAddPhotosDialog
      v-if="build"
      v-model="showAddPhotosDialog"
      :build="build"
      :current-photo-ids="currentPhotoIds"
      @add-photos="handleAddPhotos"
    />

    <!-- Variant wizard -->
    <PortfolioBuildWizard
      v-model:show="showVariantWizard"
      :prefill-config="variantPrefillConfig"
      :target-set-id="build?.setId || null"
      @build-complete="onVariantBuildComplete"
    />

    <!-- Collection modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="selectedPhotoIds.length"
      :photo-ids="selectedPhotoIds"
      @add-to-collection="onCollectionAdded"
      @add-to-series="onCollectionAdded"
      @cancel="showCollectionModal = false"
    />

    <!-- Tool selector -->
    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="selectedPhotoIds.length"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />

    <!-- Floating action bar -->
    <FloatingActionBar
      :selected-ids="selectedPhotoIds"
      :show-delete="false"
      :show-add-to-collection="true"
      :show-move-to-tool="true"
      :is-downloading="isDownloadingZip"
      @clear-selection="clearAllSelections"
      @download="handleSelectionDownload"
      @add-to-collection="showCollectionModal = true"
      @move-to-tool="openToolSelector"
    />

    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
      @change-photo="selectedDialogPhoto = $event"
    />

    <!-- Delete Portfolio Confirmation Dialog -->
    <n-modal
      v-model:show="deleteConfirmationVisible"
      preset="dialog"
      title="Delete Portfolio"
      positive-text="Delete Portfolio"
      negative-text="Cancel"
      type="error"
      :loading="isDeleting"
      @positive-click="deletePortfolio"
      @negative-click="deleteConfirmationVisible = false"
    >
      <div class="delete-confirmation">
        <p>
          Are you sure you want to delete the portfolio
          <strong
            >"{{ build?.config?.name || `Portfolio #${build?.id}` }}"</strong
          >?
        </p>
        <p class="delete-warning">
          <n-icon size="16" color="#f5a623" style="margin-right: 8px">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
              />
            </svg>
          </n-icon>
          Don't worry - your photos will not be deleted, only the portfolio will
          be removed.
        </p>
      </div>
    </n-modal>

    <!-- Unsaved Changes Dialog -->
    <n-modal
      v-model:show="showUnsavedModal"
      preset="dialog"
      title="Unsaved Changes"
      positive-text="Save & Leave"
      negative-text="Leave Without Saving"
      type="warning"
      :mask-closable="false"
      style="width: 524px"
      @positive-click="handleSaveAndLeave"
      @negative-click="handleLeaveWithoutSaving"
      @close="handleStayOnPage"
    >
      <div class="unsaved-changes-confirmation">
        <p>You have unsaved changes in this portfolio.</p>
        <p class="unsaved-warning">
          <n-icon size="16" style="margin-right: 8px; flex-shrink: 0">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
              />
            </svg>
          </n-icon>
          If you leave now, your changes to the photo layout will be lost.
        </p>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import { NIcon, NSpin, NButton, NDropdown, NModal, useMessage } from "naive-ui";
import {
  SaveOutline,
  HourglassOutline,
  DownloadOutline,
  DocumentTextOutline,
  ImageOutline,
  ImagesOutline,
  AddOutline,
} from "@vicons/ionicons5";
import { h } from "vue";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";
import { usePhotosStore } from "@/stores/photos";
import PortfolioGrid from "@/components/portfolio-builder/PortfolioGrid.vue";
import PortfolioGridToolbar from "@/components/portfolio-builder/PortfolioGridToolbar.vue";
import PortfolioAddPhotosDialog from "@/components/portfolio-builder/PortfolioAddPhotosDialog.vue";
import PortfolioBuildWizard from "@/components/portfolio-builder/PortfolioBuildWizardStepped.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import {
  exportPortfolioToPdf,
  exportPortfolioToJpeg,
} from "@/utils/portfolioPdfExport";
import { usePhotoDownload } from "@/composables/usePhotoDownload";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection";

defineOptions({ name: "PortfolioDetailView" });

const route = useRoute();
const router = useRouter();
const message = useMessage();
const store = usePortfolioBuildsStore();
const photosStore = usePhotosStore();
const {
  downloadPhotosZip,
  isDownloading: isDownloadingZip,
  downloadPhoto,
} = usePhotoDownload();

const {
  selectedPhotoIds,
  togglePhotoSelection,
  clearAllSelections,
  selectAllPhotos,
  deselectAllPhotos,
} = useLocalPhotoSelection();

const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

const showCollectionModal = ref(false);

// Unsaved changes navigation guard state
const showUnsavedModal = ref(false);
let pendingNavigation = null;

const build = ref(null);
const photos = ref([]);
const removedPhotos = ref([]);
const originalPhotoIds = ref([]);
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref(null);
const columns = ref(2);
const gap = ref(30);
const fillAvailableSpace = ref(true);
const showAddPhotosDialog = ref(false);
const gridRef = ref(null);
const isExporting = ref(false);
const exportStatus = ref("Exporting…");
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref(null);
const deleteConfirmationVisible = ref(false);
const isDeleting = ref(false);
const showVariantWizard = ref(false);
const variantPrefillConfig = ref(null);

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
  {
    label: "Download as ZIP",
    key: "zip",
    icon: () => h(NIcon, null, { default: () => h(DownloadOutline) }),
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
  const currentIds = photos.value.map((p) => p.id);
  if (currentIds.length !== originalPhotoIds.value.length) return true;
  return currentIds.some((id, i) => id !== originalPhotoIds.value[i]);
});

const currentPhotoIds = computed(() => photos.value.map((p) => p.id));

const isManualBuild = computed(() => Boolean(build.value?.config?.isManual));

const parentSet = computed(() =>
  build.value?.setId ? store.getSetById(build.value.setId) : null,
);

const backLabel = computed(() =>
  parentSet.value ? `Back to ${parentSet.value.name}` : "Back to Portfolios",
);

function handleAddPhotos(newPhotos) {
  if (!Array.isArray(newPhotos) || newPhotos.length === 0) return;
  const existing = new Set(photos.value.map((p) => p.id));
  const toAdd = newPhotos.filter((p) => p && p.id && !existing.has(p.id));
  if (toAdd.length === 0) return;
  photos.value.push(
    ...toAdd.map((p) => ({
      id: p.id,
      thumbnailUrl: p.thumbnailUrl,
      originalUrl: p.originalUrl,
    })),
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
    if (data.setId && !store.setsHaveBeenLoaded) {
      await store.getOrFetchSets();
    }

    if (data.status === "completed" && data.result?.photoItems?.length) {
      photos.value = data.result.photoItems.map((p) => ({ ...p }));
      originalPhotoIds.value = photos.value.map((p) => p.id);
      autoSelectColumns(photos.value.length);
    } else if (data.status === "completed") {
      // Empty (e.g. manual portfolio with no photos yet)
      photos.value = [];
      originalPhotoIds.value = [];
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
  if (build.value?.setId) {
    router.push({
      name: "portfolio-set",
      params: { setId: build.value.setId },
    });
  } else {
    router.push({ name: "portfolios" });
  }
}

function showDeleteConfirmation() {
  deleteConfirmationVisible.value = true;
}

function openVariantWizard() {
  if (!build.value) return;
  const baseName = build.value.config?.name || `Portfolio #${build.value.id}`;

  // Compute the next variant number: find max N among existing "<baseName> Variant N" portfolios.
  const variantPattern = new RegExp(
    `^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} Variant (\\d+)$`,
    "i",
  );
  let maxN = 0;
  for (const b of store.allBuilds) {
    const existingName = b.config?.name || "";
    const match = existingName.match(variantPattern);
    if (match) maxN = Math.max(maxN, parseInt(match[1], 10));
  }
  const variantName = `${baseName} Variant ${maxN + 1}`;

  variantPrefillConfig.value = {
    ...(build.value.config || {}),
    name: variantName,
  };
  showVariantWizard.value = true;
}

async function onVariantBuildComplete() {
  await Promise.all([store.fetchBuilds(), store.fetchBuildSets()]);
  if (build.value?.setId) {
    router.push({
      name: "portfolio-set",
      params: { setId: build.value.setId },
    });
  } else {
    router.push({ name: "portfolios" });
  }
}

function onCollectionAdded() {
  showCollectionModal.value = false;
  clearAllSelections();
}

async function handleToolSelected(toolId, canvasId = null) {
  const ids = [...selectedPhotoIds.value];
  await takeToTool(toolId, ids, clearAllSelections, canvasId);
  closeToolSelector();
}

async function handleSelectionDownload() {
  const photosToDownload = selectedPhotoIds.value
    .map((id) => photos.value.find((p) => p.id === id))
    .filter(Boolean);
  if (photosToDownload.length === 1) {
    await downloadPhoto(photosToDownload[0]);
  } else {
    await downloadPhotosZip(photosToDownload);
  }
}

function handleSelectAll() {
  selectAllPhotos(photos.value.map((p) => p.id));
}

async function deletePortfolio() {
  if (!build.value) return;
  isDeleting.value = true;
  try {
    await store.deleteBuild(build.value.id);
    message.success(
      `Portfolio "${
        build.value.config?.name || `Portfolio #${build.value.id}`
      }" deleted successfully`,
    );
    deleteConfirmationVisible.value = false;
    goBack();
  } catch (err) {
    console.error("[PortfolioDetailView] delete error:", err);
    message.error("Failed to delete portfolio");
  } finally {
    isDeleting.value = false;
  }
}

async function handleExportSelect(key) {
  if (key === "pdf") exportAsPdf();
  else if (key === "jpeg") exportAsJpeg();
  else if (key === "zip") await downloadPhotosZip(photos.value);
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
      fillAvailableSpace: fillAvailableSpace.value,
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

// Unsaved changes modal handlers
function handleLeaveWithoutSaving() {
  showUnsavedModal.value = false;
  if (pendingNavigation) {
    const next = pendingNavigation;
    pendingNavigation = null;
    next();
  }
}

function handleStayOnPage() {
  showUnsavedModal.value = false;
  if (pendingNavigation) {
    const next = pendingNavigation;
    pendingNavigation = null;
    next(false);
  }
}

async function handleSaveAndLeave() {
  await saveLayout();
  showUnsavedModal.value = false;
  if (pendingNavigation) {
    const next = pendingNavigation;
    pendingNavigation = null;
    next();
  }
}

onBeforeRouteLeave((_to, _from, next) => {
  if (hasChanges.value) {
    pendingNavigation = next;
    showUnsavedModal.value = true;
  } else {
    next();
  }
});
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

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100svh - 160px);
  gap: 24px;
}

.loading-state-text {
  color: var(--text-secondary, #a8a8a8);
  font-size: 16px;
  margin: 0;
  font-weight: 500;
}

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

.empty-portfolio-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  gap: 16px;
  text-align: center;
  color: var(--text-secondary);
}

.empty-portfolio-state h3 {
  margin: 0;
  color: var(--text-primary);
}

.empty-portfolio-state p {
  margin: 0;
  max-width: 420px;
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
