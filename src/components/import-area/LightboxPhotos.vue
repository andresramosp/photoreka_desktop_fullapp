<template>
  <div class="tab-content">
    <DuplicatePhotosDialog
      v-model="showDuplicatesDialog"
      :duplicates="selectedDuplicates"
    />

    <LightroomModal v-model="showLightroomModal" />

    <SafeSearchViolationModal v-model:show="showSafeSearchViolationModal" />

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
      :style="{ width: '500px', maxWidth: '95vw' }"
    >
      <n-card
        :bordered="false"
        role="dialog"
        aria-modal="true"
        class="analyze-confirm-card"
      >
        <template #header>
          <div class="analyze-confirm-header">
            <n-icon size="20" color="var(--primary-color)">
              <RocketLaunchOutlined />
            </n-icon>
            <span>Confirm Analysis</span>
          </div>
        </template>
        <template #header-extra>
          <n-button text @click="closeAnalyzeDialog" aria-label="Close">
            <n-icon size="18" color="var(--text-secondary)">
              <CloseOutline />
            </n-icon>
          </n-button>
        </template>

        <div class="analyze-confirm-body">
          <p class="analyze-confirm-description">
            You are about to process
            <strong
              >{{ selectedCount }} photo{{
                selectedCount !== 1 ? "s" : ""
              }}</strong
            >. Once started, it cannot be reversed. Do you want to continue?
          </p>

          <div class="analyze-confirm-info-box">
            <div class="analyze-confirm-info-header">
              <n-icon size="15" color="var(--info-color)">
                <InformationCircleOutline />
              </n-icon>
              <span class="analyze-confirm-info-title"
                >Estimated processing time</span
              >
            </div>
            <p class="analyze-confirm-info-text">
              Approximately <strong>{{ estimatedTime }}</strong> for
              {{ selectedCount }} photo{{ selectedCount !== 1 ? "s" : "" }}.
              This is an estimate — actual times may vary during periods of high
              demand.
            </p>
          </div>
        </div>

        <template #footer>
          <div class="analyze-confirm-footer">
            <n-button tertiary @click="closeAnalyzeDialog">Cancel</n-button>
            <n-button type="info" @click="confirmAnalyze"
              >Start Analysis</n-button
            >
          </div>
        </template>
      </n-card>
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
          <SpiralGridLoader
            v-if="overallProgress >= 100 && isPreprocessing"
            variant="primary"
            :size="18"
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
      class="import-area-header"
    >
      <n-icon size="18" color="var(--primary-color)">
        <BookInformation20Regular />
      </n-icon>
      <h3 class="import-area-title">
        Photo upload and preview area. Click on Analyze Photos to
        <strong>start processing</strong>
      </h3>
      <button
        v-show="lightboxPhotos.length > 0 && !isMobile"
        class="time-estimate-trigger"
        @click="showTimeEstimateDialog = true"
      >
        <n-icon :size="11"><TimeOutline /></n-icon>
        How long will my analysis take?
      </button>
    </div>

    <EstimatedTimeModal v-model:show="showTimeEstimateDialog" />

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

    <!-- Import State - unified for first-time and returning users -->
    <div
      v-if="!isMaintenanceMode && lightboxPhotos.length === 0"
      class="first-import-section"
    >
      <div class="first-import-header">
        <template v-if="isFirstImportState">
          <h1 class="first-import-title">
            Your Lightbox is ready to get started
          </h1>
          <p class="first-import-subtitle">
            Import your first batch of photos to start exploring Photoreka's
            features
          </p>
        </template>
        <template v-else>
          <h1
            v-if="isUploadDisabled && photosRemaining <= 0"
            class="first-import-title"
          >
            Upload limit reached
          </h1>
          <!-- <h1 v-else class="first-import-title">
            Continue expanding your catalog
          </h1>
          <p class="first-import-subtitle">
            {{
              isUploadDisabled
                ? uploadDisabledMessage
                : "Add more photos using one of the following options"
            }}
          </p> -->
        </template>
      </div>

      <!-- Upload source cards: single source of truth (see `emptyStateSources`
           in the script). Handles web-first, lightroom-first-first-time
           (Lightroom only) and lightroom-first-returning-user cases. -->
      <div
        class="import-cards-grid"
        :class="{ single: emptyStateSources.length === 1 }"
      >
        <div
          v-for="source in emptyStateSources"
          :key="source.key"
          class="import-card"
          :class="{
            'lightroom-card': source.key === 'lightroom',
            'drag-over': source.draggable && isDragOver && !source.disabled,
            'import-card--disabled': source.disabled,
          }"
          @click="handleSourceSelection(source.key, source.action)"
          @dragover.prevent="
            source.draggable && !source.disabled && handleDragOver($event)
          "
          @dragenter.prevent="
            source.draggable && !source.disabled && handleDragEnter($event)
          "
          @dragleave.prevent="
            source.draggable && !source.disabled && handleDragLeave($event)
          "
          @drop.prevent="source.draggable && handleDrop($event)"
        >
          <div class="import-card-icon">
            <UploadSourceIcon
              :source="source"
              size="48"
              :img-class="source.iconClass"
            />
          </div>
          <h4 class="import-card-title">{{ source.cardTitle }}</h4>
          <p class="import-card-description">{{ source.cardDescription }}</p>
          <n-tag :type="source.tagType" size="large" round>
            {{ source.tagText }}
          </n-tag>
        </div>
      </div>
    </div>

    <!-- Mobile Upload Buttons (visible only on mobile, desktop uses the slot inside PhotosGrid) -->
    <div
      v-if="!isMaintenanceMode && lightboxPhotos.length > 0"
      class="mobile-upload-buttons"
    >
      <n-button
        v-for="source in orderedSources"
        :key="source.key"
        type="default"
        size="small"
        :disabled="source.disabled"
        @click.stop="handleSourceSelection(source.key, source.action)"
      >
        <template #icon>
          <UploadSourceIcon
            :source="source"
            :img-style="{ width: '1.1em', height: '1.1em' }"
          />
        </template>
        {{ source.compactLabel }}
      </n-button>
    </div>

    <!-- Uploaded Photos -->
    <div v-if="lightboxPhotos.length > 0" class="uploaded-photos-section">
      <!-- Photos Grid Component -->
      <PhotosGrid
        :photos="filteredPhotos"
        :displaySendToChat="false"
        :displayAddToCollection="false"
        :displayMoveToTool="false"
        :hideControls="true"
        :findDuplicatesEnabled="true"
        :scrollable="true"
        context="lightbox"
        @selection-change="handleSelectionChange"
        @duplicates-filter-change="handleDuplicatesFilterChange"
      >
        <template v-if="!isMaintenanceMode" #row1-extra>
          <div class="compact-upload-buttons">
            <n-tooltip
              v-for="source in orderedSources"
              :key="source.key"
              trigger="hover"
              placement="bottom"
            >
              <template #trigger>
                <n-button
                  type="default"
                  size="small"
                  :disabled="source.disabled"
                  @click.stop="handleSourceSelection(source.key, source.action)"
                >
                  <template #icon>
                    <UploadSourceIcon
                      :source="source"
                      :img-style="{ width: '1em', height: '1em' }"
                    />
                  </template>
                  <span class="button-label">{{
                    source.disabled &&
                    photosRemaining <= 0 &&
                    source.key === "local"
                      ? "Upload Limit Reached"
                      : source.compactLabel
                  }}</span>
                </n-button>
              </template>
              {{ source.compactLabel }}
            </n-tooltip>
          </div>
        </template>
      </PhotosGrid>
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
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePhotosStore } from "@/stores/photos.js";
import { useUserStore } from "@/stores/userStore.ts";
import { usePhotoUpload } from "@/composables/usePhotoUpload.js";
import { useWarmUp } from "@/composables/useWarmUp.js";
import { useGooglePhotos } from "@/composables/useGooglePhotos.js";
import { useDropbox } from "@/composables/useDropbox.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import {
  FolderOpen,
  CloudUploadOutline,
  CloseOutline,
  InformationCircleOutline,
  TimeOutline,
} from "@vicons/ionicons5";
import { RocketLaunchOutlined } from "@vicons/material";
import { BookInformation20Regular } from "@vicons/fluent";
import pLimit from "p-limit";
import pica from "pica";
import googlePhotosIconUrl from "@/assets/logos/google_photos.png";
import dropboxIconUrl from "@/assets/logos/dropbox.svg";
import lightroomIconUrl from "@/assets/logos/lightroom_logo.png";

