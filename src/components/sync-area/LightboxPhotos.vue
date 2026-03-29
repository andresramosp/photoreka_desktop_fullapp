<template>
  <div class="tab-content">
    <DuplicatePhotosDialog
      v-model="showDuplicatesDialog"
      :duplicates="selectedDuplicates"
    />

    <LightroomModal v-model="showLightroomModal" />

    <!-- Source Warning Modal -->
    <n-modal
      v-model:show="showSourceWarningModal"
      preset="dialog"
      :title="sourceWarningConfig?.title"
      :closable="false"
      :style="{ width: '500px' }"
    >
      <div style="margin-bottom: 24px">
        <span style="color: var(--text-secondary); line-height: 1.6">
          {{ sourceWarningConfig?.message }}
        </span>
      </div>
      <template #action>
        <div style="display: flex; gap: 12px; justify-content: flex-end">
          <n-button @click="cancelSourceWarning">Cancel</n-button>
          <n-button type="primary" @click="confirmSourceWarning"
            >Continue</n-button
          >
        </div>
      </template>
    </n-modal>

    <n-modal
      v-model:show="showAnalyzeDialog"
      preset="confirm"
      title="Confirm Process"
      :closable="false"
      @close="closeAnalyzeDialog"
      :style="{ width: '600px' }"
    >
      <div style="margin-bottom: 18px">
        <span>
          You are about to process
          {{ selectedCount }}
          photos. Once started, it cannot be reversed. <br />

          Do you want to continue?
        </span>
      </div>
      <div
        style="
          margin-bottom: 16px;
          display: flex;
          justify-content: flex-end;
          align-items: center;
        "
      >
        <div style="display: flex; align-items: center">
          <n-checkbox disabled size="large" v-model:checked="fastMode">
            Fast mode
          </n-checkbox>
          <!-- <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-icon size="12" class="info-icon">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                  />
                </svg>
              </n-icon>
            </template>
            Fast mode is designed for uploading photos that you want to use
            immediately and has a limit of 10% of your total storage space. If
            you have a lot of photos, it's recommended to use normal mode.
          </n-tooltip> -->
        </div>
      </div>
      <div style="display: flex; gap: 14px; justify-content: center">
        <n-button tertiary @click="closeAnalyzeDialog">Cancel</n-button>
        <n-button type="primary" @click="confirmAnalyze"
          >Yes, start process</n-button
        >
      </div>
    </n-modal>
    <div v-if="isAnyOperationInProgress" class="upload-progress-section">
      <div class="progress-header">
        <div class="progress-title-container">
          <h3 class="progress-title">
            {{
              overallProgress >= 100 && isPreprocessing
                ? "Preprocessing Photos"
                : "Importing Photos"
            }}
          </h3>
          <n-spin
            v-if="overallProgress >= 100 && isPreprocessing"
            size="tiny"
            class="preprocessing-spinner"
          />
        </div>
        <span class="progress-count">{{ progressCountText }}</span>
      </div>
      <n-progress
        type="line"
        :percentage="actualProgress"
        :show-indicator="false"
        class="overall-progress"
      />
      <div class="progress-text">
        {{ Math.round(actualProgress) }}% complete
      </div>
    </div>
    <!-- Upload Progress Section - hidden during first import state -->
    <div
      v-if="!isFirstImportState || lightboxPhotos.length > 0"
      class="sync-area-header"
    >
      <n-icon size="18" color="var(--primary-color)">
        <BookInformation20Regular />
      </n-icon>
      <h3 class="sync-area-title">
        Photo upload and preview area. Click on Analyze Photos to
        <strong>start processing</strong>
      </h3>
    </div>

    <!-- Maintenance Mode Section -->
    <div v-if="isMaintenanceMode" class="maintenance-section">
      <div class="maintenance-container">
        <div class="maintenance-content">
          <div class="maintenance-icon">
            <n-icon size="48" color="#f59e0b">
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12 2C13.1 2 14 2.9 14 4L14 13C14 14.1 13.1 15 12 15C10.9 15 10 14.1 10 13L10 4C10 2.9 10.9 2 12 2ZM12 17C13.1 17 14 17.9 14 19C14 20.1 13.1 21 12 21C10.9 21 10 20.1 10 19C10 17.9 10.9 17 12 17Z"
                />
              </svg>
            </n-icon>
          </div>
          <h3 class="maintenance-title">Maintenance in Progress</h3>
          <p class="maintenance-subtitle">
            We are currently performing temporary maintenance on our photo
            processing system.
          </p>
          <div class="maintenance-features">
            <div class="maintenance-feature">
              <n-icon size="16" color="#ef4444">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
                  />
                </svg>
              </n-icon>
              <span>Photo upload temporarily disabled</span>
            </div>
            <div class="maintenance-feature">
              <n-icon size="16" color="#ef4444">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
                  />
                </svg>
              </n-icon>
              <span>Photo analysis temporarily disabled</span>
            </div>
          </div>
          <div class="maintenance-message">
            <p>
              We appreciate your patience while we enhance our services. Please
              try again in a few minutes.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- First Import State - Onboarding continuation -->
    <div
      v-if="
        !isMaintenanceMode && isFirstImportState && lightboxPhotos.length === 0
      "
      class="first-import-section"
    >
      <div class="first-import-header">
        <h1 class="first-import-title">
          Your Lightbox is ready to get started
        </h1>

        <!-- <h2 class="first-import-title">Now let's import your first photos</h2> -->
        <p class="first-import-subtitle">
          Import your first batch of photos to start exploring Photoreka's
          features
        </p>
      </div>

      <!-- Web-first workflow cards -->
      <div v-if="preferredSource === 'web'" class="import-cards-grid">
        <div
          class="import-card"
          :class="{ 'drag-over': isDragOver && !isUploadDisabled }"
          @click="triggerFileInput"
          @dragover.prevent="!isUploadDisabled && handleDragOver"
          @dragenter.prevent="!isUploadDisabled && handleDragEnter"
          @dragleave.prevent="!isUploadDisabled && handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <div class="import-card-icon">
            <n-icon size="48" color="var(--primary-color)">
              <FolderOpen />
            </n-icon>
          </div>
          <h4 class="import-card-title">Local Files</h4>
          <p class="import-card-description">
            Drag & drop or browse your computer
          </p>
          <n-tag type="primary" size="large" round>Recommended</n-tag>
        </div>

        <div class="import-card" @click="importFromGooglePhotos">
          <div class="import-card-icon">
            <img
              :src="googlePhotosIconUrl"
              alt="Google Photos"
              class="google-photos-logo"
            />
          </div>
          <h4 class="import-card-title">Google Photos</h4>
          <div class="import-card-description">
            {{
              googlePhotos.isAuthorized.value
                ? "Import from your Google Photos library"
                : "Connect and sync your photos from Google Photos"
            }}
          </div>
          <n-tag
            v-if="!googlePhotos.isAuthorized.value"
            type="warning"
            size="large"
            round
          >
            Disconnected
          </n-tag>
          <n-tag v-else type="success" size="large" round> Connected </n-tag>
        </div>

        <div class="import-card" @click="importFromDropbox">
          <div class="import-card-icon">
            <img :src="dropboxIconUrl" alt="Dropbox" class="dropbox-logo" />
          </div>
          <h4 class="import-card-title">Dropbox</h4>
          <p class="import-card-description">
            Import photos directly from your Dropbox
          </p>
          <n-tag type="info" size="large" round>Select files</n-tag>
        </div>

        <div
          class="import-card lightroom-card"
          @click="showLightroomModal = true"
        >
          <div class="import-card-icon">
            <img
              src="/src/assets/logos/lightroom_logo.png"
              alt="Adobe Lightroom"
              class="lightroom-logo"
            />
          </div>
          <h4 class="import-card-title">Official Plugin</h4>
          <p class="import-card-description">
            Export from LrC and work in the web version
          </p>
          <n-tag type="info" size="large" round> See instructions</n-tag>
        </div>
      </div>

      <!-- Lightroom-first workflow card -->
      <div v-else class="import-cards-grid single">
        <div
          class="import-card lightroom-card"
          @click="showLightroomModal = true"
        >
          <div class="import-card-icon">
            <img
              src="/src/assets/logos/lightroom_logo.png"
              alt="Adobe Lightroom"
              class="lightroom-logo"
            />
          </div>
          <h4 class="import-card-title">Official Plugin</h4>
          <p class="import-card-description">
            Export photos directly Lightroom Classic
          </p>
          <n-tag type="success" size="large" round> See instructions</n-tag>
        </div>
      </div>

      <!-- <div class="first-import-footer">
        <span class="format-text"
          >Supports JPG, PNG and major image formats</span
        >
      </div> -->
    </div>

    <!-- Empty State Section -->
    <div
      v-if="
        !isMaintenanceMode && !isFirstImportState && lightboxPhotos.length === 0
      "
      class="empty-state-section"
    >
      <div class="empty-state-container">
        <div class="empty-state-content">
          <div class="empty-state-icon">
            <n-icon size="48" :color="'var(--primary-color)'">
              <CloudUploadOutline />
            </n-icon>
          </div>
          <h3 class="empty-state-title">
            {{
              isUploadDisabled && photosRemaining <= 0
                ? "Upload limit reached"
                : "Your Lightbox is empty"
            }}
          </h3>
          <p class="empty-state-subtitle upload-subtitle">
            {{
              isUploadDisabled
                ? uploadDisabledMessage
                : "Import your photos using one of the options below."
            }}
          </p>

          <div v-if="!isUploadDisabled" class="upload-buttons">
            <n-button
              v-for="button in uploadButtons"
              :key="button.key"
              secondary
              :type="button.type"
              size="large"
              @click="button.action"
            >
              <template #icon>
                <n-icon
                  v-if="button.icon === 'FolderOpen'"
                  color="var(--primary-color)"
                >
                  <FolderOpen />
                </n-icon>
                <n-icon v-else-if="button.icon === 'lightroom'">
                  <img
                    src="/src/assets/logos/lightroom_logo.png"
                    alt="Lr"
                    style="width: 1.1em; height: 1.1em"
                  />
                </n-icon>
                <n-icon v-else-if="button.icon === 'google'">
                  <img
                    :src="googlePhotosIconUrl"
                    alt="Google Photos"
                    style="width: 1em; height: 1em"
                  />
                </n-icon>
                <n-icon v-else-if="button.icon === 'google-locked'">
                  <svg viewBox="0 0 24 24" width="1em" height="1em">
                    <path
                      fill="currentColor"
                      d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"
                    />
                  </svg>
                </n-icon>
                <n-icon v-else-if="button.icon === 'dropbox'">
                  <img
                    :src="dropboxIconUrl"
                    alt="Dropbox"
                    style="width: 1em; height: 1em"
                  />
                </n-icon>
              </template>
              {{ button.label }}
            </n-button>
          </div>
          <div class="file-formats">
            <span class="format-text"
              >Supports JPG, PNG, WebP up to 5MB per file</span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Compact Upload Section -->
    <div
      v-if="!isMaintenanceMode && lightboxPhotos.length > 0"
      class="header-buttons compact-upload-section"
    >
      <div class="">
        <div class="compact-upload-buttons">
          <n-tooltip
            v-for="button in uploadButtons"
            :key="button.key"
            trigger="hover"
            placement="bottom"
          >
            <template #trigger>
              <n-button
                :type="button.type"
                size="medium"
                :disabled="isUploadDisabled && button.key === 'local'"
                @click.stop="button.action"
              >
                <template #icon>
                  <n-icon
                    v-if="button.icon === 'FolderOpen'"
                    color="var(--primary-color)"
                  >
                    <FolderOpen />
                  </n-icon>
                  <n-icon v-else-if="button.icon === 'lightroom'">
                    <img
                      src="/src/assets/logos/lightroom_logo.png"
                      alt="Lr"
                      style="width: 1.1em; height: 1.1em"
                    />
                  </n-icon>
                  <n-icon v-else-if="button.icon === 'google'">
                    <img
                      :src="googlePhotosIconUrl"
                      alt="Google Photos"
                      style="width: 1em; height: 1em"
                    />
                  </n-icon>
                  <n-icon v-else-if="button.icon === 'google-locked'">
                    <!-- Candado abierto - indicando desconectado -->
                    <svg viewBox="0 0 24 24" width="1em" height="1em">
                      <path
                        fill="currentColor"
                        d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"
                      />
                    </svg>
                  </n-icon>
                  <n-icon v-else-if="button.icon === 'dropbox'">
                    <img
                      :src="dropboxIconUrl"
                      alt="Dropbox"
                      style="width: 1em; height: 1em"
                    />
                  </n-icon>
                </template>
                <span class="button-label">{{
                  isUploadDisabled &&
                  photosRemaining <= 0 &&
                  button.key === "local"
                    ? "Upload Limit Reached"
                    : button.compactLabel
                }}</span>
              </n-button>
            </template>
            {{ button.compactLabel }}
          </n-tooltip>
        </div>
      </div>
    </div>

    <!-- Uploaded Photos -->
    <div v-if="lightboxPhotos.length > 0" class="uploaded-photos-section">
      <!-- Photos Grid Component -->
      <PhotosGrid
        :photos="filteredPhotos"
        :displayAddToCollection="false"
        :displayMoveToTool="false"
        :hideControls="true"
        :findDuplicatesEnabled="true"
        context="lightbox"
        @selection-change="handleSelectionChange"
        @duplicates-filter-change="handleDuplicatesFilterChange"
      />
    </div>

    <!-- Hidden Input -->
    <input
      ref="fileInput"
      type="file"
      multiple
      accept="image/*"
      style="display: none"
      @change="uploadLocalFiles"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useUserStore } from "@/stores/userStore.ts";
