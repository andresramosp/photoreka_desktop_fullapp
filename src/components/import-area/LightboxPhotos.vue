<template>
  <div class="tab-content">
    <LightroomModal v-model="showLightroomModal" />

    <ImagePolicyInfoDialog v-model:show="showImagePolicyInfo" />

    <SafeSearchViolationModal
      v-model:show="showSafeSearchViolationModal"
      :deactivated="safeSearchUserDeactivated"
    />

    <SourceWarningModal
      :show="showSourceWarningModal"
      :title="sourceWarningConfig?.title"
      :message="sourceWarningConfig?.message"
      @cancel="cancelSourceWarning"
      @confirm="confirmSourceWarning"
    />

    <FolderReviewModal
      :show="showFolderReviewModal"
      :folder-groups="stagedFolderGroups"
      :total-count="stagedTotalCount"
      v-model:mirror-folder-structure="mirrorFolderStructure"
      @cancel="cancelFolderReview"
      @add-folder="triggerFolderInput"
      @remove-folder="removeStagedFolder"
      @import="importStagedFolders"
    />

    <AnalysisQuotaWarningModal
      :show="showAnalysisQuotaWarningModal"
      :context="analysisQuotaWarningContext"
      v-model:dont-show-again="dontShowAnalysisQuotaWarningAgain"
      @cancel="cancelAnalysisQuotaWarning"
      @confirm="confirmAnalysisQuotaWarning"
      @go-to-settings="goToSettingsFromQuotaWarning"
    />

    <LightboxCapacityModal
      :show="showLightboxCapacityModal"
      :capacity="lightboxCapacityContext.capacity"
      :current-count="lightboxCapacityContext.currentCount"
      :attempted-count="lightboxCapacityContext.attemptedCount"
      @close="closeLightboxCapacityModal"
      @go-to-settings="goToSettingsFromCapacityModal"
    />

    <AnalyzeConfirmModal
      :show="showAnalyzeDialog"
      :selected-count="selectedCount"
      :estimated-time="estimatedTime"
      :is-analyzing="isAnalyzing"
      @cancel="closeAnalyzeDialog"
      @confirm="confirmAnalyze"
    />

    <FirstAnalysisMinimumModal
      :show="showFirstAnalysisMinimumModal"
      :selected-count="selectedCount"
      :min-required="MIN_PHOTOS_FIRST_ANALYSIS"
      :photos-needed="firstAnalysisPhotosNeeded"
      :progress-percent="firstAnalysisProgressPercent"
      :is-recommendation="isFirstAnalysisMinimumRecommendation"
      v-model:dont-show-again="dontShowFirstAnalysisMinimumWarningAgain"
      @close="closeFirstAnalysisMinimumModal"
      @continue-anyway="continueAnywayFromFirstAnalysisModal"
      @add-more-photos="handleAddMorePhotosFromFirstAnalysisModal"
    />

    <div v-if="isAnyOperationInProgress" class="upload-progress-section">
      <div class="progress-header">
        <div class="progress-title-container">
          <h3 class="progress-title">
            {{ progressTitle }}
          </h3>
          <span v-if="progressStepText" class="progress-step">
            {{ progressStepText }}
          </span>
          <SpiralGridLoader
            v-if="isFinalizing || (overallProgress >= 100 && isPreprocessing)"
            variant="primary"
            :size="16"
            class="preprocessing-spinner"
          />
        </div>
        <div class="progress-meta">
          <span class="progress-count">{{ progressCountText }}</span>
          <span class="progress-percentage"
            >{{ Math.round(actualProgress) }}%</span
          >
        </div>
      </div>
      <n-progress
        type="line"
        :percentage="actualProgress"
        :show-indicator="false"
        :height="10"
        class="overall-progress"
      />
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

    <!-- Fotos sin EXIF detectadas antes de arrancar la subida -->
    <MissingExifModal
      v-model:show="showMissingExifModal"
      :stats="missingExifStats"
      v-model:dont-show-again="dontShowMissingExifWarningAgain"
      @continue="resolveMissingExifWarning(true)"
      @cancel="resolveMissingExifWarning(false)"
    />

    <!-- Duplicados detectados automáticamente al terminar una importación -->
    <DuplicatesFoundModal
      v-model:show="showDuplicatesFoundModal"
      :batch-count="duplicatesFound.batch"
      :workspace-count="duplicatesFound.workspace"
      :total-count="duplicatesFound.total"
      :auto-check-limit="AUTO_DUPLICATES_CHECK_MAX_WORKSPACE_PHOTOS"
      v-model:dont-show-again="dontShowDuplicatesWarningAgain"
      @review="handleReviewImportDuplicates"
      @dismiss="handleDismissImportDuplicates"
    />

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
            'import-card--static': source.cardClickable === false,
          }"
          @click="
            source.cardClickable !== false &&
            handleSourceSelection(source.key, source.action)
          "
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
          <div v-if="source.subActions" class="import-card-actions">
            <n-button
              v-for="sub in source.subActions"
              :key="sub.key"
              size="small"
              round
              :type="
                sub.connected === undefined
                  ? 'primary'
                  : sub.connected
                    ? 'success'
                    : 'default'
              "
              :secondary="sub.connected !== undefined"
              class="import-card-action-button"
              @click.stop="handleSourceSelection(source.key, sub.action)"
            >
              <template v-if="sub.icon || sub.iconSrc" #icon>
                <img
                  v-if="sub.iconSrc"
                  :src="sub.iconSrc"
                  :alt="sub.label"
                  class="sub-action-icon"
                />
                <n-icon v-else :component="sub.icon" />
              </template>
              {{ sub.label }}
            </n-button>
          </div>
          <n-tag v-else :type="source.tagType" size="large" round>
            {{ source.tagText }}
          </n-tag>
        </div>
      </div>

      <!-- Supported formats + privacy disclosure -->
      <div class="import-disclosure">
        <p class="import-disclosure-formats">
          Supported formats: JPEG, PNG, WebP
        </p>
        <p class="import-disclosure-links">
          <n-button
            text
            class="import-disclosure-link"
            @click="showImagePolicyInfo = true"
          >
            Learn more
          </n-button>
          <span class="import-disclosure-sep">·</span>
          <a
            class="import-disclosure-link"
            href="https://www.photoreka.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Image policy
          </a>
        </p>
      </div>
    </div>

    <!-- Mobile Upload Buttons (visible only on mobile, desktop uses the slot inside PhotosGrid) -->
    <div
      v-if="!isMaintenanceMode && lightboxPhotos.length > 0"
      class="mobile-upload-buttons"
    >
      <template v-for="source in orderedSources" :key="source.key">
        <n-dropdown
          v-if="source.subActions"
          trigger="click"
          :options="subActionOptions(source)"
          @select="(key) => handleSubActionSelect(source, key)"
        >
          <n-button type="default" size="small" :disabled="source.disabled">
            <template #icon>
              <UploadSourceIcon
                :source="source"
                :img-style="{ width: '1.1em', height: '1.1em' }"
              />
            </template>
            {{ source.compactLabel }}
          </n-button>
        </n-dropdown>
        <n-button
          v-else
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
      </template>
    </div>

    <!-- Uploaded Photos -->
    <div v-if="lightboxPhotos.length > 0" class="uploaded-photos-section">
      <!-- Photos Grid Component -->
      <PhotosGrid
        ref="photosGridRef"
        :photos="filteredPhotos"
        :displaySendToChat="false"
        :displayAddToCollection="false"
        :displayMoveToTool="false"
        :hideControls="true"
        :findDuplicatesEnabled="true"
        :isLightbox="true"
        :scrollable="true"
        context="lightbox"
        @selection-change="handleSelectionChange"
        @duplicates-filter-change="handleDuplicatesFilterChange"
      >
        <template v-if="!isMaintenanceMode" #row1-extra>
          <div class="compact-upload-buttons">
            <template v-for="source in orderedSources" :key="source.key">
              <n-dropdown
                v-if="source.subActions"
                trigger="click"
                :options="subActionOptions(source)"
                @select="(key) => handleSubActionSelect(source, key)"
              >
                <n-button
                  type="default"
                  size="small"
                  :disabled="source.disabled"
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
              </n-dropdown>
              <n-tooltip v-else trigger="hover" placement="bottom">
                <template #trigger>
                  <n-button
                    type="default"
                    size="small"
                    :disabled="source.disabled"
                    @click.stop="
                      handleSourceSelection(source.key, source.action)
                    "
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
            </template>
          </div>
        </template>
      </PhotosGrid>
    </div>

    <!-- Hidden Inputs: individual files vs whole folder (webkitdirectory) -->
    <input
      ref="fileInput"
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp"
      style="display: none"
      @change="uploadLocalFiles"
    />
    <input
      ref="folderInput"
      type="file"
      webkitdirectory
      multiple
      style="display: none"
      @change="stageFolderSelection"
    />
  </div>
