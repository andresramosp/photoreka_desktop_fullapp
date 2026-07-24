/**
 * IndexedDB Cache for Photo Images
 * Stores downloaded images as Blobs for faster subsequent loads
 */

const DB_NAME = "PhotorekaCache";
const DB_VERSION = 2;
const STORE_NAME = "photoImages";

// Global DB instance
let dbInstance = null;

/**
 * Initialize IndexedDB
 */
const initDB = async () => {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("❌ Error opening IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log("✅ IndexedDB initialized successfully");
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Elimina todos los object stores existentes (borrado total)
      for (let i = 0; i < db.objectStoreNames.length; i++) {
        db.deleteObjectStore(db.objectStoreNames[i]);
      }
      // Crea el nuevo object store desde cero
      const objectStore = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      objectStore.createIndex("timestamp", "timestamp", { unique: false });
      console.log("📦 Recreated IndexedDB object store:", STORE_NAME);
    };
  });
};

/**
 * Convert image URL to Blob
 */
const urlToBlob = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const error = new Error(
        `Failed to fetch image: ${response.status} ${response.statusText}`,
      );
      error.status = response.status;
      error.isHttpError = true;
      error.isRetriable = response.status === 429 || response.status >= 500;
      throw error;
    }
    return await response.blob();
  } catch (error) {
    // Keep HTTP metadata untouched; enrich network/CORS style failures.
    if (error?.isHttpError) throw error;

    const networkError = new Error(
      `Network error fetching image: ${error?.message || "Unknown error"}`,
    );
    networkError.cause = error;
    networkError.isNetworkError = true;
    networkError.isRetriable = true;
    throw networkError;
  }
};

/**
 * Store image in IndexedDB
 * @param {string} photoId - Unique photo identifier
 * @param {Blob} imageBlob - Image as Blob
 * @param {string} imageUrl - Original image URL (for metadata)
 */
const cacheImage = async (photoId, imageBlob, imageUrl) => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const objectStore = transaction.objectStore(STORE_NAME);

    const data = {
      id: photoId,
      blob: imageBlob,
      url: imageUrl,
      timestamp: Date.now(),
    };

    const request = objectStore.put(data);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      console.error(`❌ Error caching image ${photoId}:`, request.error);
      reject(request.error);
    };
  });
};

/**
 * Retrieve image from IndexedDB
 * @param {string} photoId - Unique photo identifier
 * @returns {Promise<Blob|null>} - Image Blob or null if not found
 */
const getCachedImage = async (photoId) => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.get(photoId);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.blob);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      console.error(
        `❌ Error retrieving cached image ${photoId}:`,
        request.error,
      );
      reject(request.error);
    };
  });
};

/**
 * Check if image exists in cache
 * @param {string} photoId - Unique photo identifier
 * @returns {Promise<boolean>}
 */
const isCached = async (photoId) => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getKey(photoId);

    request.onsuccess = () => {
      resolve(request.result !== undefined);
    };

    request.onerror = () => {
      console.error(`❌ Error checking cache for ${photoId}:`, request.error);
      reject(request.error);
    };
  });
};

/**
 * Read every key currently in the store with a single request.
 * Far cheaper than issuing one getKey() per photo id: with 30k photos that is
 * 30k separate IDB round-trips (seconds of pure overhead) vs. one bulk read.
 * @returns {Promise<Set<string>>}
 */
const getAllCachedKeys = async () => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAllKeys();

    request.onsuccess = () => resolve(new Set(request.result || []));
    request.onerror = () => {
      console.error("❌ Error reading cache keys:", request.error);
      reject(request.error);
    };
  });
};

/**
 * Bulk check which photos are cached
 * @param {Array<string>} photoIds - Array of photo IDs
 * @returns {Promise<Set<string>>} - Set of cached photo IDs
 */
const bulkCheckCache = async (photoIds) => {
  const cachedIds = new Set();
  if (!photoIds?.length) return cachedIds;

  const allKeys = await getAllCachedKeys();
  for (const id of photoIds) {
    if (allKeys.has(id)) cachedIds.add(id);
  }
  return cachedIds;
};

/**
 * Bulk cache images
 * @param {Array<{id: string, blob: Blob, url: string}>} images
 * @returns {Promise<{success: number, failed: number}>}
 */