import { usePhotoUpload } from "@/composables/usePhotoUpload.js";
import { useWarmUp } from "@/composables/useWarmUp.js";
import { useGooglePhotos } from "@/composables/useGooglePhotos.js";
import { useDropbox } from "@/composables/useDropbox.js";
import { FolderOpen, CloudUploadOutline } from "@vicons/ionicons5";
import { BookInformation20Regular } from "@vicons/fluent";
import pLimit from "p-limit";
import pica from "pica";
import googlePhotosIconUrl from "@/assets/logos/google_photos.png";
import dropboxIconUrl from "@/assets/logos/dropbox.svg";

import PhotosGrid from "../PhotosGrid.vue";
import DuplicatePhotosDialog from "../DuplicatePhotosDialog.vue";
import LightroomModal from "../LightroomModal.vue";

import { NModal, NCheckbox, NTooltip } from "naive-ui";

import { useMessage } from "naive-ui";

// Maintenance mode check
const isMaintenanceMode = computed(
  () => import.meta.env.VITE_MAINTENANCE_MODE === "true",
);

const emit = defineEmits([
  "on-analyze",
  "selection-change",
  "duplicates-filter-change",
]);
const photosStore = usePhotosStore();
const userStore = useUserStore();
const message = useMessage();

// Warm up composable
const { warmedUp, ensureWarmUp } = useWarmUp();

