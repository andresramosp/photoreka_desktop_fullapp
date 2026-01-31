<template>
  <div class="sync-tab-content">
    <!-- Upload Progress Section -->
    <div
      v-if="
        isUploading ||
        (googlePhotos.isDownloading && googlePhotos.totalToDownload > 0)
      "
      class="upload-progress-section"
    >
      <div class="progress-header">
        <h3 class="progress-title">
          {{
            googlePhotos.isDownloading
              ? "Downloading from Google Photos"
              : "Uploading Photos"
          }}
        </h3>
        <span class="progress-count" v-if="googlePhotos.isDownloading">
          {{ googlePhotos.downloadedCount }}/{{ googlePhotos.totalToDownload }}
          photos downloaded
        </span>
        <span class="progress-count" v-else>
          {{ uploadedCount }}/{{ totalFiles }} photos uploaded
        </span>
      </div>
      <n-progress
        type="line"
        :percentage="overallProgress"
        :show-indicator="false"
        class="overall-progress"
      />
      <div class="progress-text">
        {{ Math.round(overallProgress) }}% complete
      </div>
    </div>

    <!-- Full Upload Dropzone (show when no photos) -->
    <div v-if="syncPhotos.length === 0" class="upload-section">
      <div class="upload-dropzone">
        <div class="dropzone-content">
          <div class="upload-icon">
            <n-icon size="48" color="var(--accent-color)">
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
                />
              </svg>
            </n-icon>
          </div>
          <h3 class="dropzone-title">Import to Lightbox</h3>
          <p class="dropzone-subtitle">
            Drag and drop your images, or use one of the available sources.
          </p>

          <div class="upload-buttons">
            <n-button
              type="primary"
              size="large"
              class="upload-btn"
              @click="triggerFileInput"
            >
              <template #icon>
                <n-icon>
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                    />
                  </svg>
                </n-icon>
              </template>
              Choose Files
            </n-button>

            <n-button
              type="default"
              size="large"
              class="upload-btn"
              @click="importFromGooglePhotos"
            >
              <template #icon>
                <n-icon>
                  <img
                    :src="googlePhotosIconUrl"
                    alt="Google Photos"
                    style="width: 1em; height: 1em"
                  />
                </n-icon>
              </template>
              Google Photos
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
    <div v-else class="compact-upload-section">
      If you upload photos directly here, the Canvas will be limited to only
      General and Chromatic expansion types.
      <div class="compact-upload-buttons">
        <n-button
          type="primary"
          size="medium"
          class="compact-upload-btn"
          @click="triggerFileInput"
        >
          <template #icon>
            <n-icon>
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                />
              </svg>
            </n-icon>
          </template>
          Add More Photos
        </n-button>

        <n-button
          type="default"
          size="medium"
          class="compact-upload-btn"
          @click="importFromGooglePhotos"
        >
          <template #icon>
            <n-icon>
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zm-8-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
                />
              </svg>
            </n-icon>
          </template>
          Google Photos
        </n-button>
      </div>
    </div>

    <!-- Uploaded Photos -->
    <div v-if="syncPhotos.length > 0" class="uploaded-photos-section">
      <div
        class="photos-grid photo-grid-base"
        :class="`grid-cols-${gridColumns}`"
      >
        <PhotoCardHub
          v-for="photo in filteredPhotos"
          :key="photo.id"
          :photo="photo"
          :selected="selectedIds.includes(photo.id)"
          @select="toggleSelection"
          :show-delete="false"
          :show-name="false"
          :show-footer="false"
          :showDuplicate="false"
          :is-uploading="isUploading"
          :show-info-button="true"
        />
      </div>
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
import { computed, ref } from "vue";
import { usePhotosStore } from "@/stores/photos.js";
import pLimit from "p-limit";
import pica from "pica";
import PhotoCardHub from "../photoCards/PhotoCardHub.vue";
import { NButton, NProgress, NIcon } from "naive-ui";
import { api_analyzer, api } from "@/utils/axios";
import { useGooglePhotos } from "@/composables/useGooglePhotos.js";
import googlePhotosIconUrl from "@/assets/logos/google_photos.png";

