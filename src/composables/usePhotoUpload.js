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

// Marca de "Don't show this again" del aviso de duplicados posterior a la
// importación. La lee el propio chequeo y la escribe LightboxPhotos.
export const DUPLICATES_WARNING_DISMISS_KEY =
  "import_duplicates_warning_dismissed";

// Tamaño de workspace (fotos procesadas o procesándose) a partir del cual el
// chequeo automático de duplicados deja de ejecutarse tras cada importación.
export const AUTO_DUPLICATES_CHECK_MAX_WORKSPACE_PHOTOS = 2000;

export function usePhotoUpload() {
  const photosStore = usePhotosStore();
  const userStore = useUserStore();
  const { resizeImage, uploadToR2WithRetry } = useImageProcessing();
  const message = useMessage();
  const limit = pLimit(10);

  // Estado compartido de upload
  const isUploading = ref(false);
  // Fase "Finalizing" (post-proceso + chequeo de duplicados). Se respalda en el
  // store para que otras vistas — p.ej. el botón flotante de analizar — puedan
  // reaccionar sin tener que instanciar este composable.
  const isFinalizing = computed({
    get: () => photosStore.isFinalizingImport,
    set: (value) => {
      photosStore.isFinalizingImport = value;
    },
  });
  const uploadedCount = ref(0);
  const totalFiles = ref(0);
  const pendingPhotos = ref([]); // Array temporal para fotos subidas pero no mostradas
  const showSafeSearchViolationModal = ref(false);
  const safeSearchUserDeactivated = ref(false);
  const showDuplicatesFoundModal = ref(false);
  const duplicatesFound = ref({ batch: 0, workspace: 0, total: 0 });

  const overallProgress = computed(() => {
    if (totalFiles.value === 0) return 0;
    return (uploadedCount.value / totalFiles.value) * 100;
  });

  // Función principal para procesar cualquier tipo de fuente de foto
  async function processPhotoSource(source, srcType = "local", options = {}) {
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
    } else if (srcType === "drive") {
      // Para Google Drive, source es { driveBlob, driveFile }
      file = source.driveBlob;
      fileName = source.driveFile?.name || `drive-photo-${Date.now()}.jpg`;
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

    // Construir el objeto `source` que el backend guarda tal cual en
    // descriptions.source. Para fuentes locales, si se pide replicar la
    // estructura de carpetas, adjuntamos folderPath (segmentos de
    // webkitRelativePath sin el nombre de archivo). LightroomFolderMirrorService
    // lo lee luego para materializar una colección por carpeta.
    let sourcePayload;
    if (srcType === "google") {
      sourcePayload = { type: "google" };
    } else if (srcType === "dropbox") {
      sourcePayload = { type: "dropbox" };
    } else if (srcType === "drive") {
      sourcePayload = { type: "drive" };
    } else {
      sourcePayload = { type: "local" };
      if (options.mirrorFolders && file?.webkitRelativePath) {
        const folderPath = file.webkitRelativePath
          .split("/")
          .filter(Boolean)
          .slice(0, -1); // drop the filename, keep the folder hierarchy
        if (folderPath.length > 0) sourcePayload.folderPath = folderPath;
      }
    }

    // Llamar al endpoint unificado
    const endpoint = "/api/catalog/uploadPhoto";
    const payload = {
      fileType: resizedBlob.type,
      originalName: fileName,
      source: sourcePayload,
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
      message.error(`Failed to upload ${fileName}. Please try again later.`);
      throw new Error(
        `Failed to upload ${failedUploads.length} of 2 files for ${fileName}`,
      );
    }

    // Confirmar al backend que ambos objetos (main + thumbnail) llegaron a R2.
    // Sin esta confirmación, el barrido de huérfanas eliminará la foto.
    await api.post("/api/catalog/confirmUpload", { photoIds: [photo.id] });

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

  // Chequeo automático de duplicados por similitud visual al terminar una
  // importación. Muchos usuarios no usan el botón "Duplicates", así que lo
  // corremos nosotros y solo les interrumpimos si realmente hay algo que revisar.
  // Marca las fotos del lightbox igual que el flujo manual, de modo que pulsar
  // "Review" solo tenga que entrar en el modo de revisión ya calculado.
  async function runPostImportDuplicatesCheck() {
    // Si el usuario marcó "Don't show this again" nos saltamos el chequeo
    // entero, no solo el modal: así tampoco pagamos la llamada ni la espera.
    if (localStorage.getItem(DUPLICATES_WARNING_DISMISS_KEY) === "true") return;

    // Por encima del umbral el chequeo sale caro (el backend compara el lote
    // contra todo el catálogo), así que a partir de ahí los duplicados se
    // revisan a mano con el botón "Duplicates". El modal lo avisa.
    debugger;
    if (
      (photosStore.workspacePhotos?.length ?? 0) >=
      AUTO_DUPLICATES_CHECK_MAX_WORKSPACE_PHOTOS
    ) {
      return;
    }

    const lightboxIds = (photosStore.lightboxPhotos || []).map((p) => p.id);
    if (lightboxIds.length < 2) return;

    isFinalizing.value = true;
    try {
      await photosStore.checkSimilarDuplicates(lightboxIds, "lightbox");

      const lightboxPhotos = photosStore.lightboxPhotos || [];
      const batch = lightboxPhotos.filter((p) => p.isExactDuplicate).length;
      const workspace = lightboxPhotos.filter(
        (p) => p.isAlreadyAnalyzed,
      ).length;
      const total = lightboxPhotos.filter(
        (p) => p.isExactDuplicate || p.isAlreadyAnalyzed,
      ).length;

      if (total > 0) {
        duplicatesFound.value = { batch, workspace, total };
        showDuplicatesFoundModal.value = true;
      }
    } catch (error) {
      // Nunca bloqueamos la importación por un fallo del chequeo
      console.warn("⚠️ Post-import duplicates check failed:", error);
    } finally {
      isFinalizing.value = false;
    }
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
      if (srcType === "drive") return source.driveBlob;
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
  async function handleUploadFlow(sources, srcType = "local", options = {}) {
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
        safeSearchUserDeactivated.value = Boolean(
          safeSearchResult.userDeactivated,
        );
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
          processPhotoSource(source, srcType, options)
            .then((photo) => {
              if (photo) photosToUpload.push(photo);
            })
            .catch((error) => {
              const fileName =
                srcType === "google"
                  ? source.googlePhotoMediaItem?.filename ||
                    source.googlePhotoMediaItem?.name ||
                    "unknown"
                  : srcType === "dropbox"
                    ? source.dropboxFile?.name || "unknown"
                    : srcType === "drive"
                      ? source.driveFile?.name || "unknown"
                      : source.name;
              console.error(`❌ Failed to upload ${fileName}:`, error);
              failedUploads.push({ file: fileName, error: error.message });
              uploadedCount.value++;
            }),
        ),
      );

      await Promise.all(uploadPromises);

      // All files are uploaded — switch the progress bar to its "Finalizing"
      // state before running post-processing (fetchUsage, store updates, the
      // duplicates check…). isFinalizing se activa antes de bajar isUploading
      // para que la barra no llegue a desaparecer entre ambas fases.
      isFinalizing.value = true;
      isUploading.value = false;
      totalFiles.value = 0;
      uploadedCount.value = 0;

      // Post-procesamiento común
      await handlePostUpload(photosToUpload);

      // Log a single batch activity for all successfully uploaded photos
      if (photosToUpload.length > 0) {
        const source =
          srcType === "google"
            ? "google"
            : srcType === "dropbox"
              ? "dropbox"
              : srcType === "drive"
                ? "drive"
                : "local";
        api
          .post("/api/catalog/uploadFinished", {
            count: photosToUpload.length,
            source,
          })
          .catch(() => {});

        // Chequeo de duplicados en background antes de soltar la barra
        await runPostImportDuplicatesCheck();
      }
    } catch (error) {
      console.error("❌ Error en la subida:", error);
      message.error("An unexpected error occurred during upload.");
    } finally {
      isUploading.value = false;
      isFinalizing.value = false;
    }
  }

  return {
    // Estado
    isUploading,
    isFinalizing,
    uploadedCount,
    totalFiles,
    overallProgress,
    showSafeSearchViolationModal,
    safeSearchUserDeactivated,
    showDuplicatesFoundModal,
    duplicatesFound,

    // Funciones
    handleUploadFlow,
    processPhotoSource,
    handlePostUpload,
    validateUploadLimits,
  };
}
