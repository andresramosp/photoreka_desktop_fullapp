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
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  return await response.blob();
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
        request.error
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
 * Bulk check which photos are cached
 * @param {Array<string>} photoIds - Array of photo IDs
 * @returns {Promise<Set<string>>} - Set of cached photo IDs
 */
const bulkCheckCache = async (photoIds) => {
  const db = await initDB();
  const cachedIds = new Set();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const objectStore = transaction.objectStore(STORE_NAME);

    let completed = 0;
    const total = photoIds.length;

    if (total === 0) {
      resolve(cachedIds);
      return;
    }

    photoIds.forEach((id) => {
      const request = objectStore.getKey(id);

      request.onsuccess = () => {
        if (request.result !== undefined) {
          cachedIds.add(id);
        }
        completed++;
        if (completed === total) {
          resolve(cachedIds);
        }
      };

      request.onerror = () => {
        console.error(`❌ Error checking cache for ${id}:`, request.error);
        completed++;
        if (completed === total) {
          resolve(cachedIds);
        }
      };
    });
  });
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
        transaction.error
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
const bulkLoadFromCache = async (photoIds) => {
  const db = await initDB();
  const imageMap = new Map();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const objectStore = transaction.objectStore(STORE_NAME);

    let completed = 0;
    const total = photoIds.length;

    if (total === 0) {
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
        if (completed === total) {
          resolve(imageMap);
        }
      };

      request.onerror = () => {
        console.error(`❌ Error loading cached image ${id}:`, request.error);
        completed++;
        if (completed === total) {
          resolve(imageMap);
        }
      };
    });

    transaction.onerror = () => {
      console.error(
        "❌ Transaction error during bulk load:",
        transaction.error
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
    bulkCacheImages,
    bulkLoadFromCache,
    clearCache,
    getCacheStats,
    urlToBlob,
  };
};