import PhotosGrid from "../PhotosGrid.vue";
import DuplicatePhotosDialog from "../DuplicatePhotosDialog.vue";
import LightroomModal from "../LightroomModal.vue";
import SafeSearchViolationModal from "../SafeSearchViolationModal.vue";
import EstimatedTimeModal from "./EstimatedTimeModal.vue";
import UploadSourceIcon from "./UploadSourceIcon.vue";

import { NModal, NCheckbox, NTooltip } from "naive-ui";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";

import { useMessage } from "naive-ui";

const route = useRoute();
const router = useRouter();

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

// Google Photos composable
const googlePhotos = useGooglePhotos();
// Dropbox composable
const dropbox = useDropbox();
const { isMobile } = useIsMobile();
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
  showSafeSearchViolationModal,
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

// ---------------------------------------------------------------------------
// Single source of truth for every upload source (Local, Lightroom, Google
// Photos, Dropbox). This one definition drives:
//  - the empty-state cards (first import / returning user)
//  - the mobile button strip
//  - the compact buttons inside PhotosGrid
// To add/remove a source or change its order, edit `sourceDefinitions` /
// `SOURCE_ORDER` below — nothing else in the template hardcodes sources.
// ---------------------------------------------------------------------------

// Order in which sources appear, keyed by the user's preferred export source.
const SOURCE_ORDER = {
  lightroom: ["lightroom", "local", "google", "dropbox"],
  web: ["local", "google", "dropbox", "lightroom"],
};