</template>

<script setup>
import { computed, h, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePhotosStore } from "@/stores/photos.js";
import { useUserStore } from "@/stores/userStore.ts";
import {
  usePhotoUpload,
  DUPLICATES_WARNING_DISMISS_KEY,
  AUTO_DUPLICATES_CHECK_MAX_WORKSPACE_PHOTOS,
} from "@/composables/usePhotoUpload.js";
import { useWarmUp } from "@/composables/useWarmUp.js";
import { useGooglePhotos } from "@/composables/useGooglePhotos.js";
import { useGoogleDrive } from "@/composables/useGoogleDrive.js";
import { useDropbox } from "@/composables/useDropbox.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import {
  FolderOutline,
  CloudUploadOutline,
  ImagesOutline,
  TimeOutline,
} from "@vicons/ionicons5";
import { BookInformation20Regular } from "@vicons/fluent";
import googleLogoIconUrl from "@/assets/logos/google_logo.svg";
import googlePhotosIconUrl from "@/assets/logos/google_photos.png";
import googleDriveIconUrl from "@/assets/logos/google_drive.svg";
import dropboxIconUrl from "@/assets/logos/dropbox.svg";
import lightroomIconUrl from "@/assets/logos/lightroom_logo.png";

import PhotosGrid from "../PhotosGrid.vue";
import LightroomModal from "../LightroomModal.vue";
import SafeSearchViolationModal from "../SafeSearchViolationModal.vue";
import EstimatedTimeModal from "./EstimatedTimeModal.vue";
import DuplicatesFoundModal from "./DuplicatesFoundModal.vue";
import MissingExifModal from "./MissingExifModal.vue";
import LightboxCapacityModal from "./LightboxCapacityModal.vue";
import UploadSourceIcon from "./UploadSourceIcon.vue";
import ImagePolicyInfoDialog from "./lightbox/ImagePolicyInfoDialog.vue";
import SourceWarningModal from "./lightbox/SourceWarningModal.vue";
import FolderReviewModal from "./lightbox/FolderReviewModal.vue";
import AnalysisQuotaWarningModal from "./lightbox/AnalysisQuotaWarningModal.vue";
import AnalyzeConfirmModal from "./lightbox/AnalyzeConfirmModal.vue";
import FirstAnalysisMinimumModal from "./lightbox/FirstAnalysisMinimumModal.vue";

import { NTooltip, NDropdown, NIcon } from "naive-ui";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import { useActivityLogger } from "@/composables/useActivityLogger";

import { useDialog, useMessage } from "naive-ui";

const configuredMinPhotosFirstAnalysis = Number(
  import.meta.env.VITE_MIN_PHOTOS_FIRST_ANALYSIS ?? 0,
);
const MIN_PHOTOS_FIRST_ANALYSIS =
  Number.isFinite(configuredMinPhotosFirstAnalysis) &&
  configuredMinPhotosFirstAnalysis > 0
    ? Math.ceil(configuredMinPhotosFirstAnalysis)
    : 0;
