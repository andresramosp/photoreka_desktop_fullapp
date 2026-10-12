// src/composables/2d-viewer/use2DLayoutCache.js

/**
 * Composable for managing the frontend cache of the 2D photo layout (coordinates & basic metadata).
 * This cache is used to provide instant load of the simplified photo universe on the Dashboard.
 *
 * Cache storage uses LocalStorage for instant synchronous loading on page load.
 */

const STORAGE_KEY_PREFIX = "photoreka:atlas2d:cache:";

const normalizeUserScope = (userId) => {
  const scope = String(userId || "").trim();
  return scope || "anonymous";
};

const buildCacheKey = (chunkName, userId) => {
  return `${STORAGE_KEY_PREFIX}${normalizeUserScope(userId)}:${chunkName}`;
};

export function use2DLayoutCache() {
  /**
   * Save a computed layout to the frontend cache
   * @param {Array} photos - Array of photo objects with coordinates
   * @param {string} chunkName - Name of the chunk/clustering type (defaults to 'general')
   */
  const saveLayoutToCache = (photos, chunkName = "general", userId = null) => {
    if (!photos || !Array.isArray(photos)) return;

    try {
      // Extract only the fields necessary to render the simplified preview
      const optimizedPhotos = photos.map((p) => {
        const thumbUrl = p.thumbnailUrl || p.url || p.thumb;
        // Don't save large data URIs (base64) or blob URLs to avoid QuotaExceededError
        const isHugeUrl = typeof thumbUrl === 'string' && (thumbUrl.startsWith('data:') || thumbUrl.length > 500);
        return {
          id: p.id,
          pos: Array.isArray(p.position)
            ? [p.position[0] || 0, p.position[1] || 0]
            : [0, 0],
          thumb: isHugeUrl ? null : thumbUrl,
          date: p.dateTaken || p.date,
          exifDate: p.descriptions?.EXIF?.dateTaken || p.exifDate,
          tags: p.tags || p.descriptions?.tags || p.metadata?.tags || [],
        };
      });

      const cacheData = {
        timestamp: Date.now(),
        chunk: chunkName,
        userScope: normalizeUserScope(userId),
        photos: optimizedPhotos,
      };

      const key = buildCacheKey(chunkName, userId);
      localStorage.setItem(key, JSON.stringify(cacheData));
      console.log(
        `💾 [2DLayoutCache] Saved ${optimizedPhotos.length} photos layout to cache under '${chunkName}' for '${normalizeUserScope(userId)}'`,
      );
    } catch (e) {
      console.error(
        "❌ [2DLayoutCache] Error saving cache to LocalStorage:",
        e,
      );
    }
  };

  /**
   * Get the layout from the frontend cache
   * @param {string} chunkName - Name of the chunk/clustering type (defaults to 'general')
   * @returns {Object|null} - Cached layout { timestamp, chunk, photos } or null
   */
  const getLayoutFromCache = (chunkName = "general", userId = null) => {
    try {
      const key = buildCacheKey(chunkName, userId);
      const dataStr = localStorage.getItem(key);
      if (!dataStr) return null;

      const cacheData = JSON.parse(dataStr);
      if (!cacheData || !Array.isArray(cacheData.photos)) {
        return null;
      }

      return cacheData;
    } catch (e) {
      console.error(
        "❌ [2DLayoutCache] Error reading cache from LocalStorage:",
        e,
      );
      return null;
    }
  };

  /**
   * Compare cached photos with store photos to determine if they are in sync.
   * If they have the exact same set of photo IDs, we are in sync!
   * @param {Array} cachedPhotos - Photos from the cache
   * @param {Array} storePhotos - Photos from the Pinia store (e.g. processedPhotos)
   * @returns {boolean} - true if in sync, false if out of sync
   */
  const checkSyncStatus = (cachedPhotos, storePhotos) => {
    if (!cachedPhotos || !storePhotos) return false;
    if (cachedPhotos.length !== storePhotos.length) return false;

    // Fast check: compare sets of IDs
    const cachedIds = new Set(cachedPhotos.map((p) => String(p.id)));
    const storeIds = new Set(storePhotos.map((p) => String(p.id)));

    if (cachedIds.size !== storeIds.size) return false;

    for (const id of storeIds) {
      if (!cachedIds.has(id)) return false;
    }

    return true;
  };

  /**
   * Clear the cached layout for a specific chunk or all chunks
   * @param {string|null} chunkName - Name of the chunk, or null to clear all 2D layout caches
   */
  const clearLayoutCache = (chunkName = null, userId = null) => {
    try {
      if (chunkName) {
        localStorage.removeItem(buildCacheKey(chunkName, userId));
      } else {
        // Clear all keys starting with STORAGE_KEY_PREFIX
        const keysToRemove = [];
        const scopedPrefix = `${STORAGE_KEY_PREFIX}${normalizeUserScope(userId)}:`;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const matchesPrefix = userId
            ? key && key.startsWith(scopedPrefix)
            : key && key.startsWith(STORAGE_KEY_PREFIX);
          if (matchesPrefix) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      }
      console.log(`🧹 [2DLayoutCache] Cleared 2D layout cache`);
    } catch (e) {
      console.error("❌ [2DLayoutCache] Error clearing cache:", e);
    }
  };

  return {
    saveLayoutToCache,
    getLayoutFromCache,
    checkSyncStatus,
    clearLayoutCache,
  };
}