const sourceDefinitions = computed(() => ({
  local: {
    key: "local",
    enabled: true,
    // Uploading counts against the plan limit / is blocked during
    // maintenance or while another upload is in progress.
    disabled: isUploadDisabled.value,
    compactLabel: "Local Files",
    cardTitle: "Local Files",
    cardDescription: "Import photos by browsing your local files",
    tagType: "primary",
    tagText: isFirstImportState.value ? "Recommended" : "Select files",
    iconType: "component",
    iconComponent: FolderOpen,
    iconColor: "var(--primary-color)",
    draggable: true,
    action: triggerFileInput,
  },
  lightroom: {
    key: "lightroom",
    enabled: true,
    // Opening the Lightroom instructions modal isn't an upload, so it's
    // never blocked by maintenance mode or the upload limit.
    disabled: false,
    compactLabel: "Plugin",
    cardTitle: "Official Plugin",
    cardDescription: "Export from LrC and work in the web version",
    tagType: "success",
    tagText: "See instructions",
    iconType: "img",
    iconSrc: lightroomIconUrl,
    iconAlt: "Adobe Lightroom",
    iconClass: "lightroom-logo",
    draggable: false,
    action: () => {
      showLightroomModal.value = true;
    },
  },
  google: {
    key: "google",
    // Disabled: Google Photos import is turned off for now. Set to `true`
    // to re-enable it everywhere (cards + buttons) — no template changes needed.
    enabled: false,
    disabled: isUploadDisabled.value,
    compactLabel: "Google Photos",
    cardTitle: "Google Photos",
    cardDescription: googlePhotos.isAuthorized.value
      ? "Import from your Google Photos library"
      : "Connect and import your photos from Google Photos",
    tagType: googlePhotos.isAuthorized.value ? "success" : "warning",
    tagText: googlePhotos.isAuthorized.value ? "Connected" : "Disconnected",
    // Always show the actual Google Photos logo — connection state is
    // already conveyed by the tag above, not by swapping the icon.
    iconType: "img",
    iconSrc: googlePhotosIconUrl,
    iconAlt: "Google Photos",
    iconClass: "google-photos-logo",
    draggable: false,
    action: importFromGooglePhotos,
  },
  dropbox: {
    key: "dropbox",
    enabled: true,
    disabled: isUploadDisabled.value,
    compactLabel: "Dropbox",
    cardTitle: "Dropbox",
    cardDescription: "Import photos directly from your Dropbox",
    tagType: "info",
    tagText: "Select files",
    iconType: "img",
    iconSrc: dropboxIconUrl,
    iconAlt: "Dropbox",
    iconClass: "dropbox-logo",
    draggable: false,
    action: importFromDropbox,
  },
}));

// Ordered + enabled sources, shared by the empty-state cards and the
// mobile/compact buttons.
const orderedSources = computed(() => {
  const order = SOURCE_ORDER[preferredSource.value] || SOURCE_ORDER.web;
  return order
    .map((key) => sourceDefinitions.value[key])
    .filter((source) => source && source.enabled);
});

