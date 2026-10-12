/**
 * Background Image Cache
 *
 * Opportunistically caches photo blobs into IndexedDB when images finish
 * loading in any grid/card component (PhotoCard, PhotoCardHub, etc.).
 *
 * Components continue loading images from R2 as normal — this only WRITES
 * to the cache in the background. Reading from the cache stays exclusive to
 * the 2D/3D viewers (Photos2D / Photos3D).
 *
 * Because R2 responses are served with proper Cache-Control headers, the
 * re-fetch done here hits the browser HTTP cache and is essentially free
 * (no extra network round-trip).
 *
 * Priority levels
 * ───────────────
 *  'high'  (default) — user-visible photo just finished loading via onImageLoad.
 *                       Inserted at the FRONT of the queue.
 *  'low'             — proactive background sync feeding photos the user has not
 *                       seen yet. Inserted at the BACK of the queue so high-priority
 *                       items always win.
 */

import { useIndexedDBCache } from "./useIndexedDBCache.js";

// ─── Module-level singletons (shared across all component instances) ──────────

const MAX_CONCURRENT = 3;

/** IDs already queued or being processed in this session (prevents re-queuing). */
export const scheduled = new Set(); // exported so useProactiveCacheSync can read it

/** IDs actively being fetched right now. */
const pending = new Set();

const queue = []; // { photoId: string, imageUrl: string }[]
let activeCount = 0;

const { isCached, cacheImage, urlToBlob } = useIndexedDBCache();

// ─── Internal queue processor ─────────────────────────────────────────────────

const processNext = async () => {
  if (activeCount >= MAX_CONCURRENT || queue.length === 0) return;

  const { photoId, imageUrl, dedupeKey } = queue.shift();
  activeCount++;

  try {
    // Guard: skip if already stored from a previous session or page load.
    const already = await isCached(photoId);
    if (!already) {
      const blob = await urlToBlob(imageUrl);
      await cacheImage(photoId, blob, imageUrl);
    }
  } catch {
    // Best-effort: silently discard errors to never affect UI.
  } finally {
    pending.delete(dedupeKey);
    activeCount--;
    processNext(); // Immediately pick up next item.
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Schedule a photo blob to be stored in IndexedDB in the background.
 *
 * Safe to call multiple times for the same photo — deduplication is handled
 * at the queue level (fast, synchronous) and again at the IndexedDB level
 * (async, authoritative).
 *
 * @param {string|number} photoId   The photo's unique ID (same key used by 2D/3D viewers).
 * @param {string}        imageUrl  The image URL to fetch and cache (thumbnailUrl preferred).
 * @param {'high'|'low'}  priority  'high' = front of queue (user-visible), 'low' = back (proactive).
 */
export const scheduleBackgroundCache = (
  photoId,
  imageUrl,
  priority = "high",
) => {
  if (!photoId || !imageUrl) return;

  // Deduplicate by normalized key, but keep original photoId type for IndexedDB.
  // This avoids string-vs-number key mismatches with pre-existing cache entries.
  const dedupeKey = String(photoId);
  if (scheduled.has(dedupeKey) || pending.has(dedupeKey)) return;

  scheduled.add(dedupeKey);
  pending.add(dedupeKey);

  const item = { photoId, imageUrl, dedupeKey };
  if (priority === "high") {
    queue.unshift(item); // jump ahead of any proactive low-priority items
  } else {
    queue.push(item);
  }

  processNext();
};

/**
 * Composable wrapper — use this inside Vue components.
 */
export const useBackgroundImageCache = () => ({
  scheduleBackgroundCache,
});