// Google Photos composable
const googlePhotos = useGooglePhotos();
// Dropbox composable
const dropbox = useDropbox();
const picaInstance = pica();
const limit = pLimit(10);

// Composables
const {
  isUploading,
  uploadedCount,
  totalFiles,
  overallProgress,
  handleUploadFlow,
  validateUploadLimits,
} = usePhotoUpload();

// Variables locales del componente
const fileInput = ref(null);
const showDuplicatesDialog = ref(false);
const selectedDuplicates = ref([]);
const isDragOver = ref(false);
const showLightroomModal = ref(false);
const showSourceWarningModal = ref(false);
const pendingSourceAction = ref(null);

// Variable para controlar si ya se activó el warm-up al 75%
const warmUpTriggeredAt75 = ref(false);

// Upload limitations computed properties
const photosRemaining = computed(() => {
  return userStore.user?.usage?.photosRemaining ?? Infinity;
});

const isUploadDisabled = computed(() => {
  return (
    isMaintenanceMode.value || isUploading.value || photosRemaining.value <= 0
  );
});

const uploadDisabledMessage = computed(() => {
  if (isMaintenanceMode.value) {
    return "Photo upload is temporarily disabled during maintenance";
  }
  if (photosRemaining.value <= 0) {
    return "You have reached your photo upload limit. Please upgrade your plan to upload more photos.";
  }
  return "";
});