// The empty-state grid has one extra rule: first-time users whose preferred
// source is Lightroom only ever see the Lightroom card (onboarding
// continuation), everyone else sees the full ordered list.
const emptyStateSources = computed(() => {
  if (isFirstImportState.value && preferredSource.value === "lightroom") {
    return orderedSources.value.filter((source) => source.key === "lightroom");
  }
  return orderedSources.value;
});

// Check for lrPlugin query parameter on mount
onMounted(() => {
  if (route.query.lrPlugin === "open") {
    showLightroomModal.value = true;
    // Clean up the query parameter
    router.replace({ query: { ...route.query, lrPlugin: undefined } });
  }
});

// Watcher para activar warm-up cuando el progreso llega al 75%
watch(overallProgress, (newProgress) => {
  if (newProgress >= 75 && !warmUpTriggeredAt75.value && isUploading.value) {
    warmUpTriggeredAt75.value = true;
  }

  // Reset del flag cuando la subida termina
  if (!isUploading.value) {
    warmUpTriggeredAt75.value = false;
  }
});

// When the upload progress section disappears, the grid shifts up inside a
// fixed-height container, so document.body never resizes and PhotosGrid's
// ResizeObserver never fires. Dispatching a resize event forces it to
// recalculate the scroll-area height.
watch(isAnyOperationInProgress, (inProgress, wasInProgress) => {
  if (wasInProgress && !inProgress) {
    nextTick(() => window.dispatchEvent(new Event("resize")));
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
  },
  set(value) {
    // Para casos donde se necesite override manual
    fastModeOverride.value = value;
  },
});
const showAnalyzeDialog = ref(false);
const showTimeEstimateDialog = ref(false);

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

const estimatedTime = computed(() => {
  const count = selectedCount.value;
  if (count < 30) return "2 – 10 minutes";
  if (count <= 100) return "1 – 3 hours";
  if (count <= 500) return "2 – 6 hours";
  if (count <= 1000) return "3 – 8 hours";
  return "4 – 12 hours";
});

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

/* Mobile-only upload strip */
.mobile-upload-buttons {
  display: none;
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

  /* Mobile-only upload strip */
  .mobile-upload-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
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

  .import-area-header {
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

/* Analyze Confirm Modal */
.analyze-confirm-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.analyze-confirm-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.analyze-confirm-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.analyze-confirm-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.analyze-confirm-info-box {
  background-color: color-mix(in srgb, var(--info-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--info-color) 25%, transparent);
  border-left: 3px solid var(--info-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.analyze-confirm-info-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.analyze-confirm-info-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--info-color);
}

.analyze-confirm-info-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.analyze-confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* Time estimate trigger button */
.time-estimate-trigger {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0;
  background: none;
  border: none;
  font-size: var(--font-size-sm);
  color: var(--accent-color);
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 0.15s;
  line-height: 1.4;
  margin-left: auto;
  flex-shrink: 0;
  white-space: nowrap;
}
.time-estimate-trigger:hover {
  opacity: 1;
}

/* First Import State - Onboarding continuation styles */
.first-import-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-bottom: 0;
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
  font-size: 30px;
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
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 24px;
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 8px;
  margin: 0 auto 32px;
}

.import-cards-grid.single {
  justify-content: center;
  overflow-x: visible;
}

.import-card {
  flex: 0 0 260px;
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
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.import-card--disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
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

.import-card-icon :deep(.google-photos-logo) {
  height: 56px;
  width: auto;
  object-fit: contain;
}

.import-card-icon :deep(.lightroom-logo) {
  height: 60px;
  width: auto;
  object-fit: contain;
}

.import-card-icon :deep(.dropbox-logo) {
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
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-start;
    overflow-x: visible;
    overflow-y: visible;
    gap: 16px;
    padding-left: 12px;
    padding-right: 12px;
    box-sizing: border-box;
  }

  .import-card {
    flex: 0 0 auto;
    width: 96%;
    max-width: 420px;
    padding: 22px 18px;
  }
}

@media (max-width: 480px) {
  .first-import-title {
    font-size: 22px;
  }

  .import-card {
    width: 94%;
    padding: 20px 16px;
  }

  .import-card-title {
    font-size: 16px;
  }
}
</style>
