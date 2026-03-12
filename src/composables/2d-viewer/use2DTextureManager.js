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
    bulkCheckCache,
    bulkCacheImages,
    getCachedImage,
    getCacheStats,
    urlToBlob,
  } = useIndexedDBCache();

  const cacheStats = ref({ totalImages: 0 });
  const cachedPhotoIds = ref(new Set());

  const normalizeQuality = (quality) => {
    const q = String(quality || "low");
    if (q === "thumb") return "low";
    return q;
  };

  const cacheKey = (photoId, quality) =>
    `${photoId}:${normalizeQuality(quality)}`;

  const getImageUrlForPhoto = (photo, quality = "thumb") => {
    if (!photo) return null;
    const q = normalizeQuality(quality);
    if (q === "original") {
      // Original: prefer the full-size URL
      return photo?.originalUrl || photo?.url || photo?.thumbnailUrl || null;
    }
    // low/mid/high all use the thumbnail — it's the same source image,
    // just downscaled to different sizes when creating the PIXI texture.
    return photo?.thumbnailUrl || photo?.url || photo?.originalUrl || null;
  };

  const getFlagsForQuality = (qualityRaw) => {
    const q = normalizeQuality(qualityRaw);
    if (q === "original") {
      return {
        downloadedFlag: "__originalImageDownloaded",
        downloadingFlag: "__originalDownloading",
        downloadErrorFlag: "__originalDownloadError",
        imageElementProp: "__originalImageElement",
        imageUrlProp: "__originalImageUrl",
        imageBlobProp: "__originalImageBlob",
        retryCountProp: "__originalRetryCount",
      };
    }
    if (q === "mid") {
      return {
        downloadedFlag: "__midImageDownloaded",
        downloadingFlag: "__midDownloading",
        downloadErrorFlag: "__midDownloadError",
        imageElementProp: "__midImageElement",
        imageUrlProp: "__midImageUrl",
        imageBlobProp: "__midImageBlob",
        retryCountProp: "__midRetryCount",
      };
    }
    if (q === "high") {
      return {
        downloadedFlag: "__highImageDownloaded",
        downloadingFlag: "__highDownloading",
        downloadErrorFlag: "__highDownloadError",
        imageElementProp: "__highImageElement",
        imageUrlProp: "__highImageUrl",
        imageBlobProp: "__highImageBlob",
        retryCountProp: "__highRetryCount",
      };
    }
    // low
    return {
      downloadedFlag: "__imageDownloaded",
      downloadingFlag: "__downloading",
      downloadErrorFlag: "__downloadError",
      imageElementProp: "__imageElement",
      imageUrlProp: "__imageUrl",
      imageBlobProp: "__imageBlob",
      retryCountProp: "__retryCount",
    };
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
    const q = normalizeQuality(quality);
    const flags = getFlagsForQuality(q);

    const downloadedFlag = flags.downloadedFlag;
    const downloadingFlag = flags.downloadingFlag;
    const downloadErrorFlag = flags.downloadErrorFlag;

    if (photoObj[downloadedFlag] || photoObj[downloadingFlag]) return;

    photoObj[downloadingFlag] = true;

    if (DEBUG_2D_CACHE) {
      console.log(`🌐 [DOWNLOAD] Iniciando descarga: ${photoObj.id} [${q}]`);
    }

    const imageUrl = urlOverride || getImageUrlForPhoto(photoObj, q);
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

      downloadedImagesCache.set(cacheKey(photoObj.id, q), imageElement);

      photoObj[flags.imageElementProp] = imageElement;
      photoObj[flags.imageUrlProp] = imageUrl;
      if (imageBlob) photoObj[flags.imageBlobProp] = imageBlob;
      photoObj[downloadedFlag] = true;
      photoObj[downloadErrorFlag] = false;
      if (q === "low") {
        photoObj.__fromCache = false;
      }
      photoObj[flags.retryCountProp] = undefined;

      if (DEBUG_2D_CACHE) {
        console.log(
          `\u2705 Descargada: ${photoObj.id} [${q}] de ${imageUrl.substring(imageUrl.lastIndexOf("/") + 1)}`,
        );
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
        photoObj[flags.retryCountProp] = retryCount + 1;

        const delay = Math.min(
          INITIAL_RETRY_DELAY * Math.pow(RETRY_MULTIPLIER, retryCount),
          MAX_RETRY_DELAY,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        photoObj[downloadingFlag] = false;
        return downloadImageOnly(photoObj, retryCount + 1, q, {
          urlOverride,
        });
      }

      error429Stats.value.failed++;
      photoObj[downloadedFlag] = true;
      photoObj[downloadErrorFlag] = true;
      console.warn(
        `❌ Error descargando: ${photoObj.id} [${q}] (intento ${retryCount}/${MAX_RETRIES}): ${e?.message}`,
      );
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
      // ── LIGHTWEIGHT CHECK ──────────────────────────────────────────────
      // Only check which photo IDs exist in IndexedDB (getKey, zero blob reads).
      // Actual blobs are loaded on-demand inside getOrCreateTexture() —
      // one photo at a time — to keep peak memory under control.
      // Previously this used bulkLoadFromCache (decoded ALL 5000 blobs
      // into HTMLImageElements upfront ≈ 1 GB), causing OOM.
      const cachedIds = await bulkCheckCache(photoIds);

      if (cachedIds.size > 0) {
        cachedPhotoIds.value = new Set(cachedIds);

        for (const p of photos) {
          if (p?.id && cachedIds.has(p.id)) {
            // Mark as "present in IDB" so getOrCreateTexture knows
            // to try getCachedImage() before network download.
            p.__cachedInIDB = true;
            p.__fromCache = true;
          }
        }
      }

      console.log(
        `📊 [2D Cache] IndexedDB: ${cachedIds.size}/${photoIds.length} fotos en cache (${photoIds.length - cachedIds.size} se descargarán de red)`,
      );

      cacheStats.value = await getCacheStats();
      return new Map(); // no blobs in memory — loaded on-demand
    } catch (error) {
      console.warn(`⚠️ [2D Cache] Error verificando IndexedDB:`, error);
      return new Map();
    }
  };

  const getOrCreateTexture = async (
    photoObj,
    {
      quality = "thumb",
      urlOverride = null,
      allowDownload = true,
      maxSide = null,
    } = {},
  ) => {
    if (!photoObj?.id) return null;

    const q = normalizeQuality(quality);
    const isOriginal = q === "original";
    const key = cacheKey(photoObj.id, q);

    // 1) If we already have this exact texture cached, return it.
    const cachedTexture = textureCache.get(key);
    if (cachedTexture && !cachedTexture.destroyed) {
      return cachedTexture;
    }

    // 2) Get the source image to build the texture from.
    //    For low/mid/high: ALL use the same thumbnail source image.
    //    For original: uses a separate download (urlOverride).
    let imageElement = null;

    if (isOriginal) {
      // "original" is the only case that downloads a different image.
      const flags = getFlagsForQuality("original");
      if (!photoObj[flags.downloadedFlag] && !downloadedImagesCache.has(key)) {
        if (!allowDownload) return null; // caller doesn't want network requests
        await downloadImageOnly(photoObj, 0, "original", { urlOverride });
      }
      if (photoObj[flags.downloadErrorFlag]) return null;
      imageElement =
        downloadedImagesCache.get(key) || photoObj[flags.imageElementProp];

      // If data was freed, re-download.
      if (!imageElement && photoObj[flags.downloadedFlag]) {
        if (!allowDownload) return null;
        photoObj[flags.downloadedFlag] = false;
        photoObj[flags.downloadErrorFlag] = false;
        await downloadImageOnly(photoObj, 0, "original", { urlOverride });
        if (photoObj[flags.downloadErrorFlag]) return null;
        imageElement =
          downloadedImagesCache.get(key) || photoObj[flags.imageElementProp];
      }
    } else {
      // low/mid/high all use the SAME thumbnail that was already downloaded
      // during initial load (or from IndexedDB cache). No new download needed.
      const thumbKey = cacheKey(photoObj.id, "low");
      const thumbFlags = getFlagsForQuality("low");

      imageElement =
        downloadedImagesCache.get(thumbKey) ||
        photoObj[thumbFlags.imageElementProp];

      // If not in memory (freed after initial load to save RAM), try IndexedDB
      // before falling back to network. IndexedDB already has the blob from
      // the initial session cache — no need to re-download from the server.
      if (!imageElement) {
        if (!allowDownload) return null;
        try {
          const cachedBlob = await getCachedImage(photoObj.id);
          if (cachedBlob) {
            imageElement = await blobToImageElement(cachedBlob);
            // Don't persist in downloadedImagesCache — the caller (LOD)
            // will call freeSourceImage() after creating the texture.
          }
        } catch (_) {
          // IndexedDB read failed; fall through to network
        }
      }

      // Last resort: download from network (first visit, or IDB miss).
      // Reset download flags — the source was freed after initial load to save
      // RAM, so the old "downloaded" flag is stale and blocks re-download.
      if (!imageElement) {
        photoObj[thumbFlags.downloadedFlag] = false;
        photoObj[thumbFlags.downloadErrorFlag] = false;
        await downloadImageOnly(photoObj, 0, "low", {});
        imageElement =
          downloadedImagesCache.get(thumbKey) ||
          photoObj[thumbFlags.imageElementProp];
      }
    }

    if (!imageElement) return null;

    // 3) Downscale to the caller-specified size (controlled by LOD composable).
    const sourceForTexture = maxSide
      ? downscaleSource(imageElement, maxSide)
      : imageElement;

    const texture = PIXI.Texture.from(sourceForTexture);
    textureCache.set(key, texture);

    // NOTE: We do NOT delete the source image from downloadedImagesCache here.
    // The thumbnail source is shared across all LOD levels (low/mid/high).
    // Deleting it would force re-downloads when switching LOD levels.
    // Memory is fine: it's ONE thumbnail per photo, already tiny.

    photoObj.__textureLoaded = true;

    return texture;
  };

  /**
   * Bulk-cache images that were downloaded this session.
   * Only caches photos that were downloaded from network (not from IDB).
   */
  const bulkCacheDownloadedImages = async (photos) => {
    if (isPlayground) return;

    loaderStage.value = "caching";
    loaderTitle.value = "Caching images";
    loaderSubtitle.value = "Saving images for faster future loads...";

    const imagesToCache = [];

    for (const photo of photos || []) {
      if (!photo?.id) continue;
      if (photo.__fromCache || photo.__cachedInIDB) continue;
      if (!photo.__imageDownloaded || photo.__downloadError) continue;

      try {
        // Best path: we already have the blob from the download step.
        // Check this FIRST — imageElement may have been freed by
        // per-batch freeSourceImage() but the blob is still on the photo object.
        if (photo.__imageBlob instanceof Blob) {
          imagesToCache.push({
            id: photo.id,
            blob: photo.__imageBlob,
            url: photo.__imageUrl || getImageUrlForPhoto(photo, "low"),
          });
          continue;
        }

        // Fallback: re-encode from the in-memory HTMLImageElement (if still available).
        const imageElement =
          downloadedImagesCache.get(cacheKey(photo.id, "low")) ||
          photo.__imageElement;

        if (imageElement) {
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
              url: photo.__imageUrl || getImageUrlForPhoto(photo, "low"),
            });
          }
        } else {
          // Both blob and imageElement are gone (freed by per-batch cleanup).
          // Last resort: re-fetch the blob from the network just for caching.
          const url = photo.__imageUrl || getImageUrlForPhoto(photo, "low");
          if (url) {
            try {
              const blob = await urlToBlob(url);
              if (blob) {
                imagesToCache.push({ id: photo.id, blob, url });
              }
            } catch (_) {}
          }
        }
      } catch (_) {
        // ignore per-image cache errors
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

      // ---- Free blob + image element references from photo objects after caching ----
      // Each Blob is typically 15-60 KB; for 5k photos this adds 75-300 MB of JS heap.
      // Each decoded HTMLImageElement can be 120 KB+; another 600 MB with 5k photos.
      for (const photo of photos || []) {
        if (!photo) continue;
        if (photo.__imageBlob) photo.__imageBlob = null;
        if (photo.__midImageBlob) photo.__midImageBlob = null;
        if (photo.__highImageBlob) photo.__highImageBlob = null;
        if (photo.__originalImageBlob) photo.__originalImageBlob = null;
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

  /**
   * Free the source image for a single photo from in-memory cache.
   * Used by LOD after creating a texture from a re-downloaded thumbnail,
   * so it doesn't accumulate HTMLImageElements as the user pans.
   */
  const freeSourceImage = (photoId) => {
    if (!photoId) return;
    // Remove all quality variants of this photo's source image
    for (const q of ["low", "mid", "high", "original"]) {
      downloadedImagesCache.delete(cacheKey(photoId, q));
    }
  };

  /**
   * Free all source image elements from memory.
   * Call after initial texture load + IndexedDB caching to reclaim ~600 MB+
   * with 5000 photos. Textures are already in textureCache and on sprites;
   * the source HTMLImageElements are no longer needed.
   *
   * After this call, LOD upgrades that require source images will gracefully
   * return null (the sprite keeps its current texture). Hi-res still works
   * because it downloads originals on-demand.
   */
  const freeSourceImageCache = (photos) => {
    // Clear the main in-memory image cache (5000 decoded bitmaps ≈ 600 MB)
    downloadedImagesCache.clear();

    // Remove duplicate references hanging off photo objects
    for (const photo of photos || []) {
      if (!photo) continue;
      photo.__imageElement = null;
      photo.__midImageElement = null;
      photo.__highImageElement = null;
      photo.__originalImageElement = null;
    }

    if (DEBUG_2D_CACHE) {
      console.log(
        `🧹 [2D] freeSourceImageCache: cleared ${photos?.length ?? 0} source images`,
      );
    }
  };

  /**
   * Free Canvas elements used as texture sources after GPU upload.
   * Each downscaleSource() call creates a Canvas that Pixi keeps as the
   * BaseTexture/TextureSource backing store. With 5000 photos at 96×72,
   * that's ~135 MB of canvas memory that's redundant once uploaded to GPU.
   *
   * Call this AFTER at least one render frame so Pixi has uploaded all
   * textures to GPU. After this call, GPU context loss recovery might
   * produce blank textures — an acceptable trade-off vs. OOM crash.
   */
  const freeTextureCanvasSources = () => {
    let freed = 0;
    for (const texture of textureCache.values()) {
      try {
        // Pixi v8: texture.source.resource is the canvas/image/etc.
        const src =
          texture.source?.resource?.source ??
          texture.source?.resource ??
          texture.baseTexture?.resource?.source;
        if (src instanceof HTMLCanvasElement) {
          src.width = 0;
          src.height = 0;
          freed++;
        }
      } catch (_) {}
    }
    if (DEBUG_2D_CACHE || freed > 0) {
      console.log(
        `🧹 [2D] freeTextureCanvasSources: freed ${freed} canvas backing stores`,
      );
    }
  };

  const releaseTexture = (photoId, quality = "original") => {
    if (!photoId) return;
    const q = normalizeQuality(quality);
    const key = cacheKey(photoId, q);
    const texture = textureCache.get(key);
    if (texture && !texture.destroyed) {
      try {
        texture.destroy(true);
      } catch (_) {}
    }
    textureCache.delete(key);

    // Only free the source image for "original" quality.
    // For low/mid/high the source is the shared thumbnail — don't delete it
    // or we'd need to re-download it next time.
    if (q === "original") {
      downloadedImagesCache.delete(key);
    }
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
    freeSourceImage,
    freeSourceImageCache,
    freeTextureCanvasSources,
    updateLoadingProgress,
    releaseTexture,
    reset,
  };
}