// Computed for preferred source
const preferredSource = computed(() => {
  return userStore.user?.preferredSource || "web";
});

// Computed for first import state - show wizard-style UI when user has never processed photos
const isFirstImportState = computed(() => {
  // Don't show first import state while store is loading
  if (photosStore.isLoading) return false;

  // Don't show if photos array hasn't been initialized yet
  if (photosStore.photos === null) return false;

  // First import state when user has no processed photos and no workspace photos
  const hasProcessedPhotos = photosStore.processedPhotos?.length > 0;
  const hasWorkspacePhotos = photosStore.workspacePhotos?.length > 0;
  return !hasProcessedPhotos && !hasWorkspacePhotos;
});

// Computed property for actual progress (considers Google Photos download)
const actualProgress = computed(() => {
  if (googlePhotos.isDownloading.value) {
    return googlePhotos.downloadProgress.value;
  }
  return overallProgress.value;
});

// Computed to check if there's any operation in progress
const isAnyOperationInProgress = computed(() => {
  // Check if downloading from Google Photos with actual items to download
  const isDownloadingGooglePhotos =
    googlePhotos.isDownloading.value && googlePhotos.totalToDownload.value > 0;

  // Check if uploading to Cloudflare with actual files
  const isUploadingFiles = isUploading.value && totalFiles.value > 0;

  return isDownloadingGooglePhotos || isUploadingFiles;
});

