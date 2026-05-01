// composables/usePhotoUpload.js
import { ref, computed } from "vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useUserStore } from "@/stores/userStore.ts";
import { useImageProcessing } from "./useImageProcessing.js";
import { api_analyzer, api } from "@/utils/axios";
import { useMessage } from "naive-ui";
import pLimit from "p-limit";
import {
  extractBasicExifData,
  getCompactExifSummary,
} from "@/utils/exifUtils.js";
import {
  UPLOAD_MAX_SIZE_BYTES,
  UPLOAD_MAX_WIDTH,
  UPLOAD_THUMB_MAX_SIZE_BYTES,
  UPLOAD_THUMB_MAX_WIDTH,
  SAFE_SEARCH_SAMPLE_RATIO,
  SAFE_SEARCH_MIN_SAMPLES,
  SAFE_SEARCH_MAX_SAMPLES,
  SAFE_SEARCH_MAX_WIDTH,
  SAFE_SEARCH_MAX_SIZE_BYTES,
} from "@/config/uploadConfig.js";

export function usePhotoUpload() {
  const photosStore = usePhotosStore();
  const userStore = useUserStore();
  const { resizeImage, uploadToR2WithRetry } = useImageProcessing();
  const message = useMessage();
  const limit = pLimit(10);

  // Estado compartido de upload
  const isUploading = ref(false);
  const uploadedCount = ref(0);
  const totalFiles = ref(0);
  const pendingPhotos = ref([]); // Array temporal para fotos subidas pero no mostradas
  const showSafeSearchViolationModal = ref(false);

  const overallProgress = computed(() => {
    if (totalFiles.value === 0) return 0;
    return (uploadedCount.value / totalFiles.value) * 100;
  });

  // Función principal para procesar cualquier tipo de fuente de foto
  async function processPhotoSource(
    source,
    srcType = "local",
    originalName = null,
  ) {
    let file;
    let fileName;

    if (srcType === "google") {
      // Para Google Photos, source es { googlePhotoBlob, googlePhotoMediaItem }
      file = source.googlePhotoBlob;
      const mediaItem = source.googlePhotoMediaItem;
      // Obtener el nombre del archivo - soportar ambos formatos
      const photoData = mediaItem?.mediaFile || mediaItem;
      fileName =
        photoData?.filename ||
        photoData?.name ||
        `google-photo-${Date.now()}.jpg`;
    } else if (srcType === "dropbox") {
      // Para Dropbox, source es { dropboxBlob, dropboxFile }
      file = source.dropboxBlob;
      fileName = source.dropboxFile?.name || `dropbox-photo-${Date.now()}.jpg`;
    } else {
      // Para archivos locales, source es un File object
      file = source;
      fileName = file.name;
    }

    // Extraer datos EXIF básicos del archivo original
    let exifData = null;
    try {
      if (file) {
        const rawExifData = await extractBasicExifData(file);
        exifData = getCompactExifSummary(rawExifData);
      }
    } catch (error) {
      console.warn(`⚠️ Could not extract EXIF data from ${fileName}:`, error);
    }

    // A partir de aquí, flujo idéntico para ambos tipos
    const [resizedBlob, thumbnailBlob] = await Promise.all([
      resizeImage(file, UPLOAD_MAX_WIDTH, UPLOAD_MAX_SIZE_BYTES),
      resizeImage(file, UPLOAD_THUMB_MAX_WIDTH, UPLOAD_THUMB_MAX_SIZE_BYTES),
    ]);

    // Llamar al endpoint unificado
    const endpoint = "/api/catalog/uploadPhoto";
    const payload = {
      fileType: resizedBlob.type,
      originalName: fileName,
      source:
        srcType === "google"
          ? { type: "google" }
          : srcType === "dropbox"
            ? { type: "dropbox" }
            : { type: "local" },
      exifData: exifData, // Incluir datos EXIF básicos
    };

    const response = await api.post(endpoint, payload);
    const { uploadUrl, thumbnailUploadUrl, photo } = response.data;

    // Subir ambas imágenes con manejo de errores y retry
    const uploadResults = await Promise.allSettled([
      uploadToR2WithRetry(uploadUrl, resizedBlob, fileName, "main"),
      uploadToR2WithRetry(
        thumbnailUploadUrl,
        thumbnailBlob,
        fileName,
        "thumbnail",
      ),
    ]);

    // Verificar que ambas subidas fueron exitosas
    const failedUploads = uploadResults.filter(
      (result) => result.status === "rejected",
    );
    if (failedUploads.length > 0) {
      console.error(`❌ Failed uploads for ${fileName}:`, failedUploads);
      throw new Error(
        `Failed to upload ${failedUploads.length} of 2 files for ${fileName}`,
      );
    }

    photo.status = "uploaded";
    photo.isDuplicate = false;

    if (photosStore.showUploadProgress === false) {
      pendingPhotos.value.push(photo);
    } else {
      photosStore.photos.unshift(photo);
    }

    uploadedCount.value++;
    return photo;
  }

  // Flujo común de post-procesamiento (solo marca como subidas)
  async function handlePostUpload(photosToUpload) {
    // Solo proceder si tenemos fotos exitosas
    if (photosToUpload.length === 0) {
      // Verificar si el email no está confirmado
      if (!userStore.user?.isEmailConfirmed) {
        message.error("Please confirm your email before importing photos.");
      } else {
        // message.error("No photos were uploaded successfully.");
      }
      return false;
    }

    // Añadir fotos pendientes al store si es necesario
    if (photosStore.showUploadProgress === false) {
      pendingPhotos.value.forEach((photo) => {
        photosStore.photos.unshift(photo);
      });
      pendingPhotos.value = [];
    }

    // Marcar fotos como subidas
    const photoIds = photosToUpload.map((p) => p.id);
    photoIds.forEach((id) => {
      photosStore.updatePhoto(id, { status: "uploaded" });
    });

    // Update usage after successful upload
    await userStore.fetchUsage();

    return true;
  }

  // Función para validar límites de subida
  function validateUploadLimits(filesToUploadCount) {
    const user = userStore.user;
    if (!user?.usage) {
      // Si no hay datos de usage, permitir subida (fallback)
      return { isValid: true };
    }

    const { photosRemaining } = user.usage;

    // Verificar si no hay fotos restantes
    if (photosRemaining <= 0) {
      return {
        isValid: false,
        reason: "upload_limit_reached",
        message:
          "You have reached your photo upload limit. Please upgrade your plan to upload more photos.",
      };
    }

    // Verificar si intenta subir más fotos de las disponibles
    if (filesToUploadCount > photosRemaining) {
      return {
        isValid: false,
        reason: "exceeds_remaining",
        message: `You can only upload ${photosRemaining} more photos. You're trying to upload ${filesToUploadCount} photos. Please select fewer files or upgrade your plan.`,
      };
    }

    return { isValid: true };
  }

  // Comprueba una muestra de las fotos contra Google Safe Search antes de subirlas.
  // Devuelve true si el lote puede continuar, false si se detecta contenido inapropiado.
  async function runSafeSearchCheck(sources, srcType = "local") {
    const count = sources.length;
    const sampleCount = Math.min(
      SAFE_SEARCH_MAX_SAMPLES,
      Math.max(
        SAFE_SEARCH_MIN_SAMPLES,
        Math.ceil(count * SAFE_SEARCH_SAMPLE_RATIO),
      ),
    );

    // Random sample
    const shuffled = [...sources].sort(() => Math.random() - 0.5);
    const sample = shuffled.slice(0, sampleCount);

    // Extract raw file blobs regardless of source type
    const files = sample.map((source) => {
      if (srcType === "google") return source.googlePhotoBlob;
      if (srcType === "dropbox") return source.dropboxBlob;
      return source;
    });

    // Resize to small dimensions for a lightweight payload
    const base64Images = await Promise.all(
      files.map(async (file) => {
        const resized = await resizeImage(
          file,
          SAFE_SEARCH_MAX_WIDTH,
          SAFE_SEARCH_MAX_SIZE_BYTES,
        );
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            // Strip "data:image/...;base64," prefix – send raw base64 only
            resolve(reader.result.split(",")[1]);
          };
          reader.readAsDataURL(resized);
        });
      }),
    );

    const result = await api.post("/api/moderation/safe-search", {
      images: base64Images,
    });
    return result.data;
  }

  // Función principal para manejar el upload con progreso y errores
  async function handleUploadFlow(sources, srcType = "local") {
    if (sources.length === 0) return;

    // Validar límites antes de iniciar la subida
    const validation = validateUploadLimits(sources.length);
    if (!validation.isValid) {
      message.error(validation.message);
      return;
    }

    isUploading.value = true;

    // Safe Search pre-check (lightweight, before the real upload)
    try {
      const safeSearchResult = await runSafeSearchCheck(sources, srcType);
      if (!safeSearchResult.passed) {
        showSafeSearchViolationModal.value = true;
        isUploading.value = false;
        return;
      }
    } catch (err) {
      // Fail open: if the check is unavailable, continue with the upload
      console.warn(
        "⚠️ Safe search check unavailable, proceeding with upload:",
        err,
      );
    }

    totalFiles.value = sources.length;
    uploadedCount.value = 0;

    const photosToUpload = [];
    const failedUploads = [];

    try {
      // Ambos tipos usan el mismo flujo individual con pLimit
      const uploadPromises = sources.map((source) =>
        limit(() =>
          processPhotoSource(source, srcType)
            .then((photo) => {
              if (photo) photosToUpload.push(photo);
            })
            .catch((error) => {
              const fileName =
                srcType === "google"
                  ? source.googlePhotoMediaItem?.filename ||
                    source.googlePhotoMediaItem?.name ||
                    "unknown"
                  : source.name;
              console.error(`❌ Failed to upload ${fileName}:`, error);
              failedUploads.push({ file: fileName, error: error.message });
              uploadedCount.value++;
            }),
        ),
      );

      await Promise.all(uploadPromises);

      // // Mostrar resumen de la subida
      // if (failedUploads.length > 0) {
      //   message.warning(
      //     `${photosToUpload.length} photos uploaded successfully. ${failedUploads.length} photos failed to upload.`
      //   );
      // } else {
      //   console.log(
      //     `✅ All ${photosToUpload.length} photos uploaded successfully`
      //   );
      // }

      // Post-procesamiento común
      await handlePostUpload(photosToUpload);
    } catch (error) {
      console.error("❌ Error en la subida:", error);
      message.error("An unexpected error occurred during upload.");
    } finally {
      isUploading.value = false;
    }
  }

  return {
    // Estado
    isUploading,
    uploadedCount,
    totalFiles,
    overallProgress,
    showSafeSearchViolationModal,

    // Funciones
    handleUploadFlow,
    processPhotoSource,
    handlePostUpload,
    validateUploadLimits,
  };
}