// "restriction" (default, blocks the analysis) or "recommendation" (dismissible,
// with a "don't show again" checkbox that lets the user proceed anyway).
const isFirstAnalysisMinimumRecommendation =
  (import.meta.env.VITE_FIRST_ANALYSIS_MINIMUM_MODE || "").toLowerCase() ===
  "recommendation";

const route = useRoute();
const router = useRouter();

// Maintenance mode check
const isMaintenanceMode = computed(
  () => import.meta.env.VITE_MAINTENANCE_MODE === "true",
);

const props = defineProps({
  isAnalyzing: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "on-analyze",
  "selection-change",
  "duplicates-filter-change",
]);
const photosStore = usePhotosStore();
const userStore = useUserStore();
const message = useMessage();
const dialog = useDialog();
const { logActivity } = useActivityLogger();

// Google Photos composable
const googlePhotos = useGooglePhotos();
// Google Drive composable
const googleDrive = useGoogleDrive();
// Beta cerrada: Google Drive import solo visible para estos emails mientras
// se valida la integración (drive.file requiere su propia verificación OAuth
// con Google antes de salir a todos los usuarios).
const GOOGLE_DRIVE_IMPORT_BETA_EMAILS = ["andreschennai@gmail.com"];
const canImportFromGoogleDrive = computed(
  () => true,
  // GOOGLE_DRIVE_IMPORT_BETA_EMAILS.includes(userStore.user?.email ?? ""),
);
// Dropbox composable
const dropbox = useDropbox();
const { isMobile } = useIsMobile();

// Composables
const {
  isUploading,
  isFinalizing,
  uploadedCount,
  totalFiles,
  overallProgress,
  handleUploadFlow,
  validateUploadLimits,
  showSafeSearchViolationModal,
  safeSearchUserDeactivated,
  showDuplicatesFoundModal,
  duplicatesFound,
  showMissingExifModal,
  missingExifStats,
  dontShowMissingExifWarningAgain,
  resolveMissingExifWarning,
} = usePhotoUpload();

// Variables locales del componente
const fileInput = ref(null);
const folderInput = ref(null);
// Multi-folder staging: folder picks accumulate here (webkitdirectory can only
// return one folder per dialog) so the user can add several folders, review the
// total and deselect before the actual upload. Each group is one picked folder.
const showFolderReviewModal = ref(false);
const stagedFolderGroups = ref([]); // [{ id, name, files: File[] }]
// When on, each imported photo stores its folder hierarchy so the analyzer can
// materialize a Photoreka collection per folder (see LightroomFolderMirrorService).
const mirrorFolderStructure = ref(true);
const selectedDuplicates = ref([]);
const isDragOver = ref(false);
const showLightroomModal = ref(false);
const showImagePolicyInfo = ref(false);
const showSourceWarningModal = ref(false);
const pendingSourceAction = ref(null);
const pendingSourceCallback = ref(null);
const showAnalysisQuotaWarningModal = ref(false);
const dontShowAnalysisQuotaWarningAgain = ref(false);
const pendingQuotaWarningResolver = ref(null);
const analysisQuotaWarningContext = ref({
  attemptedCount: 0,
  projectedPendingCount: 0,
  overQuotaCount: 0,
  remaining: 0,
});

const ANALYSIS_QUOTA_WARNING_DISMISS_KEY =
  "import_analysis_quota_warning_dismissed";

// Tope duro de fotos en el lightbox: un múltiplo de la cuota de análisis que le
// queda al usuario. Acumular mucho más de lo que puede analizar no le sirve de
// nada y nos cuesta almacenamiento y preprocesado.
const LIGHTBOX_CAPACITY_MULTIPLIER = 4;
const showLightboxCapacityModal = ref(false);
const pendingCapacityResolver = ref(null);
const lightboxCapacityContext = ref({
  capacity: 0,
  currentCount: 0,
  attemptedCount: 0,
});

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

// Importar desde una fuente externa son DOS operaciones seguidas que comparten
// la misma barra: primero descargamos las fotos del proveedor y después las
// subimos a Photoreka. Los tres composables exponen la misma forma de estado de
// descarga, así que la barra solo necesita saber cuál está activa.
const EXTERNAL_DOWNLOAD_SOURCES = [
  { label: "Google Photos", state: googlePhotos },
  { label: "Google Drive", state: googleDrive },
  { label: "Dropbox", state: dropbox },
];

const activeExternalDownload = computed(
  () =>
    EXTERNAL_DOWNLOAD_SOURCES.find(
      (source) =>
        source.state.isDownloading.value &&
        source.state.totalToDownload.value > 0,
    ) || null,
);

// Nombre de la fuente externa de la importación en curso. Se mantiene después
// de que acabe la descarga para poder etiquetar la subida como el paso 2 del
// mismo proceso; se limpia cuando toda la operación termina (ver el watcher de
// isAnyOperationInProgress).
const externalImportSource = ref(null);
watch(activeExternalDownload, (source) => {
  if (source) externalImportSource.value = source.label;
});

// Computed property for actual progress (considers external downloads)
const actualProgress = computed(() => {
  // La subida ya terminó: dejamos la barra llena mientras se finaliza
  // (post-proceso + chequeo automático de duplicados).
  if (isFinalizing.value) return 100;
  if (activeExternalDownload.value) {
    return activeExternalDownload.value.state.downloadProgress.value;
  }
  return overallProgress.value;
});

