/**
 * use2DTextureManager.js
 *
 * 2D (PixiJS) texture lifecycle manager, modeled after the 3D texture manager:
 * - Loads cached image blobs from IndexedDB
 * - Downloads images with retry logic for transient failures (incl. 429-like situations)
 * - Creates PIXI.Textures on-demand and caches them in-memory
 * - Bulk-caches newly downloaded images into IndexedDB for future sessions
 */

import { ref } from "vue";
import * as PIXI from "pixi.js";
import { useIndexedDBCache } from "@/composables/useIndexedDBCache.js";

// ===== Texture downscale configuration (GPU/RAM protection) =====
// Pixi will upload the full source dimensions to GPU. Capping maxSide is a big win on low-memory devices.
const CONFIG_2D_TEXTURE = {
  lowResMaxSide: 256,
  desktopMaxSide: 512,
  // When zooming into a single photo, allow a higher cap for better fidelity.
  // Still capped to avoid OOM on constrained devices.
  lowResMaxSideOriginal: 512,
  desktopMaxSideOriginal: 1024,
};

// ===== Retry configuration (similar to 3D) =====
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const RETRY_MULTIPLIER = 2;
const MAX_RETRY_DELAY = 10000;

// Set true temporarily if you want verbose cache logs
const DEBUG_2D_CACHE = false;