// Computed for the progress count text
const progressCountText = computed(() => {
  if (
    googlePhotos.isDownloading.value &&
    googlePhotos.totalToDownload.value > 0
  ) {
    return `${googlePhotos.downloadedCount.value}/${googlePhotos.totalToDownload.value} photos`;
  }
  if (isUploading.value && totalFiles.value > 0) {
    return `${uploadedCount.value}/${totalFiles.value} photos`;
  }
  return "";
});

// Source warning message and title based on preferredSource
const sourceWarningConfig = computed(() => {
  const preferredSource = userStore.user?.preferredSource || "web";

  if (
    preferredSource === "lightroom" &&
    pendingSourceAction.value !== "lightroom"
  ) {
    return {
      title: "Different Export Source",
      message:
        "Your main export source is Lightroom. If you add photos from another source, they won't be visible in Lightroom.",
    };
  }

  if (preferredSource === "web" && pendingSourceAction.value === "lightroom") {
    return {
      title: "Different Export Source",
      message:
        "Your export source is web. If you add photos from Lightroom, the photos you've uploaded from web until now won't be visible in Lightroom.",
    };
  }

  return null;
});

// Button configurations based on preferredSource
const uploadButtons = computed(() => {
  const preferredSource = userStore.user?.preferredSource || "web";

  const buttons = {
    local: {
      key: "local",
      label: "Import from local files",
      compactLabel: "Local Files",
      icon: "FolderOpen",
      type: "default",
      action: () => handleSourceSelection("local", () => triggerFileInput()),
    },
    lightroom: {
      key: "lightroom",
      label: "Lightroom Plugin",
      compactLabel: "Plugin",
      icon: "lightroom",
      type: "default",
      action: () =>
        handleSourceSelection("lightroom", () => {
          showLightroomModal.value = true;
        }),
    },
    google: {
      key: "google",
      label: "Google Photos",
      compactLabel: "Google Photos",
      icon: googlePhotos.isAuthorized.value ? "google" : "google-locked",
      type: "default",
      action: () => handleSourceSelection("google", importFromGooglePhotos),
    },
    dropbox: {
      key: "dropbox",
      label: "Dropbox",
      compactLabel: "Dropbox",
      icon: "dropbox",
      type: "default",
      action: () => handleSourceSelection("dropbox", importFromDropbox),
    },
  };

  // Order buttons based on preferredSource
  if (preferredSource === "lightroom") {
    return [buttons.lightroom, buttons.local, buttons.google, buttons.dropbox];
  }

  // Default order for "web"
  return [buttons.local, buttons.google, buttons.lightroom, buttons.dropbox];
});

// Watcher para activar warm-up cuando el progreso llega al 75%
watch(overallProgress, (newProgress) => {
  if (newProgress >= 75 && !warmUpTriggeredAt75.value && isUploading.value) {
    ensureWarmUp("image");
    warmUpTriggeredAt75.value = true;
  }

  // Reset del flag cuando la subida termina
  if (!isUploading.value) {
    warmUpTriggeredAt75.value = false;
  }
});

// Watcher para mostrar un aviso de éxito cuando se autoriza Google Photos
watch(
  () => googlePhotos.isAuthorized.value,
  (newValue, oldValue) => {
    if (newValue && !oldValue) {
      message.success("Google Photos connected successfully!");
    }
  },
);

const fastModeOverride = ref(true);

const fastMode = computed({
  get() {
    // Si hay un override manual, usarlo
    if (fastModeOverride.value !== null) {
      return fastModeOverride.value;
    }
    // Si es la primera vez subiendo fotos, no activar fast mode automáticamente
    // if (isFirstTimeUpload.value) {
    //   return false;
    // }
    // // Si hay menos de 8 fotos subidas, activar fast mode automáticamente
    // return lightboxPhotos.value.length < 8;
  },
  set(value) {
    // Para casos donde se necesite override manual
    fastModeOverride.value = value;
  },
});
const showAnalyzeDialog = ref(false);

// En el check 'preprocessed' queremos ver todas las usables en las tools, por lo que entran
// las que están en proceso y por tanto preprocessed
const lightboxPhotos = computed(() => photosStore.lightboxPhotos);

