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

// ===== Configuración de LOD dinámico de texturas =====
const CONFIG_LOD = {
  lowResSize: 256, // Resolución base para todas las fotos
  highResSize: 1024, // Resolución alta para fotos cercanas
  highResCount: 25, // Número de fotos cercanas en alta resolución
  hysteresisMargin: 10, // Margen para evitar flickering (upgrade a N, downgrade a N+margin)
  upgradesPerFrame: 3, // Máximo de upgrades por frame (para no saturar)
  downgradesPerFrame: 5, // Máximo de downgrades por frame
  ultraCloseDistance: 15, // Distancia para activar ultra-res (originalUrl)
  ultraCloseHysteresis: 5, // Margen de hysteresis para ultra-res (degrade a distance + hysteresis)
};

export function usePhotoTextureManager(
  useLowPerformance = false,
  isPlayground = false,
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

  // ===== Estado de LOD dinámico =====
  const highResPhotos = new Set(); // IDs de fotos actualmente en alta resolución
  const lodUpgradeQueue = []; // Cola de fotos pendientes de upgrade
  const lodDowngradeQueue = []; // Cola de fotos pendientes de downgrade

  // ===== Estado de ultra-resolución (originalUrl) =====
  let ultraResPhoto = null; // ID de la foto actualmente en ultra-res
  const ultraResCache = new Map(); // photoId -> { texture, imageElement } para restaurar
  let ultraResDownloading = false; // Flag para evitar descargas concurrentes

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
  const {
    initDB,
    bulkLoadFromCache,
    bulkCacheImages,
    getCacheStats,
    urlToBlob,
  } = useIndexedDBCache();

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
    downloadPhaseComplete,
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
      (loadedPhotosCount.value / totalPhotosToLoad.value) * 100,
    );
    loadingProgress.value = Math.min(progress, 100);
  };

  /**
   * Descargar imagen sin crear textura Three.js
   */
  const downloadImageOnly = async (
    photoObj,
    retryCount = 0,
    isOnDemandRetry = false,
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
      let imageBlob = null;
      let blobFetchError = null;

      try {
        imageBlob = await urlToBlob(imageUrl);
      } catch (error) {
        blobFetchError = error;
      }

      if (!imageBlob && blobFetchError?.isHttpError) {
        // HTTP errors (e.g. 404) are definitive for this URL; skip fallback/retries.
        throw blobFetchError;
      }

      const imageElement = imageBlob
        ? await new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(imageBlob);
            const img = new Image();
            img.onload = () => {
              URL.revokeObjectURL(objectUrl);
              resolve(img);
            };
            img.onerror = (error) => {
              URL.revokeObjectURL(objectUrl);
              reject(error);
            };
            img.src = objectUrl;
          })
        : await new Promise((resolve, reject) => {
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
          photoObj.id,
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
          }/${MAX_RETRIES})`,
        );
      }

      const isRetriableError = Boolean(e?.isRetriable) || is429Error;

      if (retryCount < MAX_RETRIES && isRetriableError) {
        error429Stats.value.retried++;
        photoObj.__retryCount = retryCount + 1;

        const delay = Math.min(
          INITIAL_RETRY_DELAY * Math.pow(RETRY_MULTIPLIER, retryCount),
          MAX_RETRY_DELAY,
        );

        console.log(
          `🔄 Reintentando descarga en ${delay}ms... (intento ${
            retryCount + 1
          })`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        photoObj.__downloading = false;
        return downloadImageOnly(photoObj, retryCount + 1, isOnDemandRetry);
      }

      console.warn(
        `❌ Fallo definitivo descarga imagen (${retryCount} reintentos):`,
        imageUrl,
        e,
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
   * Redimensionar imagen a un tamaño máximo dado
   */
  const resizeImage = (imageElement, maxSide) => {
    const needsResize =
      imageElement.width > maxSide || imageElement.height > maxSide;

    if (!needsResize) {
      return {
        source: imageElement,
        width: imageElement.width,
        height: imageElement.height,
      };
    }

    const scale = Math.min(
      maxSide / imageElement.width,
      maxSide / imageElement.height,
    );
    const w = Math.round(imageElement.width * scale);
    const h = Math.round(imageElement.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageElement, 0, 0, w, h);
    return { source: canvas, width: w, height: h };
  };

  /**
   * Crear textura Three.js desde una fuente de imagen
   */
  const createTextureFromSource = (source) => {
    const texture = new THREE.Texture(source);
    texture.needsUpdate = true;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    try {
      texture.anisotropy = 1;
    } catch (_) {}
    return texture;
  };

  /**
   * Crear LOD object (mesh con textura Three.js)
   * @param {HTMLImageElement} imageElement - Imagen original
   * @param {Array} position - Posición [x, y, z]
   * @param {string} lodLevel - 'low' o 'high' (default: 'low')
   */
  const createLODObject = (imageElement, position, lodLevel = "low") => {
    // En mobile siempre usar baja resolución
    const maxSide = useLowPerformance
      ? CONFIG_LOD.lowResSize
      : lodLevel === "high"
        ? CONFIG_LOD.highResSize
        : CONFIG_LOD.lowResSize;

    const { source, width, height } = resizeImage(imageElement, maxSide);

    const texture = createTextureFromSource(source);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      depthTest: false,
      opacity: 1,
      side: THREE.FrontSide,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(planeGeometry, material);
    mesh.position.set(position[0], position[1], position[2]);

    // Ajustar escala para mantener aspect ratio
    const targetAspect = width / height;
    const baseAspect = 4 / 3;
    if (targetAspect > baseAspect) {
      mesh.scale.set(targetAspect / baseAspect, 1, 1);
    } else {
      mesh.scale.set(1, baseAspect / targetAspect, 1);
    }

    // Guardar nivel de LOD actual en el mesh
    mesh.userData.lodLevel = lodLevel;

    return mesh;
  };

  /**
   * Actualizar textura de una foto a una resolución diferente
   * @param {Object} photo - Objeto foto con lodObject
   * @param {string} newLodLevel - 'low' o 'high'
   * @returns {boolean} - true si se actualizó, false si no fue posible
   */
  const updatePhotoTexture = (photo, newLodLevel) => {
    if (!photo || !photo.lodObject) return false;

    // Obtener imagen original del cache
    const imageElement = downloadedImagesCache.get(photo.id);
    if (!imageElement) {
      // Si no hay imagen en cache, no podemos actualizar
      return false;
    }

    const currentLevel = photo.lodObject.userData.lodLevel || "low";
    if (currentLevel === newLodLevel) return false; // Ya está en el nivel correcto

    // En mobile, no hacer upgrades
    if (useLowPerformance && newLodLevel === "high") return false;

    const maxSide =
      newLodLevel === "high" ? CONFIG_LOD.highResSize : CONFIG_LOD.lowResSize;

    const { source } = resizeImage(imageElement, maxSide);
    const newTexture = createTextureFromSource(source);

    // Disponer textura anterior
    const oldMaterial = photo.lodObject.material;
    if (oldMaterial && oldMaterial.map) {
      oldMaterial.map.dispose();
    }

    // Asignar nueva textura
    oldMaterial.map = newTexture;
    oldMaterial.needsUpdate = true;
    photo.lodObject.userData.lodLevel = newLodLevel;

    return true;
  };

  /**
   * Descargar imagen original (originalUrl) para ultra-resolución
   */
  const downloadOriginalImage = async (photo, originalUrl) => {
    try {
      const imageElement = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (error) => reject(error);
        img.src = originalUrl;
      });
      return imageElement;
    } catch (error) {
      console.warn(
        `❌ Error descargando originalUrl para foto ${photo.id}:`,
        error,
      );
      return null;
    }
  };

  /**
   * Promocionar foto a ultra-resolución (originalUrl)
   * @param {Object} photo - Objeto foto
   * @param {string} originalUrl - URL de la imagen original de máxima calidad
   */
  const upgradeToUltraRes = async (photo, originalUrl) => {
    if (!photo || !photo.lodObject) return false;
    if (useLowPerformance) return false; // No en mobile
    if (ultraResDownloading) return false; // Evitar descargas concurrentes
    if (!originalUrl || originalUrl === photo.__imageUrl) return false; // Ya tiene la original

    ultraResDownloading = true;

    try {
      // Descargar imagen original
      const originalImage = await downloadOriginalImage(photo, originalUrl);
      if (!originalImage) {
        ultraResDownloading = false;
        return false;
      }

      // Guardar textura actual para poder restaurarla
      const currentMaterial = photo.lodObject.material;
      if (currentMaterial && currentMaterial.map) {
        ultraResCache.set(photo.id, {
          texture: currentMaterial.map,
          level: photo.lodObject.userData.lodLevel || "high",
        });
      }

      // Crear nueva textura en máxima resolución (sin límite de tamaño)
      const texture = createTextureFromSource(originalImage);

      // Reemplazar textura
      if (currentMaterial.map && !ultraResCache.has(photo.id)) {
        currentMaterial.map.dispose();
      }
      currentMaterial.map = texture;
      currentMaterial.needsUpdate = true;
      photo.lodObject.userData.lodLevel = "ultra";
      photo.__lodLevel = "ultra";

      ultraResPhoto = photo.id;
      console.log(`🔥 Ultra-res activado para foto ${photo.id} (originalUrl)`);
      return true;
    } catch (error) {
      console.warn(`❌ Error en upgradeToUltraRes:`, error);
      return false;
    } finally {
      ultraResDownloading = false;
    }
  };

  /**
   * Degradar foto desde ultra-resolución
   */
  const downgradeFromUltraRes = (photo) => {
    if (!photo || !photo.lodObject) return false;
    if (ultraResPhoto !== photo.id) return false;

    const cached = ultraResCache.get(photo.id);
    if (!cached) {
      // No hay textura guardada, volver a crear desde cache
      const imageElement = downloadedImagesCache.get(photo.id);
      if (imageElement) {
        updatePhotoTexture(photo, "high");
      }
    } else {
      // Restaurar textura guardada
      const currentMaterial = photo.lodObject.material;
      if (currentMaterial && currentMaterial.map) {
        currentMaterial.map.dispose();
      }
      currentMaterial.map = cached.texture;
      currentMaterial.needsUpdate = true;
      photo.lodObject.userData.lodLevel = cached.level;
      photo.__lodLevel = cached.level;
      ultraResCache.delete(photo.id);
    }

    ultraResPhoto = null;
    console.log(`📉 Ultra-res desactivado para foto ${photo.id}`);
    return true;
  };

  /**
   * Promocionar foto a alta resolución
   */
  const upgradeToHighRes = (photo) => {
    if (updatePhotoTexture(photo, "high")) {
      highResPhotos.add(photo.id);
      photo.__lodLevel = "high";
      return true;
    }
    return false;
  };

  /**
   * Degradar foto a baja resolución
   */
  const downgradeToLowRes = (photo) => {
    if (updatePhotoTexture(photo, "low")) {
      highResPhotos.delete(photo.id);
      photo.__lodLevel = "low";
      return true;
    }
    return false;
  };

  /**
   * Actualizar LOD de texturas basado en distancia a cámara
   * Llamar desde el loop de animación con fotos ordenadas por distancia
   * @param {Array} sortedPhotosWithDistance - Array de {photo, distance} ordenado de cerca a lejos
   * @param {Function} getPhotoOriginalUrl - Función para obtener originalUrl de una foto por ID
   */
  const updateTextureLODs = (
    sortedPhotosWithDistance,
    getPhotoOriginalUrl = null,
  ) => {
    if (useLowPerformance) return; // En mobile no hacer LOD dinámico
    if (!sortedPhotosWithDistance || sortedPhotosWithDistance.length === 0)
      return;

    const highResCount = CONFIG_LOD.highResCount;
    const hysteresisThreshold = highResCount + CONFIG_LOD.hysteresisMargin;

    let upgrades = 0;
    let downgrades = 0;

    // 🔥 ULTRA-RES: Verificar si la foto más cercana está MUY cerca
    const closestEntry = sortedPhotosWithDistance[0];
    if (
      closestEntry &&
      closestEntry.photo &&
      closestEntry.photo.__textureLoaded
    ) {
      const { photo, distance } = closestEntry;
      const isUltraClose = distance < CONFIG_LOD.ultraCloseDistance;
      const ultraCloseHysteresisDistance =
        CONFIG_LOD.ultraCloseDistance + CONFIG_LOD.ultraCloseHysteresis;

      if (isUltraClose && ultraResPhoto !== photo.id && getPhotoOriginalUrl) {
        // Activar ultra-res para esta foto
        const originalUrl = getPhotoOriginalUrl(photo.id);
        if (originalUrl && originalUrl !== photo.__imageUrl) {
          // Si hay otra foto en ultra-res, degradarla primero
          if (ultraResPhoto) {
            const prevPhoto = sortedPhotosWithDistance.find(
              (p) => p.photo.id === ultraResPhoto,
            );
            if (prevPhoto) {
              downgradeFromUltraRes(prevPhoto.photo);
            }
          }
          upgradeToUltraRes(photo, originalUrl);
        }
      } else if (
        ultraResPhoto === photo.id &&
        distance > ultraCloseHysteresisDistance
      ) {
        // Desactivar ultra-res (te alejaste)
        downgradeFromUltraRes(photo);
      }
    } else if (ultraResPhoto && sortedPhotosWithDistance.length > 0) {
      // La foto ultra-res ya no es la más cercana, degradarla
      const ultraPhoto = sortedPhotosWithDistance.find(
        (p) => p.photo.id === ultraResPhoto,
      );
      if (ultraPhoto) {
        downgradeFromUltraRes(ultraPhoto.photo);
      }
    }

    // Procesar fotos ordenadas por distancia (LOD normal high/low)
    for (let i = 0; i < sortedPhotosWithDistance.length; i++) {
      const { photo } = sortedPhotosWithDistance[i];
      if (!photo || !photo.__textureLoaded) continue;
      if (photo.id === ultraResPhoto) continue; // Skip foto en ultra-res

      const isInHighResZone = i < highResCount;
      const isInHysteresisZone = i < hysteresisThreshold;
      const currentlyHighRes = highResPhotos.has(photo.id);

      if (isInHighResZone && !currentlyHighRes) {
        // Necesita upgrade
        if (upgrades < CONFIG_LOD.upgradesPerFrame) {
          if (upgradeToHighRes(photo)) {
            upgrades++;
          }
        }
      } else if (!isInHysteresisZone && currentlyHighRes) {
        // Fuera de zona de hysteresis, necesita downgrade
        if (downgrades < CONFIG_LOD.downgradesPerFrame) {
          if (downgradeToLowRes(photo)) {
            downgrades++;
          }
        }
      }
    }

    // Log ocasional para debug
    if (
      (upgrades > 0 || downgrades > 0 || ultraResPhoto) &&
      Math.random() < 0.05
    ) {
      const ultraMsg = ultraResPhoto ? ` | 🔥 ultra-res: ${ultraResPhoto}` : "";
      console.log(
        `🔄 LOD: ${highResPhotos.size} en alta res | +${upgrades} upgrades, -${downgrades} downgrades${ultraMsg}`,
      );
    }
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
    onProgressUpdate,
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
            photo.__lodLevel = "low";
            // NO eliminar del cache: downloadedImagesCache.delete(photo.id);
            // Mantener imagen original para poder hacer upgrade/downgrade de LOD
            created++;
          } catch (err) {
            console.warn("Texture creation error (bulk)", photo.id, err);
          }
        }
        if (onProgressUpdate) onProgressUpdate();
        console.log(
          `🧩 Bulk desktop texture creation completada (${created} texturas)`,
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
          photo.__lodLevel = "low";
          // NO eliminar del cache para permitir LOD dinámico
          // En mobile sí eliminamos para ahorrar memoria
          if (useLowPerformance) {
            downloadedImagesCache.delete(photo.id);
          }
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
        `🧼 cleanTextureQueue: Limpiados ${cleanedCount} elementos obsoletos de la cola`,
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
      `🔍 Cargando fotos desde cache para ${photoIds.length} fotos...`,
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
          `✅ ${loadedFromCache} imágenes cargadas exitosamente desde cache`,
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
            error,
          );
        }
      }
    }

    console.log(
      `💾 Cacheando ${imagesToCache.length} imágenes en IndexedDB...`,
    );

    if (imagesToCache.length > 0) {
      try {
        const result = await bulkCacheImages(imagesToCache);
        console.log(
          `✅ Cacheo completado: ${result.success} exitosos, ${result.failed} fallidos`,
        );

        cacheStats.value = await getCacheStats();
        console.log(
          `📊 Total de imágenes en cache después de guardar: ${cacheStats.value.totalImages}`,
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
    // Reset LOD state
    highResPhotos.clear();
    lodUpgradeQueue.length = 0;
    lodDowngradeQueue.length = 0;
    // Reset ultra-res state
    ultraResPhoto = null;
    ultraResCache.forEach((cached) => {
      if (cached.texture) cached.texture.dispose();
    });
    ultraResCache.clear();
    ultraResDownloading = false;
  };

  /**
   * Obtener estadísticas de LOD
   */
  const getLODStats = () => ({
    highResCount: highResPhotos.size,
    ultraResPhotoId: ultraResPhoto,
    cachedImagesCount: downloadedImagesCache.size,
    config: { ...CONFIG_LOD },
  });

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

    // Métodos de LOD dinámico
    updateTextureLODs,
    upgradeToHighRes,
    downgradeToLowRes,
    upgradeToUltraRes,
    downgradeFromUltraRes,
    getLODStats,
    highResPhotos,

    // Utilidades
    updateLoadingProgress,
    updateDynamicBatch,
    reset,
  };
}