export function use2DTextureManager(
  useLowPerformance = false,
  isPlayground = false,
) {
  // In-memory caches
  const downloadedImagesCache = new Map(); // cacheKey -> HTMLImageElement
  const textureCache = new Map(); // cacheKey -> PIXI.Texture

  // Progress/state (optional but useful for UI)
  const totalPhotosToLoad = ref(0);
  const loadedPhotosCount = ref(0);
  const loadingProgress = ref(0);

  const loaderStage = ref("loading"); // 'loading' | 'downloading' | 'caching'
  const loaderTitle = ref("");
  const loaderSubtitle = ref("");

  const error429Stats = ref({
    total: 0,
    retried: 0,
    recovered: 0,
    failed: 0,
  });

  // IndexedDB cache
  const {
    initDB,
    bulkLoadFromCache,
    bulkCacheImages,
    getCacheStats,
    urlToBlob,
  } = useIndexedDBCache();

  const cacheStats = ref({ totalImages: 0 });
  const cachedPhotoIds = ref(new Set());

  const cacheKey = (photoId, quality) => `${photoId}:${quality}`;

  const getImageUrlForPhoto = (photo, quality = "thumb") => {
    if (!photo) return null;
    if (quality === "original") {
      return photo?.originalUrl || photo?.thumbnailUrl || null;
    }
    // thumb/default
    return photo?.thumbnailUrl || photo?.originalUrl || null;
  };

  const updateLoadingProgress = (loaded, total) => {
    totalPhotosToLoad.value = total;
    loadedPhotosCount.value = loaded;
    if (!total) {
      loadingProgress.value = 0;
      return;
    }
    loadingProgress.value = Math.min(Math.round((loaded / total) * 100), 100);
  };

  const loadImageElement = (imageUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (error) => reject(error);
      img.src = imageUrl;
    });
  };

  const blobToImageElement = async (blob) => {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = objectUrl;
      });
      return img;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  /**
   * Downscale an image-like source to a maximum side length.
   * Returns either the original source (if already small) or a Canvas.
   *
   * IMPORTANT: This caps GPU texture size, which is typically the main memory pressure point.
   */
  const downscaleSource = (source, maxSide) => {
    try {
      const maxSideNum = Math.max(1, Number(maxSide) || 0);
      if (!source || !maxSideNum) return source;

      const w0 = source.width || source.naturalWidth || 0;
      const h0 = source.height || source.naturalHeight || 0;
      if (!w0 || !h0) return source;

      if (w0 <= maxSideNum && h0 <= maxSideNum) return source;

      const scale = Math.min(maxSideNum / w0, maxSideNum / h0);
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return source;

      // Default smoothing is usually fine; keep it enabled.
      ctx.imageSmoothingEnabled = true;
      try {
        // Not supported everywhere.
        ctx.imageSmoothingQuality = "high";
      } catch (_) {}

      ctx.drawImage(source, 0, 0, w, h);
      return canvas;
    } catch (_) {
      return source;
    }
  };

  /**
   * Download image into memory (no PIXI.Texture creation yet)
   */
  const downloadImageOnly = async (
    photoObj,
    retryCount = 0,
    quality = "thumb",
    { urlOverride = null } = {},
  ) => {
    if (!photoObj) return;
    const isOriginal = quality === "original";

    const downloadedFlag = isOriginal
      ? "__originalImageDownloaded"
      : "__imageDownloaded";
    const downloadingFlag = isOriginal
      ? "__originalDownloading"
      : "__downloading";
    const downloadErrorFlag = isOriginal
      ? "__originalDownloadError"
      : "__downloadError";

    if (photoObj[downloadedFlag] || photoObj[downloadingFlag]) return;

    photoObj[downloadingFlag] = true;

    const imageUrl = urlOverride || getImageUrlForPhoto(photoObj, quality);
    if (!imageUrl) {
      photoObj[downloadingFlag] = false;
      photoObj[downloadedFlag] = true;
      photoObj[downloadErrorFlag] = true;
      return;
    }

    try {
      // Prefer fetching as Blob so caching doesn't rely on canvas reads.
      // If fetch fails (CORS/opaque), fall back to <img> load.
      let imageBlob = null;
      try {
        imageBlob = await urlToBlob(imageUrl);
      } catch (_) {
        imageBlob = null;
      }

      const imageElement = imageBlob
        ? await blobToImageElement(imageBlob)
        : await loadImageElement(imageUrl);

      downloadedImagesCache.set(cacheKey(photoObj.id, quality), imageElement);

      if (isOriginal) {
        photoObj.__originalImageElement = imageElement;
        photoObj.__originalImageUrl = imageUrl;
        photoObj.__originalImageDownloaded = true;
        photoObj.__originalDownloadError = false;
        photoObj.__originalRetryCount = undefined;
      } else {
        photoObj.__imageElement = imageElement;
        photoObj.__imageUrl = imageUrl;
        if (imageBlob) photoObj.__imageBlob = imageBlob;
        photoObj.__imageDownloaded = true;
        photoObj.__downloadError = false;
        photoObj.__fromCache = false;
        photoObj.__retryCount = undefined;
      }

      if (photoObj.__had429Error) {
        error429Stats.value.recovered++;
        photoObj.__had429Error = false;
      }
    } catch (e) {
      const is429Error =
        e?.message?.includes("429") ||
        e?.toString?.().includes("429") ||
        e?.status === 429;

      if (is429Error) {
        error429Stats.value.total++;
        photoObj.__had429Error = true;
      }

      // For <img> loads we rarely get status codes; treat empty message as transient.
      if (retryCount < MAX_RETRIES && (is429Error || !e?.message)) {
        error429Stats.value.retried++;
        if (isOriginal) photoObj.__originalRetryCount = retryCount + 1;
        else photoObj.__retryCount = retryCount + 1;

        const delay = Math.min(
          INITIAL_RETRY_DELAY * Math.pow(RETRY_MULTIPLIER, retryCount),
          MAX_RETRY_DELAY,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        photoObj[downloadingFlag] = false;
        return downloadImageOnly(photoObj, retryCount + 1, quality, {
          urlOverride,
        });
      }

      error429Stats.value.failed++;
      photoObj[downloadedFlag] = true;
      photoObj[downloadErrorFlag] = true;
    } finally {
      photoObj[downloadingFlag] = false;
    }
  };

  /**
   * Load cached blobs from IndexedDB, convert them back to Image elements.
   */
  const loadImagesFromCache = async (photos) => {
    loaderStage.value = "loading";
    loaderTitle.value = "Loading photos";
    loaderSubtitle.value = "Checking local storage...";

    if (isPlayground) {
      return new Map();
    }

    const photoIds = (photos || []).map((p) => p.id);
    if (photoIds.length === 0) {
      cacheStats.value = await getCacheStats();
      return new Map();
    }

    try {
      const cachedBlobs = await bulkLoadFromCache(photoIds);

      if (cachedBlobs.size > 0) {
        cachedPhotoIds.value = new Set(cachedBlobs.keys());

        for (const [photoId, blob] of cachedBlobs.entries()) {
          try {
            const imageUrl = URL.createObjectURL(blob);
            const img = await new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = () => {
                URL.revokeObjectURL(imageUrl);
                resolve(image);
              };
              image.onerror = (err) => {
                URL.revokeObjectURL(imageUrl);
                reject(err);
              };
              image.src = imageUrl;
            });

            downloadedImagesCache.set(cacheKey(photoId, "thumb"), img);

            const photo = photos.find((p) => p.id === photoId);
            if (photo) {
              photo.__imageDownloaded = true;
              photo.__downloadError = false;
              photo.__fromCache = true;
              photo.__imageElement = img;
              photo.__imageUrl = getImageUrlForPhoto(photo, "thumb");
            }
          } catch (error) {
            cachedPhotoIds.value.delete(photoId);
          }
        }
      }

      cacheStats.value = await getCacheStats();
      return cachedBlobs;
    } catch (error) {
      return new Map();
    }
  };

  const getOrCreateTexture = async (
    photoObj,
    { quality = "thumb", urlOverride = null } = {},
  ) => {
    if (!photoObj?.id) return null;

    const isOriginal = quality === "original";
    const key = cacheKey(photoObj.id, quality);

    const cachedTexture = textureCache.get(key);
    if (cachedTexture && !cachedTexture.destroyed) {
      return cachedTexture;
    }

    const downloadedFlag = isOriginal
      ? "__originalImageDownloaded"
      : "__imageDownloaded";
    const downloadErrorFlag = isOriginal
      ? "__originalDownloadError"
      : "__downloadError";

    // Ensure image is in memory (cache or download)
    if (!photoObj[downloadedFlag] && !downloadedImagesCache.has(key)) {
      loaderStage.value = "downloading";
      await downloadImageOnly(photoObj, 0, quality, { urlOverride });
    }

    if (photoObj[downloadErrorFlag]) return null;

    const imageElement =
      downloadedImagesCache.get(key) ||
      (isOriginal ? photoObj.__originalImageElement : photoObj.__imageElement);
    if (!imageElement) return null;

    // Downscale source before uploading to GPU to reduce memory pressure.
    const maxSide = useLowPerformance
      ? isOriginal
        ? CONFIG_2D_TEXTURE.lowResMaxSideOriginal
        : CONFIG_2D_TEXTURE.lowResMaxSide
      : isOriginal
        ? CONFIG_2D_TEXTURE.desktopMaxSideOriginal
        : CONFIG_2D_TEXTURE.desktopMaxSide;
    const sourceForTexture = downscaleSource(imageElement, maxSide);

    const texture = PIXI.Texture.from(sourceForTexture);
    textureCache.set(key, texture);

    photoObj.__textureLoaded = true;

    return texture;
  };

  /**
   * Bulk-cache images that were downloaded this session.
   */
  const bulkCacheDownloadedImages = async (photos) => {
    if (isPlayground) return;

    loaderStage.value = "caching";
    loaderTitle.value = "Caching images";
    loaderSubtitle.value = "Saving images for faster future loads...";

    const imagesToCache = [];

    for (const photo of photos || []) {
      if (!photo?.id) continue;
      if (photo.__fromCache) continue;

      const imageElement =
        downloadedImagesCache.get(cacheKey(photo.id, "thumb")) ||
        photo.__imageElement;

      if (photo.__imageDownloaded && !photo.__downloadError && imageElement) {
        try {
          // Best path: we already have the blob from download.
          if (photo.__imageBlob instanceof Blob) {
            imagesToCache.push({
              id: photo.id,
              blob: photo.__imageBlob,
              url: photo.__imageUrl || getImageUrlForPhoto(photo, "thumb"),
            });
            continue;
          }

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          canvas.width = imageElement.width;
          canvas.height = imageElement.height;
          ctx.drawImage(imageElement, 0, 0);

          let blob = await new Promise((resolve) => {
            try {
              canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
            } catch (_) {
              resolve(null);
            }
          });

          // Fallback: if canvas is tainted (CORS) or toBlob returned null, try fetching directly.
          if (!blob) {
            const url = photo.__imageUrl || getImageUrlForPhoto(photo, "thumb");
            if (url) {
              try {
                blob = await urlToBlob(url);
              } catch (_) {
                blob = null;
              }
            }
          }

          if (blob) {
            imagesToCache.push({
              id: photo.id,
              blob,
              url: photo.__imageUrl || getImageUrlForPhoto(photo, "thumb"),
            });
          }
        } catch (_) {
          // ignore per-image cache errors
        }
      }
    }

    if (imagesToCache.length > 0) {
      try {
        if (DEBUG_2D_CACHE) {
          console.log(
            `💾 [2D] bulkCacheDownloadedImages -> caching ${imagesToCache.length} blobs`,
          );
        }
        const result = await bulkCacheImages(imagesToCache);
        if (DEBUG_2D_CACHE) {
          console.log(`✅ [2D] bulk cache result:`, result);
        }
        if (result?.success) {
          imagesToCache.forEach(({ id }) => cachedPhotoIds.value.add(id));
        }
        cacheStats.value = await getCacheStats();
      } catch (_) {
        // ignore cache failure
      }
    } else {
      if (DEBUG_2D_CACHE) {
        console.log(
          "ℹ️ [2D] bulkCacheDownloadedImages: nothing to cache (0 blobs)",
        );
      }
    }
  };

  const reset = ({ destroyTextures = true } = {}) => {
    if (destroyTextures) {
      for (const texture of textureCache.values()) {
        try {
          texture.destroy(true);
        } catch (_) {}
      }
    }
    textureCache.clear();
    downloadedImagesCache.clear();

    totalPhotosToLoad.value = 0;
    loadedPhotosCount.value = 0;
    loadingProgress.value = 0;

    loaderStage.value = "loading";
    loaderTitle.value = "";
    loaderSubtitle.value = "";

    error429Stats.value = {
      total: 0,
      retried: 0,
      recovered: 0,
      failed: 0,
    };
  };

  const releaseTexture = (photoId, quality = "original") => {
    if (!photoId) return;
    const key = cacheKey(photoId, quality);
    const texture = textureCache.get(key);
    if (texture && !texture.destroyed) {
      try {
        texture.destroy(true);
      } catch (_) {}
    }
    textureCache.delete(key);
    // Free decoded image element too (GC will reclaim it when unreferenced)
    downloadedImagesCache.delete(key);
  };

  return {
    // state
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

    // methods
    initDB,
    getCacheStats,
    loadImagesFromCache,
    getOrCreateTexture,
    bulkCacheDownloadedImages,
    updateLoadingProgress,
    releaseTexture,
    reset,
  };
}