const bulkCacheImages = async (images) => {
  const db = await initDB();
  let success = 0;
  let failed = 0;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const objectStore = transaction.objectStore(STORE_NAME);

    let completed = 0;
    const total = images.length;

    if (total === 0) {
      resolve({ success, failed });
      return;
    }

    images.forEach(({ id, blob, url }) => {
      const data = {
        id,
        blob,
        url,
        timestamp: Date.now(),
      };

      const request = objectStore.put(data);

      request.onsuccess = () => {
        success++;
        completed++;
        if (completed === total) {
          resolve({ success, failed });
        }
      };

      request.onerror = () => {
        console.error(`❌ Error caching image ${id}:`, request.error);
        failed++;
        completed++;
        if (completed === total) {
          resolve({ success, failed });
        }
      };
    });

    transaction.onerror = () => {
      console.error(
        "❌ Transaction error during bulk cache:",
        transaction.error,
      );
      reject(transaction.error);
    };
  });
};

/**
 * Bulk load images from cache
 * @param {Array<string>} photoIds
 * @returns {Promise<Map<string, Blob>>} - Map of photoId -> Blob
 */
const BULK_GET_ALL_THRESHOLD = 500;

/**
 * Read every record in one getAll() and keep only the requested ids.
 * One IDB round-trip instead of N.
 */
const getAllRecordsFiltered = async (wantedIds) => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAll();

    request.onsuccess = () => {
      const imageMap = new Map();
      for (const record of request.result || []) {
        if (!record?.id || !wantedIds.has(record.id)) continue;
        imageMap.set(record.id, record.blob);
      }
      resolve(imageMap);
    };
    request.onerror = () => {
      console.error("❌ Error bulk-reading cache:", request.error);
      reject(request.error);
    };
  });
};

const bulkLoadFromCache = async (photoIds) => {
  const imageMap = new Map();
  const total = photoIds?.length || 0;
  if (total === 0) return imageMap;

  // For large catalogs, a single getAll() beats N individual get() requests by
  // an order of magnitude — the per-request round-trip is what dominates.
  // Only worth it when we actually want most of what is stored, so check the
  // key set (one cheap request) before pulling every record's blob handle.
  if (total >= BULK_GET_ALL_THRESHOLD) {
    try {
      const wanted = new Set(photoIds);
      const allKeys = await getAllCachedKeys();
      let hits = 0;
      for (const key of allKeys) {
        if (wanted.has(key)) hits++;
      }
      if (hits === 0) return imageMap;
      // Most of the store is relevant → one bulk read.
      if (hits >= allKeys.size * 0.5) {
        return await getAllRecordsFiltered(wanted);
      }
      // Otherwise only fetch the ids we know exist, individually.
      photoIds = photoIds.filter((id) => allKeys.has(id));
      if (photoIds.length === 0) return imageMap;
    } catch (_) {
      // Fall through to the per-id path below.
    }
  }

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const objectStore = transaction.objectStore(STORE_NAME);

    let completed = 0;
    const pending = photoIds.length;

    if (pending === 0) {
      resolve(imageMap);
      return;
    }

    photoIds.forEach((id) => {
      const request = objectStore.get(id);

      request.onsuccess = () => {
        if (request.result) {
          imageMap.set(id, request.result.blob);
        }
        completed++;
        if (completed === pending) {
          resolve(imageMap);
        }
      };

      request.onerror = () => {
        console.error(`❌ Error loading cached image ${id}:`, request.error);
        completed++;
        if (completed === pending) {
          resolve(imageMap);
        }
      };
    });

    transaction.onerror = () => {
      console.error(
        "❌ Transaction error during bulk load:",
        transaction.error,
      );
      reject(transaction.error);
    };
  });
};

/**
 * Clear all cached images
 */
const clearCache = async () => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.clear();

    request.onsuccess = () => {
      console.log("🧹 Cache cleared successfully");
      resolve(true);
    };

    request.onerror = () => {
      console.error("❌ Error clearing cache:", request.error);
      reject(request.error);
    };
  });
};

/**
 * Get cache statistics
 */
const getCacheStats = async () => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const objectStore = transaction.objectStore(STORE_NAME);
    const countRequest = objectStore.count();

    countRequest.onsuccess = () => {
      resolve({
        totalImages: countRequest.result,
      });
    };

    countRequest.onerror = () => {
      console.error("❌ Error getting cache stats:", countRequest.error);
      reject(countRequest.error);
    };
  });
};

/**
 * Composable hook
 */
export const useIndexedDBCache = () => {
  return {
    initDB,
    cacheImage,
    getCachedImage,
    isCached,
    bulkCheckCache,
    getAllCachedKeys,
    bulkCacheImages,
    bulkLoadFromCache,
    clearCache,
    getCacheStats,
    urlToBlob,
  };
};
