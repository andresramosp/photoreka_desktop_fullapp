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
        <span style="color: #ffffffd1; line-height: 1.6">
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
    <div
      v-if="
        isUploading ||
        (googlePhotos.isDownloading && googlePhotos.totalToDownload > 0)
      "
      class="upload-progress-section"
    >
      <div class="progress-header">
        <div class="progress-title-container">
          <h3 class="progress-title">
            {{
              overallProgress >= 100 && isPreprocessing
                ? "Preprocessing Photos"
                : "Synchronizing Photos"
            }}
          </h3>
          <n-spin
            v-if="overallProgress >= 100 && isPreprocessing"
            size="tiny"
            class="preprocessing-spinner"
          />
        </div>
        <span class="progress-count" v-if="googlePhotos.isDownloading">
          {{ googlePhotos.downloadedCount }}/{{ googlePhotos.totalToDownload }}
          photos downloaded
        </span>
        <span class="progress-count" v-else
          >{{ uploadedCount }}/{{ totalFiles }} photos</span
        >
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
    <!-- Upload Progress Section -->
    <div class="photo-hub-header">
      <n-icon size="18">
        <BookInformation20Regular />
      </n-icon>
      <h3 class="photo-hub-title">Photo upload and preview area.</h3>
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
    <!-- Full Upload Dropzone (show when no photos) -->
    <div
      v-if="!isMaintenanceMode && lightboxPhotos.length === 0"
      class="upload-section"
    >
      <div
        class="upload-dropzone"
        :class="{
          'drag-over': isDragOver && !isUploadDisabled,
          disabled: isUploadDisabled,
        }"
        @dragover.prevent="!isUploadDisabled && handleDragOver"
        @dragenter.prevent="!isUploadDisabled && handleDragEnter"
        @dragleave.prevent="!isUploadDisabled && handleDragLeave"
        @drop.prevent="handleDrop"
      >
        <div class="dropzone-content" @click="triggerFileInput">
          <div class="upload-icon">
            <n-icon size="48" :color="isUploadDisabled ? '#6b7280' : '#8b5cf6'">
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
                />
              </svg>
            </n-icon>
          </div>
          <h3 class="dropzone-title">
            {{
              isUploadDisabled && photosRemaining <= 0
                ? "Upload limit reached"
                : "Your Lightbox is empty"
            }}
          </h3>
          <p class="dropzone-subtitle">
            {{
              isUploadDisabled
                ? uploadDisabledMessage
                : "Drag and drop your images, or click below."
            }}
          </p>

          <div v-if="!isUploadDisabled" class="upload-buttons">
            <n-button
              v-for="button in uploadButtons"
              :key="button.key"
              :type="button.type"
              size="large"
              :class="`${button.key}-btn`"
              @click.stop="button.action"
            >
              <template #icon>
                <n-icon v-if="button.icon === 'FolderOpenOutline'">
                  <FolderOpenOutline />
                </n-icon>
                <n-icon v-else-if="button.icon === 'lightroom'">
                  <img
                    src="/src/assets/onBoarding/lightroom_logo.png"
                    alt="Lr"
                    style="width: 1.1em; height: 1.1em"
                  />
                </n-icon>
                <n-icon v-else-if="button.icon === 'google'">
                  <!-- Google Photos official SVG icon -->
                  <svg viewBox="0 0 48 48" width="1em" height="1em">
                    <g>
                      <path
                        fill="#4285F4"
                        d="M24 24V6.4A17.6 17.6 0 0 1 41.6 24Z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 24h17.6A17.6 17.6 0 0 1 24 41.6Z"
                      />
                      <path
                        fill="#FBBC04"
                        d="M24 24v17.6A17.6 17.6 0 0 1 6.4 24Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M24 24H6.4A17.6 17.6 0 0 1 24 6.4Z"
                      />
                    </g>
                  </svg>
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
          <n-button
            v-for="button in uploadButtons"
            :key="button.key"
            :type="button.type"
            size="medium"
            :class="`compact-${button.key}-btn`"
            :disabled="isUploadDisabled && button.key === 'local'"
            @click.stop="button.action"
          >
            <template #icon>
              <n-icon v-if="button.icon === 'FolderOpenOutline'">
                <FolderOpenOutline />
              </n-icon>
              <n-icon v-else-if="button.icon === 'lightroom'">
                <img
                  src="/src/assets/onBoarding/lightroom_logo.png"
                  alt="Lr"
                  style="width: 1.1em; height: 1.1em"
                />
              </n-icon>
              <n-icon v-else-if="button.icon === 'google'">
                <svg viewBox="0 0 48 48" width="1em" height="1em">
                  <g>
                    <path
                      fill="#4285F4"
                      d="M24 24V6.4A17.6 17.6 0 0 1 41.6 24Z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 24h17.6A17.6 17.6 0 0 1 24 41.6Z"
                    />
                    <path
                      fill="#FBBC04"
                      d="M24 24v17.6A17.6 17.6 0 0 1 6.4 24Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M24 24H6.4A17.6 17.6 0 0 1 24 6.4Z"
                    />
                  </g>
                </svg>
              </n-icon>
            </template>
            {{
              isUploadDisabled && photosRemaining <= 0 && button.key === "local"
                ? "Upload Limit Reached"
                : button.compactLabel
            }}
          </n-button>
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
        @selection-change="handleSelectionChange"
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
import { FolderOpenOutline } from "@vicons/ionicons5";
import { BookInformation20Regular } from "@vicons/fluent";
import pLimit from "p-limit";
import pica from "pica";
import { api_analyzer, api } from "@/utils/axios";

