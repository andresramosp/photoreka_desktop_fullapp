/**
 * usePhotoTextureManager.js
 *
 * Composable para gestionar el ciclo completo de texturas 3D:
 * - Descarga de imágenes (con retry logic para errores 429)
 * - Caché en IndexedDB
 * - Creación incremental de texturas Three.js
 * - Gestión de colas y prioridades
 * - Tracking de progreso de carga
 */

import { ref, computed } from "vue";
import * as THREE from "three";
import pLimit from "p-limit";
import { useIndexedDBCache } from "@/composables/useIndexedDBCache.js";

// ===== Configuración de retry para errores 429 =====
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const RETRY_MULTIPLIER = 2;
const MAX_RETRY_DELAY = 10000;

// ===== Configuración de creación de texturas =====
const CONFIG_CREATION = {
  mobileBase: 50,
  desktopBase: 500,
  maxBatchDesktop: 1000,
  maxBatchMobile: 200,
  minBatch: 2,
  targetFrameMs: 16.6,
  upperFrameMs: 28,
  frameBudgetMsMobile: 5.5,
  frameBudgetMsDesktop: 100,
};

export function usePhotoTextureManager(
  useLowPerformance = false,
  isPlayground = false
) {
  // ===== Estado de descarga =====
  const textureQueue = ref([]);
  const queuedIds = new Set();
  const scheduledDownloads = new Set();
  const downloadedImagesCache = new Map(); // imageId -> HTMLImageElement

  // ===== Estado de creación de texturas =====
  const textureCreationQueue = [];
  let textureCreationRunning = false;
  let lastFrameCreationTime = 0;
  let adaptiveBatch = 0;

  // ===== Control de concurrencia =====
  const MAX_CONCURRENT_DOWNLOADS = 12;
  const limitTexture = pLimit(MAX_CONCURRENT_DOWNLOADS);
  let dynamicBatch = 4;
  const MIN_BATCH = 2;
  const MAX_BATCH = 10;

  // ===== Progreso y estadísticas =====
  const totalPhotosToLoad = ref(0);
  const loadedPhotosCount = ref(0);
  const loadingProgress = ref(0);
  const error429Stats = ref({
    total: 0,
    retried: 0,
    recovered: 0,
    failed: 0,
  });

  // ===== Caché IndexedDB =====
  const { initDB, bulkLoadFromCache, bulkCacheImages, getCacheStats } =
    useIndexedDBCache();

  const cacheStats = ref({ totalImages: 0 });
  const cachedPhotoIds = ref(new Set());

  // ===== Loader state =====
  const loaderStage = ref("loading"); // 'loading' | 'downloading' | 'caching' | 'creating'
  const loaderTitle = ref("");
  const loaderSubtitle = ref("");

  // ===== Geometría reutilizable =====
  const planeGeometry = new THREE.PlaneGeometry(4, 3);
  planeGeometry.attributes.position.setUsage(THREE.StaticDrawUsage);
  planeGeometry.attributes.uv.setUsage(THREE.StaticDrawUsage);
  planeGeometry.attributes.normal.setUsage(THREE.StaticDrawUsage);

  // ===== Funciones de utilidad =====

  const getBaseBatch = () =>
    useLowPerformance
      ? CONFIG_CREATION.mobileBase
      : CONFIG_CREATION.desktopBase;

  const getMaxBatch = () =>
    useLowPerformance
      ? CONFIG_CREATION.maxBatchMobile
      : CONFIG_CREATION.maxBatchDesktop;

  const getFrameBudget = () =>
    useLowPerformance
      ? CONFIG_CREATION.frameBudgetMsMobile
      : CONFIG_CREATION.frameBudgetMsDesktop;

  /**
   * Actualizar el progreso de carga
   */
  const updateLoadingProgress = (
    photosWithMaterials,
    downloadPhaseComplete
  ) => {
    if (totalPhotosToLoad.value === 0) {
      loadedPhotosCount.value = 0;
      loadingProgress.value = 0;
      return;
    }

    const loadedPhotos = downloadPhaseComplete
      ? photosWithMaterials.filter((photo) => photo.__textureLoaded)
      : photosWithMaterials.filter((photo) => photo.__imageDownloaded);

    loadedPhotosCount.value = loadedPhotos.length;

    const progress = Math.round(
      (loadedPhotosCount.value / totalPhotosToLoad.value) * 100
    );
    loadingProgress.value = Math.min(progress, 100);
  };

  /**
   * Descargar imagen sin crear textura Three.js
   */
  const downloadImageOnly = async (
    photoObj,
    retryCount = 0,
    isOnDemandRetry = false
  ) => {
    if (photoObj.__imageDownloaded || photoObj.__downloading) return;
    photoObj.__downloading = true;
    const imageUrl =
      photoObj.thumbnailUrl || photoObj.url || photoObj.originalUrl;

    if (!imageUrl) {
      photoObj.__downloading = false;
      photoObj.__imageDownloaded = true;
      photoObj.__downloadError = true;
      return;
    }

    try {
      const imageElement = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (error) => reject(error);
        img.src = imageUrl;
      });

      if (!imageElement) {
        throw new Error("Image element is null");
      }

      downloadedImagesCache.set(photoObj.id, imageElement);

      photoObj.__imageElement = imageElement;
      photoObj.__imageUrl = imageUrl;
      photoObj.__imageDownloaded = true;
      photoObj.__downloadError = false;
      photoObj.__canCreateTexture = true;
      photoObj.__retryCount = undefined;

      if (photoObj.__had429Error) {
        error429Stats.value.recovered++;
        console.log(
          `✅ Foto recuperada después de error 429 (retry ${retryCount}):`,
          photoObj.id
        );
        photoObj.__had429Error = false;
      }
    } catch (e) {
      const is429Error =
        e.message?.includes("429") ||
        e.toString().includes("429") ||
        e.status === 429;

      if (is429Error) {
        error429Stats.value.total++;
        photoObj.__had429Error = true;
        console.warn(
          `⚠️ Error 429 detectado para foto ${photoObj.id} (intento ${
            retryCount + 1
          }/${MAX_RETRIES})`
        );
      }

      if (retryCount < MAX_RETRIES && (is429Error || !e.message)) {
        error429Stats.value.retried++;
        photoObj.__retryCount = retryCount + 1;

        const delay = Math.min(
          INITIAL_RETRY_DELAY * Math.pow(RETRY_MULTIPLIER, retryCount),
          MAX_RETRY_DELAY
        );

        console.log(
          `🔄 Reintentando descarga en ${delay}ms... (intento ${
            retryCount + 1
          })`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        photoObj.__downloading = false;
        return downloadImageOnly(photoObj, retryCount + 1, isOnDemandRetry);
      }

      console.warn(
        `❌ Fallo definitivo descarga imagen (${retryCount} reintentos):`,
        imageUrl,
        e
      );
      error429Stats.value.failed++;
      photoObj.__imageDownloaded = true;
      photoObj.__downloadError = true;
      if (!isOnDemandRetry) {
        photoObj.__canRetryOnDemand = true;
      }
    } finally {
      photoObj.__downloading = false;
    }
  };

  /**
   * Crear LOD object (mesh con textura Three.js)
   */
  const createLODObject = (imageElement, position) => {
    let maxSide = useLowPerformance ? 256 : 1024;
    let source = imageElement;
    const needsResize =
      imageElement.width > maxSide || imageElement.height > maxSide;

    if (needsResize) {
      const scale = Math.min(
        maxSide / imageElement.width,
        maxSide / imageElement.height
      );
      const w = Math.round(imageElement.width * scale);
      const h = Math.round(imageElement.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imageElement, 0, 0, w, h);
      source = canvas;
    }

    const texture = new THREE.Texture(source);
    texture.needsUpdate = true;

    if (useLowPerformance) {
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
    } else {
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
    }

    texture.colorSpace = THREE.SRGBColorSpace;

    try {
      texture.anisotropy = useLowPerformance ? 1 : 4;
    } catch (_) {}

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      depthTest: true,
      opacity: 1,
      side: THREE.FrontSide,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(planeGeometry, material);
    mesh.position.set(position[0], position[1], position[2]);

    // Ajustar escala para mantener aspect ratio
    const targetAspect = source.width / source.height;
    const baseAspect = 4 / 3;
    if (targetAspect > baseAspect) {
      mesh.scale.set(targetAspect / baseAspect, 1, 1);
    } else {
      mesh.scale.set(1, baseAspect / targetAspect, 1);
    }

    return mesh;
  };

  /**
   * Encolar foto para creación de textura
   */
  const enqueueTexture = (photo) => {
    if (!photo) return;
    if (photo.__textureLoaded) return;
    if (photo.__downloadError) return;
    if (!downloadedImagesCache.get(photo.id)) return;
    if (!textureCreationQueue.includes(photo)) textureCreationQueue.push(photo);
  };

  /**
   * Iniciar loop de creación de texturas
   */
  const startTextureCreationLoop = (
    lodGroup,
    photosWithMaterials,
    onProgressUpdate
  ) => {
    if (textureCreationRunning) return;
    textureCreationRunning = true;
    adaptiveBatch = getBaseBatch();
    loaderStage.value = "creating";
    loaderTitle.value = "Creating Textures";
    loaderSubtitle.value = "Preparing 3D view...";

    // Modo bulk para desktop (sin low performance)
    if (!useLowPerformance) {
      try {
        let created = 0;
        while (textureCreationQueue.length) {
          const photo = textureCreationQueue.shift();
          if (!photo) continue;
          const imageElement = downloadedImagesCache.get(photo.id);
          if (!imageElement) continue;
          try {
            const lodObject = createLODObject(imageElement, photo.position);
            if (photo.lodObject) disposeLODObject(photo.lodObject);
            photo.lodObject = lodObject;
            photo.__textureLoaded = true;
            photo.__loading = false;
            lodObject.visible = true;
            if (photo.isVisible === false && lodObject.material) {
              lodObject.material.opacity = 0;
              lodObject.material.transparent = true;
            }
            lodGroup.add(lodObject);
            photo.__imageElement = undefined;
            downloadedImagesCache.delete(photo.id);
            created++;
          } catch (err) {
            console.warn("Texture creation error (bulk)", photo.id, err);
          }
        }
        if (onProgressUpdate) onProgressUpdate();
        console.log(
          `🧩 Bulk desktop texture creation completada (${created} texturas)`
        );
      } finally {
        textureCreationRunning = false;
      }
      return;
    }

    // Modo incremental para mobile/low performance
    const step = (ts) => {
      const start = performance.now();
      const frameBudget = getFrameBudget();
      let created = 0;

      if (lastFrameCreationTime) {
        if (lastFrameCreationTime < 12 && adaptiveBatch < getMaxBatch())
          adaptiveBatch++;
        else if (
          lastFrameCreationTime > CONFIG_CREATION.upperFrameMs &&
          adaptiveBatch > CONFIG_CREATION.minBatch
        )
          adaptiveBatch--;
      }

      while (
        textureCreationQueue.length &&
        created < adaptiveBatch &&
        performance.now() - start < frameBudget
      ) {
        const photo = textureCreationQueue.shift();
        if (!photo) break;
        const imageElement = downloadedImagesCache.get(photo.id);
        if (!imageElement) continue;
        try {
          const lodObject = createLODObject(imageElement, photo.position);
          if (photo.lodObject) disposeLODObject(photo.lodObject);
          photo.lodObject = lodObject;
          photo.__textureLoaded = true;
          photo.__loading = false;
          lodObject.visible = true;
          if (photo.isVisible === false && lodObject.material) {
            lodObject.material.opacity = 0;
            lodObject.material.transparent = true;
          }
          lodGroup.add(lodObject);
          photo.__imageElement = undefined;
          downloadedImagesCache.delete(photo.id);
          created++;
        } catch (err) {
          console.warn("Texture creation error", photo.id, err);
        }
      }

      if (onProgressUpdate) onProgressUpdate();
      lastFrameCreationTime = performance.now() - start;

      if (textureCreationQueue.length) {
        requestAnimationFrame(step);
      } else {
        textureCreationRunning = false;
      }
    };

    requestAnimationFrame(step);
  };

  /**
   * Encolar todas las fotos para creación de texturas
   */
  const enqueueInitialTexturesBulk = (photosWithMaterials) => {
    photosWithMaterials.forEach((p) => {
      if (p.__imageDownloaded && !p.__textureLoaded && !p.__downloadError) {
        enqueueTexture(p);
      }
    });
    return textureCreationQueue.length;
  };

  /**
   * Limpiar cola de texturas de fotos ya cargadas
   */
  const cleanTextureQueue = (photosWithMaterials) => {
    const initialQueueLength = textureQueue.value.length;
    if (initialQueueLength === 0) return 0;

    const validIds = textureQueue.value.filter((id) => {
      const photo = photosWithMaterials.find((p) => p.id === id);
      return photo && !photo.__imageDownloaded && !photo.__downloading;
    });

    textureQueue.value.forEach((id) => {
      const photo = photosWithMaterials.find((p) => p.id === id);
      if (!photo || photo.__imageDownloaded) {
        queuedIds.delete(id);
      }
    });

    textureQueue.value = validIds;
    const cleanedCount = initialQueueLength - validIds.length;

    if (cleanedCount > 0) {
      console.log(
        `🧼 cleanTextureQueue: Limpiados ${cleanedCount} elementos obsoletos de la cola`
      );
    }

    return cleanedCount;
  };

  /**
   * Encolar fotos no cacheadas para descarga
   */
  const enqueueAllNonCachedPhotos = (photos, cameraPos) => {
    if (!photos || photos.length === 0) return 0;

    let enqueuedCount = 0;

    photos.forEach((photo) => {
      if (
        !photo.__imageDownloaded &&
        !photo.__downloading &&
        !queuedIds.has(photo.id) &&
        !scheduledDownloads.has(photo.id)
      ) {
        const dx = photo.position[0] - cameraPos.x;
        const dy = photo.position[1] - cameraPos.y;
        const dz = photo.position[2] - cameraPos.z;
        photo.__priority = dx * dx + dy * dy + dz * dz;
        textureQueue.value.push(photo.id);
        queuedIds.add(photo.id);
        enqueuedCount++;
      }
    });

    if (enqueuedCount > 0 && textureQueue.value.length > 1) {
      textureQueue.value.sort((aId, bId) => {
        const a = photos.find((p) => p.id === aId);
        const b = photos.find((p) => p.id === bId);
        return (a?.__priority || 0) - (b?.__priority || 0);
      });
    }

    return enqueuedCount;
  };

  /**
   * Cargar imágenes desde cache IndexedDB
   */
  const loadImagesFromCache = async (photos) => {
    loaderStage.value = "loading";
    loaderTitle.value = "Loading photos";
    loaderSubtitle.value = "Checking local storage...";

    const photoIds = photos.map((p) => p.id);

    console.log(
      `🔍 Cargando fotos desde cache para ${photoIds.length} fotos...`
    );

    if (isPlayground) {
      console.log(`⚠️ Cache deshabilitado en modo playground`);
      return new Map();
    }

    try {
      const cachedBlobs = await bulkLoadFromCache(photoIds);

      console.log(`✅ Cargadas ${cachedBlobs.size} imágenes desde cache`);

      if (cachedBlobs.size > 0) {
        loaderSubtitle.value = `Loading ${cachedBlobs.size} photos from cache...`;
        cachedPhotoIds.value = new Set(cachedBlobs.keys());

        let loadedFromCache = 0;
        for (const [photoId, blob] of cachedBlobs.entries()) {
          try {
            const imageUrl = URL.createObjectURL(blob);
            const img = await new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = () => {
                URL.revokeObjectURL(imageUrl);
                resolve(image);
              };
              image.onerror = reject;
              image.src = imageUrl;
            });

            downloadedImagesCache.set(photoId, img);

            const photo = photos.find((p) => p.id === photoId);
            if (photo) {
              photo.__imageDownloaded = true;
              photo.__downloadError = false;
              photo.__canCreateTexture = true;
              photo.__fromCache = true;
              photo.__imageElement = img;
              photo.__imageUrl =
                photo.thumbnailUrl || photo.url || photo.originalUrl;
            }

            loadedFromCache++;
          } catch (error) {
            console.warn(`⚠️ Error loading cached image ${photoId}:`, error);
            cachedPhotoIds.value.delete(photoId);
          }
        }

        console.log(
          `✅ ${loadedFromCache} imágenes cargadas exitosamente desde cache`
        );
      }

      cacheStats.value = await getCacheStats();
      return cachedBlobs;
    } catch (error) {
      console.error("❌ Error cargando desde cache:", error);
      return new Map();
    }
  };

  /**
   * Cachear imágenes descargadas en IndexedDB
   */
  const bulkCacheDownloadedImages = async (photosWithMaterials) => {
    if (isPlayground) {
      console.log(`⚠️ Cacheo deshabilitado en modo playground`);
      return;
    }

    loaderStage.value = "caching";
    loaderTitle.value = "Caching images";
    loaderSubtitle.value = "Saving images for faster future loads...";

    const imagesToCache = [];

    for (const photo of photosWithMaterials) {
      if (photo.__fromCache) continue;

      if (
        photo.__imageDownloaded &&
        !photo.__downloadError &&
        photo.__imageElement
      ) {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = photo.__imageElement.width;
          canvas.height = photo.__imageElement.height;
          ctx.drawImage(photo.__imageElement, 0, 0);

          const blob = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95);
          });

          if (blob) {
            imagesToCache.push({
              id: photo.id,
              blob: blob,
              url: photo.__imageUrl,
            });
          }
        } catch (error) {
          console.warn(
            `⚠️ Error preparing image ${photo.id} for cache:`,
            error
          );
        }
      }
    }

    console.log(
      `💾 Cacheando ${imagesToCache.length} imágenes en IndexedDB...`
    );

    if (imagesToCache.length > 0) {
      try {
        const result = await bulkCacheImages(imagesToCache);
        console.log(
          `✅ Cacheo completado: ${result.success} exitosos, ${result.failed} fallidos`
        );

        cacheStats.value = await getCacheStats();
        console.log(
          `📊 Total de imágenes en cache después de guardar: ${cacheStats.value.totalImages}`
        );

        imagesToCache.forEach(({ id }) => cachedPhotoIds.value.add(id));
      } catch (error) {
        console.error("❌ Error durante cacheo en bulk:", error);
      }
    }
  };

  /**
   * Disponer LOD object y liberar recursos
   */
  const disposeLODObject = (lodObject) => {
    if (!lodObject) return;
    if (lodObject.isLOD) {
      lodObject.traverse((child) => {
        if (child.isMesh) {
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      });
    } else if (lodObject.isMesh) {
      if (lodObject.material) {
        if (lodObject.material.map) lodObject.material.map.dispose();
        lodObject.material.dispose();
      }
    }
    if (lodObject.parent) lodObject.parent.remove(lodObject);
  };

  /**
   * Procesar cola de descargas
   */
  const processTextureQueue = (photosWithMaterials, onComplete) => {
    if (textureQueue.value.length === 0) return;

    // Limpiar elementos inválidos
    while (textureQueue.value.length > 0) {
      const photoId = textureQueue.value[0];
      const photo = photosWithMaterials.find((p) => p.id === photoId);

      if (!photo || photo.__imageDownloaded || photo.__downloading) {
        textureQueue.value.shift();
        queuedIds.delete(photoId);
        continue;
      }
      break;
    }

    if (textureQueue.value.length === 0) return;

    // Procesar batch de descargas
    let scheduled = 0;
    const batchSize = Math.min(dynamicBatch, textureQueue.value.length);

    for (let i = 0; i < batchSize && textureQueue.value.length > 0; i++) {
      const photoId = textureQueue.value[0];
      if (scheduledDownloads.has(photoId)) {
        textureQueue.value.shift();
        continue;
      }

      const photo = photosWithMaterials.find((p) => p.id === photoId);
      if (!photo || photo.__imageDownloaded || photo.__downloading) {
        textureQueue.value.shift();
        queuedIds.delete(photoId);
        continue;
      }

      textureQueue.value.shift();
      queuedIds.delete(photoId);
      scheduledDownloads.add(photoId);

      limitTexture(() => downloadImageOnly(photo))
        .catch(() => {})
        .finally(() => {
          scheduledDownloads.delete(photoId);
          // Llamar callback cuando termine una descarga y la cola esté vacía
          if (textureQueue.value.length === 0 && onComplete) {
            queueMicrotask(() => onComplete());
          }
        });

      scheduled++;
    }
  };

  /**
   * Resetear estado
   */
  const reset = () => {
    textureQueue.value = [];
    queuedIds.clear();
    scheduledDownloads.clear();
    downloadedImagesCache.clear();
    textureCreationQueue.length = 0;
    textureCreationRunning = false;
    totalPhotosToLoad.value = 0;
    loadedPhotosCount.value = 0;
    loadingProgress.value = 0;
    error429Stats.value = {
      total: 0,
      retried: 0,
      recovered: 0,
      failed: 0,
    };
  };

  /**
   * Actualizar dynamic batch basado en frame time
   */
  const updateDynamicBatch = (frameTime) => {
    if (frameTime < 14 && dynamicBatch < MAX_BATCH) dynamicBatch++;
    else if (frameTime > 26 && dynamicBatch > MIN_BATCH) dynamicBatch--;
  };

  return {
    // Estado
    textureQueue,
    downloadedImagesCache,
    totalPhotosToLoad,
    loadedPhotosCount,
    loadingProgress,
    error429Stats,
    cacheStats,
    cachedPhotoIds,
    loaderStage,
    loaderTitle,
    loaderSubtitle,

    // Métodos de descarga
    downloadImageOnly,
    enqueueAllNonCachedPhotos,
    processTextureQueue,
    cleanTextureQueue,

    // Métodos de caché
    loadImagesFromCache,
    bulkCacheDownloadedImages,
    initDB,
    getCacheStats,
    bulkCacheImages,
    limitTexture,

    // Métodos de creación de texturas
    createLODObject,
    enqueueTexture,
    enqueueInitialTexturesBulk,
    startTextureCreationLoop,
    disposeLODObject,

    // Utilidades
    updateLoadingProgress,
    updateDynamicBatch,
    reset,
  };
}