const props = defineProps({
  selectedIds: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:selectedIds", "photos-added"]);

const photosStore = usePhotosStore();
const googlePhotos = useGooglePhotos();

const isUploading = ref(false);
const gridColumns = ref(6);
const fileInput = ref(null);

const uploadedCount = ref(0);
const totalFiles = ref(0);

// Get sync photos from the store
const syncPhotos = computed(
  () =>
    [...photosStore.preProcessingPhotos, ...photosStore.preprocessedPhotos] ||
    [],
);

const filteredPhotos = computed(() => syncPhotos.value);

// Selection management
const selectedIds = computed({
  get: () => props.selectedIds,
  set: (value) => emit("update:selectedIds", value),
});

const picaInstance = pica();
const limit = pLimit(10);

const overallProgress = computed(() => {
  // Si estamos descargando de Google Photos, usar ese progreso
  if (googlePhotos.isDownloading.value) {
    return googlePhotos.downloadProgress.value;
  }
  // Si estamos subiendo archivos locales
  if (totalFiles.value === 0) return 0;
  return (uploadedCount.value / totalFiles.value) * 100;
});

const triggerFileInput = () => {
  if (!isUploading.value) fileInput.value?.click();
};

async function uploadLocalFiles(event) {
  const selectedLocalFiles = Array.from(event.target.files);
  if (selectedLocalFiles.length === 0) return;

  isUploading.value = true;
  totalFiles.value = selectedLocalFiles.length;
  uploadedCount.value = 0;

  const photosToUpload = [];

  try {
    await Promise.all(
      selectedLocalFiles.map((file) =>
        limit(() =>
          processAndUploadFile(file).then((photo) => {
            if (photo) photosToUpload.push(photo);
          }),
        ),
      ),
    );

    isUploading.value = false;

    // Set photos to checking duplicates state
    const photoIds = photosToUpload.map((p) => p.id);
    photoIds.forEach((id) => {
      photosStore.updatePhoto(id, { preprocessing: true });
    });

    await api_analyzer.post(`/api/analyzer`, {
      packageId: "preprocess",
      mode: "adding",
    });

    await photosStore.getOrFetch(true);

    // Remove checking duplicates flag
    photoIds.forEach((id) => {
      photosStore.updatePhoto(id, { preprocessing: false, preprocessed: true });
    });

    // Emit that new photos were added
    emit("photos-added", photosToUpload);
  } catch (error) {
    console.error("❌ Error uploading photos:", error);
  } finally {
    isUploading.value = false;
    event.target.value = "";
  }
}

async function processAndUploadFile(file) {
  const [resizedBlob, thumbnailBlob] = await Promise.all([
    resizeImage(file, 1500),
    resizeImage(file, 800),
  ]);

  // Usar el api global de axios para la petición interna
  const response = await api.post("/api/catalog/uploadPhoto", {
    fileType: resizedBlob.type,
    originalName: file.name,
  });
  const { uploadUrl, thumbnailUploadUrl, photo } = response.data;

  await Promise.all([
    fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": resizedBlob.type },
      body: resizedBlob,
    }),
    fetch(thumbnailUploadUrl, {
      method: "PUT",
      headers: { "Content-Type": thumbnailBlob.type },
      body: thumbnailBlob,
    }),
  ]);

  photo.status = "preprocessing";
  photo.isDuplicate = false;
  photosStore.photos.unshift(photo);
  uploadedCount.value++;

  return photo;
}

async function resizeImage(file, targetWidth) {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const scale = targetWidth / img.width;
  canvas.width = targetWidth;
  canvas.height = img.height * scale;

  await picaInstance.resize(img, canvas);
  const blob = await picaInstance.toBlob(canvas, "image/jpeg", 0.9);
  return blob;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const toggleSelection = (photoId) => {
  if (selectedIds.value.includes(photoId)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== photoId);
  } else {
    selectedIds.value = [...selectedIds.value, photoId];
  }
};

/**
 * Importa fotos desde Google Photos Picker
 */
async function importFromGooglePhotos() {
  try {
    // Usar el método importPhotos que maneja selección + descarga
    const downloadResults = await googlePhotos.importPhotos(100, 5);

    if (!downloadResults || downloadResults.length === 0) {
      return;
    }

    const successfulDownloads = downloadResults.filter((r) => r.success);

    if (successfulDownloads.length === 0) {
      console.warn("No photos were successfully downloaded");
      return;
    }

    // Poner isUploading a true ANTES de procesar para evitar gap en el indicador
    isUploading.value = true;
    totalFiles.value = successfulDownloads.length;
    uploadedCount.value = 0;

    const photosToUpload = [];

    await Promise.all(
      successfulDownloads.map((result) =>
        limit(() =>
          processAndUploadGooglePhoto(result).then((photo) => {
            if (photo) photosToUpload.push(photo);
          }),
        ),
      ),
    );

    // Ya no poner isUploading a false aquí, dejarlo true hasta el finally
    // isUploading.value = false;

    // Set photos to checking duplicates state
    const photoIds = photosToUpload.map((p) => p.id);
    photoIds.forEach((id) => {
      photosStore.updatePhoto(id, { preprocessing: true });
    });

    await api_analyzer.post(`/api/analyzer`, {
      packageId: "preprocess",
      mode: "adding",
    });

    await photosStore.getOrFetch(true);

    // Remove checking duplicates flag
    photoIds.forEach((id) => {
      photosStore.updatePhoto(id, { preprocessing: false, preprocessed: true });
    });

    // Emit that new photos were added
    emit("photos-added", photosToUpload);
  } catch (error) {
    console.error("❌ Error importing from Google Photos:", error);
  } finally {
    isUploading.value = false;
  }
}