const filteredPhotos = computed(() => {
  // Modo normal: solo preprocesadas
  return lightboxPhotos.value;
});

// Computed to check if photos are in preprocessing state
const isPreprocessing = computed(() => {
  return lightboxPhotos.value.some(
    (photo) => photo.isCheckingDuplicates || photo.status === "preprocessing",
  );
});

// Selection state from PhotosGrid
const localSelectedCount = ref(0);
const localSelectedIds = ref([]);

const handleSelectionChange = (selectionData) => {
  localSelectedCount.value = selectionData.selectedCount;
  localSelectedIds.value = selectionData.selectedIds;
  // Emitir el evento al padre
  emit("selection-change", selectionData);
};

// Duplicates filter state
const isDuplicateFilterActive = ref("all");
const filteredUniqueIds = ref([]);

const handleDuplicatesFilterChange = ({ filter, filteredIds }) => {
  isDuplicateFilterActive.value = filter;
  filteredUniqueIds.value = filteredIds;
  emit("duplicates-filter-change", filter);
};

// Use local selection state for the analyze dialog
const selectedCount = computed(() => {
  if (localSelectedCount.value > 0) return localSelectedCount.value;
  if (isDuplicateFilterActive.value === "non-duplicates")
    return filteredUniqueIds.value.length;
  return filteredPhotos.value.length;
});

const triggerFileInput = () => {
  if (isUploadDisabled.value) {
    if (uploadDisabledMessage.value) {
      message.warning(uploadDisabledMessage.value);
    }
    return;
  }
  fileInput.value?.click();
};

// Drag & Drop functionality
const handleDragOver = (event) => {
  event.preventDefault();
};

const handleDragEnter = (event) => {
  event.preventDefault();
  isDragOver.value = true;
};

const handleDragLeave = (event) => {
  event.preventDefault();
  isDragOver.value = false;
};

const handleDrop = async (event) => {
  event.preventDefault();
  isDragOver.value = false;

  if (isUploadDisabled.value) {
    if (uploadDisabledMessage.value) {
      message.warning(uploadDisabledMessage.value);
    }
    return;
  }

  const files = Array.from(event.dataTransfer.files).filter((file) =>
    file.type.startsWith("image/"),
  );

  if (files.length === 0) {
    message.warning("No se encontraron archivos de imagen válidos");
    return;
  }

  // Validar límites antes de proceder
  const validation = validateUploadLimits(files.length);
  if (!validation.isValid) {
    message.error(validation.message);
    return;
  }

  // Trigger warm up when photos are dropped
  ensureWarmUp("image");

  try {
    await handleUploadFlow(files, "local");
  } catch (error) {
    console.error("Error uploading files:", error);
  }
};

async function uploadLocalFiles(event) {
  const selectedLocalFiles = Array.from(event.target.files);
  if (selectedLocalFiles.length === 0) return;

  // Validar límites antes de proceder
  const validation = validateUploadLimits(selectedLocalFiles.length);
  if (!validation.isValid) {
    message.error(validation.message);
    event.target.value = ""; // Clear the input
    return;
  }

  // Trigger warm up when files are selected
  //ensureWarmUp("image");

  try {
    await handleUploadFlow(selectedLocalFiles, "local");
  } finally {
    event.target.value = "";
  }
}

/**
 * Importa fotos desde Google Photos Picker
 */
async function importFromGooglePhotos() {
  try {
    // Validar límites antes de abrir el picker
    const validation = validateUploadLimits(100); // Max 100 photos
    if (!validation.isValid) {
      message.error(validation.message);
      return;
    }

    // Usar el método importPhotos que maneja selección + descarga
    const downloadResults = await googlePhotos.importPhotos(100, 5);

    if (!downloadResults || downloadResults.length === 0) {
      return;
    }

    const successfulDownloads = downloadResults.filter((r) => r.success);

    if (successfulDownloads.length === 0) {
      message.warning("No photos were successfully downloaded");
      return;
    }

    // Validar límites reales después de la descarga
    const finalValidation = validateUploadLimits(successfulDownloads.length);
    if (!finalValidation.isValid) {
      message.error(finalValidation.message);
      return;
    }

    // Trigger warm up
    ensureWarmUp("image");

    // Process and upload photos using handleUploadFlow
    await handleUploadFlow(
      successfulDownloads.map((result) => ({
        googlePhotoBlob: result.blob,
        googlePhotoMediaItem: result.mediaItem,
      })),
      "google",
    );

    message.success(
      `Successfully imported ${successfulDownloads.length} photos from Google Photos`,
    );
  } catch (error) {
    console.error("❌ Error importing from Google Photos:", error);
  }
}