const progressTitle = computed(() => {
  if (activeExternalDownload.value) {
    return `Downloading from ${activeExternalDownload.value.label}`;
  }
  if (isFinalizing.value) return "Finalizing";
  if (overallProgress.value >= 100 && isPreprocessing.value) {
    return "Preprocessing Photos";
  }
  // Con fuente externa hay que dejar claro que esta barra ya es otra fase, no
  // la descarga reiniciada.
  return externalImportSource.value
    ? "Uploading to Photoreka"
    : "Importing Photos";
});

// "Step 1 of 2" / "Step 2 of 2": solo con fuentes externas, para que las dos
// barras consecutivas se lean como fases de una misma importación.
const progressStepText = computed(() => {
  if (!externalImportSource.value) return "";
  return activeExternalDownload.value ? "Step 1 of 2" : "Step 2 of 2";
});

// Computed to check if there's any operation in progress
const isAnyOperationInProgress = computed(() => {
  // Descargando desde una fuente externa (Google Photos / Drive / Dropbox)
  const isDownloadingExternal = activeExternalDownload.value !== null;

  // Check if uploading to Cloudflare with actual files
  const isUploadingFiles = isUploading.value && totalFiles.value > 0;

  return isDownloadingExternal || isUploadingFiles || isFinalizing.value;
});