/**
 * Procesa y sube una foto de Google Photos (blob ya descargado)
 * Soporta tanto el formato antiguo (Photos Library) como el nuevo (Picker API)
 */
async function processAndUploadGooglePhoto(result) {
  const { mediaItem, blob, photo } = result;

  // Obtener el nombre del archivo - soportar ambos formatos
  const photoData = mediaItem || photo;
  const filename =
    photoData?.filename ||
    photoData?.name ||
    `google-photo-${photoData?.id || Date.now()}.jpg`;

  // Resize the blob (similar to local files)
  const [resizedBlob, thumbnailBlob] = await Promise.all([
    resizeImageFromBlob(blob, 1500),
    resizeImageFromBlob(blob, 800),
  ]);

  // Get signed URLs from your backend
  const response = await api.post("/api/catalog/uploadPhoto", {
    fileType: resizedBlob.type,
    originalName: filename,
  });
  const { uploadUrl, thumbnailUploadUrl, photo: uploadedPhoto } = response.data;

  // Upload to R2
  await Promise.all([
    fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": resizedBlob.type },
      body: resizedBlob,
    }),
    fetch(thumbnailUploadUrl, {
      method: "PUT",
      headers: { "Content-Type": thumbnailBlob.type },
      body: thumbnailBlob,
    }),
  ]);

  uploadedPhoto.status = "preprocessing";
  uploadedPhoto.isDuplicate = false;
  photosStore.photos.unshift(uploadedPhoto);
  uploadedCount.value++;

  return uploadedPhoto;
}

/**
 * Redimensiona una imagen desde un Blob
 */
async function resizeImageFromBlob(blob, targetWidth) {
  const img = await loadImageFromBlob(blob);
  const canvas = document.createElement("canvas");
  const scale = targetWidth / img.width;
  canvas.width = targetWidth;
  canvas.height = img.height * scale;

  await picaInstance.resize(img, canvas);
  const resizedBlob = await picaInstance.toBlob(canvas, "image/jpeg", 0.9);
  return resizedBlob;
}

/**
 * Carga una imagen desde un Blob
 */
function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}
</script>

<style scoped>
.sync-tab-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  max-height: 50vh;
  overflow: hidden;
}

/* Upload Section */
.upload-section {
  margin-bottom: 32px;
}

.upload-dropzone {
  border: 2px dashed #2c2c32;
  border-radius: 16px;
  padding: 48px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background-color: var(--bg-body);
}

.upload-dropzone:hover,
.upload-dropzone.drag-over {
  border-color: var(--accent-color);
  background-color: rgba(139, 92, 246, 0.05);
}

.dropzone-content {
  max-width: 400px;
  margin: 0 auto;
}

.upload-icon {
  margin-bottom: 16px;
}

.dropzone-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
}

.dropzone-subtitle {
  font-size: 14px;
  color: var(--text-primary);
  margin: 0 0 24px 0;
}

.upload-buttons {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.upload-btn {
  min-width: 150px;
}

.file-formats {
  color: var(--text-primary);
  font-size: 12px;
}

.compact-upload-section {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.compact-upload-buttons {
  display: flex;
  gap: 12px;
}

.compact-upload-btn {
  min-width: 140px;
}

/* Photo Grid */
.photos-grid {
  overflow-y: auto;
  max-height: calc(50vh - 120px);
  padding: 4px;
}

/* Upload Progress Section */
.upload-progress-section {
  background-color: var(--bg-body);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid #2c2c32;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.progress-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.progress-count {
  font-size: 12px;
  color: var(--text-primary);
}

.overall-progress {
  margin-bottom: 8px;
}

.progress-text {
  font-size: 12px;
  color: var(--text-primary);
  text-align: center;
}

/* Scrollbar styling for photos grid */
.photos-grid {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.photos-grid::-webkit-scrollbar {
  width: 6px;
}

.photos-grid::-webkit-scrollbar-track {
  background: transparent;
}

.photos-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-xs);
}

.photos-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