async function importFromDropbox() {
  try {
    const validation = validateUploadLimits(100);
    if (!validation.isValid) {
      message.error(validation.message);
      return;
    }

    const downloadResults = await dropbox.importPhotos(5);

    if (!downloadResults || downloadResults.length === 0) {
      return;
    }

    const successfulDownloads = downloadResults.filter((r) => r.success);

    if (successfulDownloads.length === 0) {
      message.warning("No photos were successfully downloaded from Dropbox");
      return;
    }

    const finalValidation = validateUploadLimits(successfulDownloads.length);
    if (!finalValidation.isValid) {
      message.error(finalValidation.message);
      return;
    }

    ensureWarmUp("image");

    await handleUploadFlow(
      successfulDownloads.map((result) => ({
        dropboxBlob: result.blob,
        dropboxFile: result.file,
      })),
      "dropbox",
    );

    message.success(
      `Successfully imported ${successfulDownloads.length} photos from Dropbox`,
    );
  } catch (error) {
    console.error("❌ Error importing from Dropbox:", error);
  }
}

// Handler to check if source warning should be shown
const handleSourceSelection = (source, callback) => {
  const preferredSource = userStore.user?.preferredSource || "web";

  // Check if we need to show a warning
  if (
    (preferredSource === "lightroom" && source !== "lightroom") ||
    (preferredSource === "web" && source === "lightroom")
  ) {
    pendingSourceAction.value = source;
    showSourceWarningModal.value = true;
  } else {
    // No warning needed, execute directly
    callback();
  }
};

// Confirm source warning and proceed with action
const confirmSourceWarning = () => {
  showSourceWarningModal.value = false;
  const source = pendingSourceAction.value;

  if (source === "local") {
    fileInput.value?.click();
  } else if (source === "lightroom") {
    showLightroomModal.value = true;
  } else if (source === "google") {
    importFromGooglePhotos();
  } else if (source === "dropbox") {
    importFromDropbox();
  }

  pendingSourceAction.value = null;
};

// Cancel source warning
const cancelSourceWarning = () => {
  showSourceWarningModal.value = false;
  pendingSourceAction.value = null;
};

// Con Picker API, la subida se puede hacer directamente tras triggerGooglePhotos si es necesario

const closeAnalyzeDialog = () => {
  showAnalyzeDialog.value = false;
};

const openAnalyzeDialog = () => {
  showAnalyzeDialog.value = true;
};

const confirmAnalyze = () => {
  showAnalyzeDialog.value = false;
  let selectedIds = localSelectedCount.value > 0 ? localSelectedIds.value : [];
  // When unique filter is active and no manual selection, analyze only unique photos
  if (
    selectedIds.length === 0 &&
    isDuplicateFilterActive.value === "non-duplicates"
  ) {
    selectedIds = filteredUniqueIds.value;
  }
  emit("on-analyze", {
    fastMode: fastMode.value,
    selectedIds,
  });
};

// Exponer openAnalyzeDialog para uso del componente padre
defineExpose({
  openAnalyzeDialog,
});
</script>

<style scoped>
/* Upload Section - extends global empty-state classes */
.upload-subtitle {
  margin-bottom: 32px;
}

.upload-buttons {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  justify-content: center;
  flex-wrap: wrap;
  flex-direction: column;
}

.upload-btn {
  min-width: 120px;
}

.google-photos-btn {
  min-width: 120px;
}

.lightroom-btn {
  min-width: 120px;
}

.file-formats {
  color: var(--text-primary);
  font-size: 14px;
}

.compact-upload-btn {
  min-width: 120px;
}

.compact-upload-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.compact-upload-section.compact-drag-over {
  background-color: var(--bg-surface);
  border: 2px dashed var(--accent-color);
  border-radius: 8px;
  padding: 8px;
  margin: 8px 0;
}

.compact-google-photos-btn {
  min-width: 160px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.controls-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding: 8px 12px;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  border: 1px solid #2c2c32;
}

/* Upload Progress Section */
.upload-progress-section {
  background-color: var(--bg-surface);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid #2c2c32;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.progress-title-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.preprocessing-spinner {
  color: var(--primary-color);
}

.progress-count {
  font-size: 14px;
  color: var(--text-primary);
}