import PhotosGrid from "../PhotosGrid.vue";
import DuplicatePhotosDialog from "../DuplicatePhotosDialog.vue";
import LightroomModal from "../LightroomModal.vue";

import { NModal, NCheckbox, NTooltip } from "naive-ui";

import { useMessage } from "naive-ui";

// Maintenance mode check
const isMaintenanceMode = computed(
  () => import.meta.env.VITE_MAINTENANCE_MODE === "true"
);

const emit = defineEmits(["on-analyze", "selection-change"]);
const photosStore = usePhotosStore();
const userStore = useUserStore();
const message = useMessage();

// Warm up composable
const { warmedUp, ensureWarmUp } = useWarmUp();

// Google Photos composable
const googlePhotos = useGooglePhotos();
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

// Computed property for actual progress (considers Google Photos download)
const actualProgress = computed(() => {
  if (googlePhotos.isDownloading.value) {
    return googlePhotos.downloadProgress.value;
  }
  return overallProgress.value;
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
      icon: "FolderOpenOutline",
      type: preferredSource === "web" ? "primary" : "default",
      action: () => handleSourceSelection("local", () => triggerFileInput()),
    },
    lightroom: {
      key: "lightroom",
      label: "Lightroom Plugin",
      compactLabel: "Plugin",
      icon: "lightroom",
      type: preferredSource === "lightroom" ? "primary" : "default",
      action: () =>
        handleSourceSelection("lightroom", () => {
          showLightroomModal.value = true;
        }),
    },
    google: {
      key: "google",
      label: "Google Photos",
      compactLabel: "Google Photos",
      icon: "google",
      type: "default",
      action: () => handleSourceSelection("google", importFromGooglePhotos),
    },
  };

  // Order buttons based on preferredSource
  if (preferredSource === "lightroom") {
    return [buttons.lightroom, buttons.local, buttons.google];
  }

  // Default order for "web"
  return [buttons.local, buttons.google, buttons.lightroom];
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
    (photo) => photo.isCheckingDuplicates || photo.status === "preprocessing"
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

// Use local selection state for the analyze dialog
const selectedCount = computed(() => {
  return localSelectedCount.value > 0
    ? localSelectedCount.value
    : filteredPhotos.value.length;
});

// Selection state (keeping existing computed for compatibility)
const selectedPhotosRecord = computed(() => photosStore.selectedPhotosRecord);
const selectedPhotoIds = computed(() => photosStore.selectedPhotoIds);

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
    file.type.startsWith("image/")
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
    message.error("Error al subir los archivos");
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
      "google"
    );

    message.success(
      `Successfully imported ${successfulDownloads.length} photos from Google Photos`
    );
  } catch (error) {
    console.error("❌ Error importing from Google Photos:", error);
    message.error("Error importing photos from Google Photos");
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
  emit("on-analyze", {
    fastMode: fastMode.value,
    selectedIds: localSelectedCount.value > 0 ? localSelectedIds.value : [],
  });
};

// Exponer openAnalyzeDialog para uso del componente padre
defineExpose({
  openAnalyzeDialog,
});
</script>

<style scoped>
/* Upload Section */
.upload-section {
  margin-bottom: 48px;
}

.upload-dropzone {
  border: 2px dashed #2c2c32;
  border-radius: 16px;
  padding: 64px 32px;
  text-align: center;
  transition: all 0.3s ease;
  background-color: #1a1a1f;
}

.upload-dropzone:hover,
.upload-dropzone.drag-over {
  border-color: var(--secondary-color);
  background-color: rgba(139, 92, 246, 0.05);
}

.dropzone-content {
  max-width: 400px;
  margin: 0 auto;
  cursor: pointer;
}

.upload-icon {
  margin-bottom: 24px;
}

.dropzone-title {
  font-size: 24px;
  font-weight: 600;
  color: #ffffffd1;
  margin: 0 0 8px 0;
}

.dropzone-subtitle {
  font-size: 16px;
  color: #ffffff73;
  margin: 0 0 32px 0;
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
  color: #ffffff73;
  font-size: 14px;
}

.compact-upload-btn {
  min-width: 120px;
}

.compact-upload-section.compact-drag-over {
  background-color: rgba(139, 92, 246, 0.05);
  border: 2px dashed var(--secondary-color);
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
  background-color: #1a1a1f;
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
  color: #ffffffd1;
  margin: 0;
}

.preprocessing-spinner {
  color: var(--primary-color);
}

.progress-count {
  font-size: 14px;
  color: #ffffff73;
}

.overall-progress {
  margin-bottom: 8px;
}

.progress-text {
  font-size: 14px;
  color: #ffffff73;
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
  color: #ffffffd1;
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
  color: #ffffff73;
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
  color: #ffffffd1;
  line-height: 1.5;
}

/* Upload disabled styles */
.upload-dropzone.disabled {
  background-color: var(--bg-surface);
  border-color: var(--border-color);
  cursor: not-allowed;
  opacity: 0.6;
}

.upload-dropzone.disabled .dropzone-content {
  cursor: not-allowed;
}

.upload-dropzone.disabled .dropzone-title {
  color: var(--text-secondary);
}

.upload-dropzone.disabled .dropzone-subtitle {
  color: var(--text-tertiary);
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
}
</style>