// Computed for the progress count text
const progressCountText = computed(() => {
  if (isFinalizing.value) return "Checking for duplicates…";
  const external = activeExternalDownload.value;
  if (external) {
    return `${external.state.downloadedCount.value}/${external.state.totalToDownload.value} downloaded`;
  }
  if (isUploading.value && totalFiles.value > 0) {
    return `${uploadedCount.value}/${totalFiles.value} uploaded`;
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
        "Your import source is web. If you add photos from Lightroom, the photos you've uploaded from web until now won't be visible in Lightroom.",
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
    compactLabel: "Local",
    cardTitle: "Local Files",
    cardDescription:
      "Import individual photos or a whole folder from your computer",
    tagType: "primary",
    tagText: isFirstImportState.value ? "Recommended" : "Select files",
    iconType: "component",
    iconComponent: CloudUploadOutline,
    iconColor: "var(--primary-color)",
    draggable: true,
    // Default action (whole-card click / drag & drop target): pick files.
    action: triggerFileInput,
    // Local import offers two flavours picking the same upload flow: individual
    // files (accept=image/*) or a whole folder (webkitdirectory, recursive).
    // `key` + `label` double as naive-ui n-dropdown options.
    subActions: [
      {
        key: "files",
        label: "Photos",
        action: triggerFileInput,
        icon: ImagesOutline,
      },
      {
        key: "folder",
        label: "Folders",
        action: triggerFolderInput,
        icon: FolderOutline,
      },
    ],
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
    enabled: true,
    disabled: isUploadDisabled.value,
    compactLabel: "Google",
    cardTitle: "Google",
    cardDescription: "Import your photos from Google Photos or Google Drive",
    iconType: "img",
    iconSrc: googleLogoIconUrl,
    iconAlt: "Google",
    iconClass: "google-logo",
    draggable: false,
    // The card only merges Google Photos and Drive visually; clicking the
    // card itself does nothing, only the sub-actions below are clickable.
    cardClickable: false,
    action: importFromGooglePhotos,
    // Google Photos and Google Drive share the same card, offered as
    // sub-pills (see Local's Photos/Folders above). Each pill shows its own
    // icon (Photos/Drive), with the connected/disconnected state reflected
    // only through the pill's color.
    subActions: [
      {
        key: "photos",
        label: "Photos",
        action: importFromGooglePhotos,
        iconSrc: googlePhotosIconUrl,
        connected: googlePhotos.isAuthorized.value,
      },
      {
        key: "drive",
        label: "Drive",
        action: importFromDrive,
        iconSrc: googleDriveIconUrl,
        connected: googleDrive.isAuthorized.value,
        enabled: canImportFromGoogleDrive.value,
      },
    ].filter((sub) => sub.enabled !== false),
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
  return (
    order
      .map((key) => sourceDefinitions.value[key])
      .filter((source) => source && source.enabled)
      // The Lightroom flow requires Lightroom Classic on desktop, so the card /
      // compact button is hidden entirely on mobile.
      .filter((source) => !(isMobile.value && source.key === "lightroom"))
  );
});

// The empty-state grid has one extra rule: first-time users whose preferred
// source is Lightroom only ever see the Lightroom card (onboarding
// continuation), everyone else sees the full ordered list. On mobile there is
// no Lightroom card at all, so those users fall back to the full list.
const emptyStateSources = computed(() => {
  if (
    !isMobile.value &&
    isFirstImportState.value &&
    preferredSource.value === "lightroom"
  ) {
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
    // La importación (descarga + subida) ha terminado: la próxima barra vuelve
    // a ser una sola fase hasta que se use otra fuente externa.
    externalImportSource.value = null;
    nextTick(() => window.dispatchEvent(new Event("resize")));
  }
});

// Watcher para mostrar un aviso de éxito cuando se autoriza Google Drive
watch(
  () => googleDrive.isAuthorized.value,
  (newValue, oldValue) => {
    if (newValue && !oldValue) {
      message.success("Google Drive connected successfully!");
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
const showFirstAnalysisMinimumModal = ref(false);
const dontShowFirstAnalysisMinimumWarningAgain = ref(false);
const FIRST_ANALYSIS_MINIMUM_WARNING_DISMISS_KEY =
  "import_first_analysis_minimum_warning_dismissed";
const isFirstAnalysisMinimumWarningDismissed = () =>
  localStorage.getItem(FIRST_ANALYSIS_MINIMUM_WARNING_DISMISS_KEY) === "true";
const showTimeEstimateDialog = ref(false);

// Remembers which upload channel (local/google/dropbox/drive) the user last
// completed an upload with, so contextual "Add more photos" CTAs (e.g. the
// first-analysis minimum modal) can resume the same flow instead of always
// assuming local files. Persisted so it also holds across reloads.
const LAST_UPLOAD_SOURCE_KEY = "import_last_upload_source";
const lastUploadSourceKey = ref(
  localStorage.getItem(LAST_UPLOAD_SOURCE_KEY) || "local",
);
const recordLastUploadSource = (key) => {
  lastUploadSourceKey.value = key;
  localStorage.setItem(LAST_UPLOAD_SOURCE_KEY, key);
};

// Ref to the underlying PhotosGrid, so we can clear its (local) selection after
// an analysis is launched. That grid owns the real selection state.
const photosGridRef = ref(null);

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

// Duplicados detectados por el chequeo automático posterior a la importación.
// "Review" entra directamente en el modo de revisión del grid: las fotos ya
// vienen marcadas del chequeo, así que no hay que repetir la llamada.
const dontShowDuplicatesWarningAgain = ref(false);

// Persiste el "Don't show this again" al cerrar el aviso, sea cual sea la
// opción elegida. Con la marca puesta, el chequeo automático ya ni se ejecuta.
const persistDuplicatesWarningDismissal = () => {
  if (dontShowDuplicatesWarningAgain.value) {
    localStorage.setItem(DUPLICATES_WARNING_DISMISS_KEY, "true");
  }
  dontShowDuplicatesWarningAgain.value = false;
};

const handleReviewImportDuplicates = () => {
  showDuplicatesFoundModal.value = false;
  persistDuplicatesWarningDismissal();
  photosGridRef.value?.enterDuplicateReview?.("similar");
};

// "I don't mind": limpiamos las marcas para que la vista quede exactamente
// como si no se hubiese hecho el chequeo.
const handleDismissImportDuplicates = () => {
  showDuplicatesFoundModal.value = false;
  persistDuplicatesWarningDismissal();
  photosStore.clearDuplicateFlags(lightboxPhotos.value.map((p) => p.id));
};

// Use local selection state for the analyze dialog
const selectedCount = computed(() => {
  if (localSelectedCount.value > 0) return localSelectedCount.value;
  if (isDuplicateFilterActive.value === "non-duplicates")
    return filteredUniqueIds.value.length;
  return filteredPhotos.value.length;
});

const firstAnalysisPhotosNeeded = computed(() =>
  Math.max(0, MIN_PHOTOS_FIRST_ANALYSIS - selectedCount.value),
);

const firstAnalysisProgressPercent = computed(() => {
  if (MIN_PHOTOS_FIRST_ANALYSIS <= 0) return 100;
  return Math.min(
    100,
    Math.round((selectedCount.value / MIN_PHOTOS_FIRST_ANALYSIS) * 100),
  );
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

const triggerFolderInput = () => {
  if (isUploadDisabled.value) {
    if (uploadDisabledMessage.value) {
      message.warning(uploadDisabledMessage.value);
    }
    return;
  }
  folderInput.value?.click();
};

// Map a source's subActions to naive-ui n-dropdown options (icon needs to be a
// render function, not a raw component).
const subActionOptions = (source) =>
  (source.subActions || []).map((sub) => {
    let icon;
    if (sub.iconSrc) {
      icon = () =>
        h(NIcon, null, {
          default: () =>
            h("img", {
              src: sub.iconSrc,
              alt: sub.label,
              style: { width: "1em", height: "1em" },
            }),
        });
    } else if (sub.icon) {
      icon = () => h(NIcon, null, { default: () => h(sub.icon) });
    }
    // Los sub-actions con cuenta externa (Google Photos / Drive) muestran un
    // punto verde cuando ya están conectados, igual que el color del pill en
    // las tarjetas del empty state. El dropdown se teletransporta al body, así
    // que los estilos van inline (los <style scoped> no llegarían).
    const label = sub.connected
      ? () =>
          h(
            "span",
            { style: { display: "inline-flex", alignItems: "center" } },
            [
              sub.label,
              h("span", {
                title: "Connected",
                style: {
                  width: "6px",
                  height: "6px",
                  marginLeft: "6px",
                  borderRadius: "50%",
                  backgroundColor: "var(--success-color, #18a058)",
                  flexShrink: "0",
                },
              }),
            ],
          )
      : sub.label;

    return {
      key: sub.key,
      label,
      icon,
    };
  });

// n-dropdown (compact / mobile local button) emits the selected option key.
const handleSubActionSelect = (source, key) => {
  const sub = source.subActions?.find((s) => s.key === key);
  if (sub) handleSourceSelection(source.key, sub.action);
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

  const files = Array.from(event.dataTransfer.files).filter(
    isSupportedImageFile,
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

  const canContinue = await canStartImport(files.length);
  if (!canContinue) return;

  try {
    const uploaded = await handleUploadFlow(files, "local");
    if (uploaded) recordLastUploadSource("local");
  } catch (error) {
    console.error("Error uploading files:", error);
  }
};

// The only formats the backend accepts (see ALLOWED_MIME_TYPES in
// catalog_controller). Filtering by extension (not file.type.startsWith("image/"))
// is deliberate: the folder picker (webkitdirectory) ignores the input's `accept`
// filter, and Windows tags RAW files as image/x-sony-arw, image/x-fuji-raf, etc.,
// which would slip past a MIME prefix check. This keeps folder imports in sync
// with the "Files" option and drops RAW (.arw, .raf, .cr2, .nef, ...) and the like.
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

const isSupportedImageFile = (file) => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return Boolean(ext) && SUPPORTED_IMAGE_EXTENSIONS.has(ext);
};

async function uploadLocalFiles(event) {
  // Shared by both the file picker (accept=image/*) and the folder picker
  // (webkitdirectory, which ignores `accept` and returns every file in the
  // tree). Filter to supported images so folders don't drag in RAW/.xmp/.txt/etc.
  const selectedLocalFiles = Array.from(event.target.files).filter(
    isSupportedImageFile,
  );
  if (selectedLocalFiles.length === 0) {
    event.target.value = "";
    return;
  }

  // Validar límites antes de proceder
  const validation = validateUploadLimits(selectedLocalFiles.length);
  if (!validation.isValid) {
    message.error(validation.message);
    event.target.value = ""; // Clear the input
    return;
  }

  const canContinue = await canStartImport(selectedLocalFiles.length);
  if (!canContinue) {
    event.target.value = "";
    return;
  }

  try {
    const uploaded = await handleUploadFlow(selectedLocalFiles, "local");
    if (uploaded) recordLastUploadSource("local");
  } finally {
    event.target.value = "";
  }
}

// ---------------------------------------------------------------------------
// Multi-folder staging
// A webkitdirectory <input> only returns one folder per dialog, so instead of
// uploading immediately we stage each folder pick and let the user accumulate
// several folders, see the total and remove any before importing.
// ---------------------------------------------------------------------------

// Stable-ish key to dedupe the same file across folder picks (e.g. the user
// adds the same folder twice).
const fileKey = (file) =>
  `${file.webkitRelativePath || file.name}__${file.size}__${file.lastModified}`;

// Flattened, deduped list of every staged image across all folders.
const stagedFiles = computed(() => {
  const seen = new Set();
  const result = [];
  for (const group of stagedFolderGroups.value) {
    for (const file of group.files) {
      const key = fileKey(file);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(file);
    }
  }
  return result;
});

const stagedTotalCount = computed(() => stagedFiles.value.length);

// Folder picker <input> change handler: stage instead of uploading directly.
function stageFolderSelection(event) {
  const images = Array.from(event.target.files).filter(isSupportedImageFile);
  event.target.value = ""; // reset so the same folder can be re-picked
  if (images.length === 0) {
    message.warning("No image files were found in that folder");
    return;
  }

  const rootName =
    (images[0].webkitRelativePath || images[0].name).split("/")[0] || "Folder";
  const group = {
    id: `${rootName}-${Date.now()}`,
    name: rootName,
    files: images,
  };

  // Re-picking a folder with the same root name refreshes that group in place.
  const existingIdx = stagedFolderGroups.value.findIndex(
    (g) => g.name === rootName,
  );
  if (existingIdx >= 0) {
    stagedFolderGroups.value.splice(existingIdx, 1, group);
  } else {
    stagedFolderGroups.value.push(group);
  }

  showFolderReviewModal.value = true;
}

const removeStagedFolder = (id) => {
  stagedFolderGroups.value = stagedFolderGroups.value.filter(
    (g) => g.id !== id,
  );
  if (stagedFolderGroups.value.length === 0) {
    showFolderReviewModal.value = false;
  }
};

const cancelFolderReview = () => {
  showFolderReviewModal.value = false;
  stagedFolderGroups.value = [];
};

async function importStagedFolders() {
  const files = stagedFiles.value;
  if (files.length === 0) return;

  const validation = validateUploadLimits(files.length);
  if (!validation.isValid) {
    message.error(validation.message);
    return;
  }

  // Hide the review modal while the quota warning (its own modal) may show,
  // but keep the staged folders so the user can reconsider if they cancel it.
  showFolderReviewModal.value = false;
  const canContinue = await canStartImport(files.length);
  if (!canContinue) {
    showFolderReviewModal.value = true;
    return;
  }

  const toUpload = files.slice();
  const mirrorFolders = mirrorFolderStructure.value;
  try {
    const uploaded = await handleUploadFlow(toUpload, "local", {
      mirrorFolders,
    });
    if (uploaded) {
      stagedFolderGroups.value = [];
      recordLastUploadSource("local");
    } else {
      // El flujo se abortó (Safe Search, aviso de EXIF…): devolvemos al usuario
      // a la pantalla de revisión con sus carpetas intactas.
      showFolderReviewModal.value = true;
    }
  } catch (error) {
    console.error("Error uploading files:", error);
  }
}

/**
 * La primera vez, el click en Google Photos solo puede completar el
 * consentimiento de Google: el navegador ya no permite abrir el popup del
 * picker cuando vuelve el token (ver selectPhotos en useGooglePhotos). En lugar
 * de dejar al usuario pensando que su click no ha hecho nada, le confirmamos la
 * conexión y le damos el botón que sí abre el picker (su click cuenta como
 * interacción del usuario, así que el popup no se bloquea).
 */
function promptOpenGooglePhotosPicker() {
  dialog.success({
    title: "Google Photos connected",
    content:
      "Your Google Photos account is now connected. Click below to open Google Photos and choose the photos you want to import.",
    positiveText: "Open Google Photos",
    negativeText: "Later",
    onPositiveClick: () => {
      importFromGooglePhotos();
    },
  });
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
      // Sin fotos + justAuthorized = este click solo ha servido para conectar
      // la cuenta, hay que pedir el segundo click de forma explícita.
      if (googlePhotos.justAuthorized.value) {
        promptOpenGooglePhotosPicker();
      }
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

    const canContinue = await canStartImport(successfulDownloads.length);
    if (!canContinue) {
      return;
    }

    // Process and upload photos using handleUploadFlow. Devuelve false si el
    // flujo se aborta (Safe Search, aviso de EXIF, límites…), en cuyo caso no
    // hay nada que celebrar.
    const uploaded = await handleUploadFlow(
      successfulDownloads.map((result) => ({
        googlePhotoBlob: result.blob,
        googlePhotoMediaItem: result.mediaItem,
      })),
      "google",
    );
    if (!uploaded) return;

    recordLastUploadSource("google");

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

    const canContinue = await canStartImport(successfulDownloads.length);
    if (!canContinue) {
      return;
    }

    const uploaded = await handleUploadFlow(
      successfulDownloads.map((result) => ({
        dropboxBlob: result.blob,
        dropboxFile: result.file,
      })),
      "dropbox",
    );
    if (!uploaded) return;

    recordLastUploadSource("dropbox");

    message.success(
      `Successfully imported ${successfulDownloads.length} photos from Dropbox`,
    );
  } catch (error) {
    console.error("❌ Error importing from Dropbox:", error);
  }
}

/**
 * Importa fotos desde Google Drive (Picker + drive.file)
 */
async function importFromDrive() {
  try {
    const validation = validateUploadLimits(100);
    if (!validation.isValid) {
      message.error(validation.message);
      return;
    }

    const downloadResults = await googleDrive.importPhotos(5);

    if (!downloadResults || downloadResults.length === 0) {
      return;
    }

    const successfulDownloads = downloadResults.filter((r) => r.success);

    if (successfulDownloads.length === 0) {
      message.warning(
        "No photos were successfully downloaded from Google Drive",
      );
      return;
    }

    const finalValidation = validateUploadLimits(successfulDownloads.length);
    if (!finalValidation.isValid) {
      message.error(finalValidation.message);
      return;
    }

    const canContinue = await canStartImport(successfulDownloads.length);
    if (!canContinue) {
      return;
    }

    const uploaded = await handleUploadFlow(
      successfulDownloads.map((result) => ({
        driveBlob: result.blob,
        driveFile: result.file,
      })),
      "drive",
    );
    if (!uploaded) return;

    recordLastUploadSource("drive");

    message.success(
      `Successfully imported ${successfulDownloads.length} photos from Google Drive`,
    );
  } catch (error) {
    console.error("❌ Error importing from Google Drive:", error);
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
    pendingSourceCallback.value = callback;
    showSourceWarningModal.value = true;
  } else {
    // No warning needed, execute directly
    callback();
  }
};

// Confirm source warning and replay the exact action that was pending (so the
// Files vs Folder choice for local imports is preserved).
const confirmSourceWarning = () => {
  showSourceWarningModal.value = false;
  const callback = pendingSourceCallback.value;
  pendingSourceAction.value = null;
  pendingSourceCallback.value = null;
  callback?.();
};

// Cancel source warning
const cancelSourceWarning = () => {
  showSourceWarningModal.value = false;
  pendingSourceAction.value = null;
  pendingSourceCallback.value = null;
};

// Gate previo a cualquier importación: primero el tope duro de capacidad del
// lightbox (no se puede saltar), y solo si pasa, el aviso descartable de cuota
// de análisis.
const canStartImport = async (attemptedCount) => {
  if (!(await enforceLightboxCapacity(attemptedCount))) return false;
  return await maybeShowAnalysisQuotaWarning(attemptedCount);
};

// Bloquea la importación si dejaría el lightbox por encima de su capacidad
// (LIGHTBOX_CAPACITY_MULTIPLIER × la cuota de análisis restante). Devuelve true
// si se puede continuar.
const enforceLightboxCapacity = async (attemptedCount) => {
  const remaining = userStore.user?.usage?.analyzedPhotosRemaining;

  // Sin datos de usage no bloqueamos nada (mismo criterio que el aviso de cuota).
  if (typeof remaining !== "number") {
    return true;
  }

  const capacity = Math.max(0, remaining) * LIGHTBOX_CAPACITY_MULTIPLIER;
  const currentCount = Array.isArray(lightboxPhotos.value)
    ? lightboxPhotos.value.length
    : 0;

  if (currentCount + attemptedCount <= capacity) {
    return true;
  }

  lightboxCapacityContext.value = {
    capacity,
    currentCount,
    attemptedCount,
  };
  showLightboxCapacityModal.value = true;

  // Esperamos a que lo cierre: así quien nos llama (p.ej. el repaso de carpetas)
  // no reabre su propio modal por encima de este.
  await new Promise((resolve) => {
    pendingCapacityResolver.value = resolve;
  });

  return false;
};

const closeLightboxCapacityModal = () => {
  showLightboxCapacityModal.value = false;
  if (pendingCapacityResolver.value) {
    pendingCapacityResolver.value();
    pendingCapacityResolver.value = null;
  }
};

const goToSettingsFromCapacityModal = () => {
  closeLightboxCapacityModal();
  router.push("/settings");
};

const isAnalysisQuotaWarningDismissed = () => {
  return localStorage.getItem(ANALYSIS_QUOTA_WARNING_DISMISS_KEY) === "true";
};

const maybeShowAnalysisQuotaWarning = async (attemptedCount) => {
  const remaining = userStore.user?.usage?.analyzedPhotosRemaining;

  if (typeof remaining !== "number") {
    return true;
  }

  const normalizedRemaining = Math.max(0, remaining);
  const currentLightboxCount = Array.isArray(lightboxPhotos.value)
    ? lightboxPhotos.value.length
    : 0;
  const projectedPendingCount = currentLightboxCount + attemptedCount;

  if (projectedPendingCount <= normalizedRemaining) {
    return true;
  }

  if (isAnalysisQuotaWarningDismissed()) {
    return true;
  }

  analysisQuotaWarningContext.value = {
    attemptedCount,
    projectedPendingCount,
    overQuotaCount: Math.max(0, projectedPendingCount - normalizedRemaining),
    remaining: normalizedRemaining,
  };
  dontShowAnalysisQuotaWarningAgain.value = false;
  showAnalysisQuotaWarningModal.value = true;

  return await new Promise((resolve) => {
    pendingQuotaWarningResolver.value = resolve;
  });
};

const resolveAnalysisQuotaWarning = (accepted) => {
  if (
    accepted &&
    dontShowAnalysisQuotaWarningAgain.value &&
    !isAnalysisQuotaWarningDismissed()
  ) {
    localStorage.setItem(ANALYSIS_QUOTA_WARNING_DISMISS_KEY, "true");
  }

  if (pendingQuotaWarningResolver.value) {
    pendingQuotaWarningResolver.value(accepted);
    pendingQuotaWarningResolver.value = null;
  }

  showAnalysisQuotaWarningModal.value = false;
};

const confirmAnalysisQuotaWarning = () => {
  resolveAnalysisQuotaWarning(true);
};

const cancelAnalysisQuotaWarning = () => {
  resolveAnalysisQuotaWarning(false);
};

const goToSettingsFromQuotaWarning = () => {
  resolveAnalysisQuotaWarning(false);
  router.push("/settings");
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

// Persists the "don't show this again" checkbox (recommendation mode only),
// regardless of which footer action the user takes.
const persistFirstAnalysisMinimumDismissal = () => {
  if (dontShowFirstAnalysisMinimumWarningAgain.value) {
    localStorage.setItem(FIRST_ANALYSIS_MINIMUM_WARNING_DISMISS_KEY, "true");
  }
  dontShowFirstAnalysisMinimumWarningAgain.value = false;
};

const closeFirstAnalysisMinimumModal = () => {
  persistFirstAnalysisMinimumDismissal();
  showFirstAnalysisMinimumModal.value = false;
};

// Recommendation mode only: bypass the minimum and start the analyze dialog
// right away instead of forcing the user to add more photos.
const continueAnywayFromFirstAnalysisModal = () => {
  persistFirstAnalysisMinimumDismissal();
  showFirstAnalysisMinimumModal.value = false;
  showAnalyzeDialog.value = true;
};

const openAnalyzeDialog = () => {
  if (
    MIN_PHOTOS_FIRST_ANALYSIS > 0 &&
    (photosStore.processedPhotos?.length ?? 0) === 0 &&
    selectedCount.value < MIN_PHOTOS_FIRST_ANALYSIS &&
    !(
      isFirstAnalysisMinimumRecommendation &&
      isFirstAnalysisMinimumWarningDismissed()
    )
  ) {
    showFirstAnalysisMinimumModal.value = true;
    logActivity("ui_action", {
      action: "analysis_failed_enough_photos",
      selectedCount: selectedCount.value,
      minRequired: MIN_PHOTOS_FIRST_ANALYSIS,
    });
    return;
  }

  showAnalyzeDialog.value = true;
};

const handleAddMorePhotosFromFirstAnalysisModal = () => {
  showFirstAnalysisMinimumModal.value = false;
  // Resume whichever upload channel the user last completed an upload with
  // (local/google/dropbox/drive), instead of assuming local files.
  const lastSource = sourceDefinitions.value[lastUploadSourceKey.value];
  if (lastSource?.action) {
    lastSource.action();
  } else {
    triggerFileInput();
  }
};

const confirmAnalyze = () => {
  // Dialog stays open with a spinner on "Start Analysis" until the parent
  // finishes awaiting the analyzer call (see the isAnalyzing watcher below,
  // which closes it once that settles).
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

watch(
  () => props.isAnalyzing,
  (analyzing, wasAnalyzing) => {
    if (wasAnalyzing && !analyzing) {
      showAnalyzeDialog.value = false;
    }
  },
);

// Clear the real selection (lives in PhotosGrid's local selection composable).
// Also reset our locally tracked selection mirrors so the analyze dialog and
// floating button count go back to zero immediately.
const clearSelection = () => {
  photosGridRef.value?.clearSelection?.();
  localSelectedCount.value = 0;
  localSelectedIds.value = [];
  emit("selection-change", { selectedCount: 0, selectedIds: [] });
};

// Exponer openAnalyzeDialog para uso del componente padre
defineExpose({
  openAnalyzeDialog,
  clearSelection,
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
  border: 1px solid var(--border-color);
}

/* Upload Progress Section */
/* Barra de progreso deliberadamente discreta: es información de estado
   transitoria, no debe competir con la cuadrícula de fotos. */
.upload-progress-section {
  background-color: var(--bg-surface);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.progress-title-container {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.progress-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* Paso 1/2 de las importaciones desde fuentes externas: presente pero
   claramente secundario frente al título de la fase. */
.progress-step {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.24));
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}

.preprocessing-spinner {
  color: var(--primary-color);
}

.progress-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.progress-percentage {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.overall-progress {
  margin-bottom: 0;
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
    padding: 12px 14px;
  }

  .progress-title {
    font-size: 13px;
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
    padding: 10px 12px;
  }

  .progress-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
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
  flex-wrap: wrap;
  justify-content: center;
  gap: 24px;
  width: 100%;
  margin: 0 auto 32px;
}

.import-cards-grid.single {
  justify-content: center;
}

.import-card {
  /* Cards grow/shrink to share the row proportionally as sources are
     enabled/disabled (e.g. re-enabling Google Photos), instead of a fixed
     width that would force horizontal scrolling. min/max keep them from
     getting too cramped or too wide when there are few of them. */
  flex: 1 1 200px;
  min-width: 200px;
  max-width: 240px;
  background-color: var(--bg-surface);
  border: 2px solid var(--border-color);
  border-radius: 16px;
  padding: 24px 20px;
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

.import-card--static {
  cursor: default;
}

.import-card--static:hover {
  border-color: var(--border-color);
  box-shadow: none;
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

.import-card-icon :deep(.google-logo) {
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

.import-card-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.import-card-action-button {
  cursor: pointer;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}

.sub-action-icon {
  width: 1em;
  height: 1em;
  object-fit: contain;
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

/* ── Supported formats + privacy disclosure ── */
.import-disclosure {
  text-align: center;
}

.import-disclosure-formats {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.import-disclosure-formats strong {
  color: var(--text-primary);
  font-weight: 600;
}

.import-disclosure-links {
  margin: 6px 0 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 13px;
}

.import-disclosure-link {
  height: auto;
  padding: 0;
  color: var(--accent-color);
  font-size: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  opacity: 0.85;
  transition: opacity 0.15s;
}

.import-disclosure-link:hover {
  opacity: 1;
}

.import-disclosure-sep {
  color: var(--text-secondary);
  opacity: 0.6;
}
</style>