.overall-progress {
  margin-bottom: 8px;
}

.progress-text {
  font-size: 14px;
  color: var(--text-primary);
  text-align: center;
}

/* Maintenance Mode Section */
.maintenance-section {
  margin-bottom: 48px;
}

.maintenance-container {
  border: 2px solid #f59e0b;
  border-radius: 16px;
  padding: 48px 32px;
  text-align: center;
  background: linear-gradient(
    135deg,
    rgba(245, 158, 11, 0.1) 0%,
    rgba(245, 158, 11, 0.05) 100%
  );
}

.maintenance-content {
  max-width: 500px;
  margin: 0 auto;
}

.maintenance-icon {
  margin-bottom: 24px;
}

.maintenance-title {
  font-size: 24px;
  font-weight: 600;
  color: #f59e0b;
  margin: 0 0 16px 0;
}

.maintenance-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0 0 32px 0;
  line-height: 1.5;
}

.maintenance-features {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
  align-items: flex-start;
  max-width: 320px;
  margin-left: auto;
  margin-right: auto;
}

.maintenance-feature {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--text-primary);
}

.maintenance-message {
  padding: 20px;
  background-color: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.maintenance-message p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Responsive */

.selected-badge {
  background-color: var(--primary-color);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  margin-left: 8px;
}

@media (max-width: 768px) {
  .tab-content {
    padding: var(--spacing-lg);
  }

  .filter-controls {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .upload-buttons {
    flex-direction: column;
    width: 100%;
  }

  .upload-btn,
  .google-photos-btn,
  .lightroom-btn {
    width: 100%;
    min-width: unset;
  }

  .compact-upload-buttons {
    flex-direction: row;
    width: auto;
    gap: 8px;
  }

  /* Icon-only buttons on mobile */
  .compact-upload-buttons .n-button {
    width: auto;
    min-width: 44px;
    padding: 0 12px;
  }

  /* Hide text label on mobile */
  .compact-upload-buttons .button-label {
    display: none;
  }

  .compact-upload-buttons .n-button .n-icon {
    font-size: 20px !important;
    margin: 0 !important;
  }

  .sync-area-header {
    align-items: flex-start;
    gap: 8px;
  }

  .upload-progress-section {
    padding: 16px;
  }

  .progress-title {
    font-size: 16px;
  }

  .maintenance-container {
    padding: 32px 20px;
  }

  .maintenance-title {
    font-size: 20px;
  }
}

@media (max-width: 480px) {
  .tab-content {
    padding: var(--spacing-md);
  }

  .upload-progress-section {
    padding: 12px;
  }

  .progress-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}

/* First Import State - Onboarding continuation styles */
.first-import-section {
  margin-top: 24px;
  margin-bottom: 48px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.first-import-header {
  text-align: center;
  margin-bottom: 40px;
}

.first-import-title {
  margin: 0 0 8px 0;
  font-size: 32px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: -0.025em;
}

.first-import-subtitle {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 400;
}

.import-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  max-width: 1100px;
  margin: 0 auto 32px;
}

.import-cards-grid.single {
  grid-template-columns: 1fr;
  max-width: 350px;
}

.import-card {
  background-color: var(--bg-surface);
  border: 2px solid var(--border-color);
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.import-card:hover {
  border-color: #4c4c52;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.import-card:hover:not(.drag-over) {
  border-color: var(--accent-color);
  background-color: var(--bg-surface);
}

.import-card.drag-over {
  border-color: var(--accent-color);
  background-color: var(--bg-surface);
  box-shadow: 0 4px 16px var(--bg-surface);
}

.import-card-icon {
  margin-bottom: 16px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.import-card-icon .google-photos-logo {
  height: 56px;
  width: auto;
  object-fit: contain;
}

.import-card-icon .lightroom-logo {
  height: 60px;
  width: auto;
  object-fit: contain;
}

.import-card-icon .dropbox-logo {
  height: 48px;
  width: auto;
  object-fit: contain;
}

.import-card-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
}

.import-card-description {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}

.first-import-footer {
  text-align: center;
  color: var(--text-primary);
  font-size: 14px;
}

/* Responsive for first import section */
@media (max-width: 768px) {
  .first-import-title {
    font-size: 24px;
  }

  .import-cards-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .import-card {
    padding: 24px 20px;
  }
}

@media (max-width: 480px) {
  .first-import-title {
    font-size: 22px;
  }

  .import-card-title {
    font-size: 16px;
  }
}
</style>
