/**
 * Proactive Cache Sync
 *
 * Autonomous background service that pre-populates the IndexedDB image cache
 * for ALL photos the user owns, regardless of whether they have been displayed
 * on screen.
 *
 * How it works
 * ────────────
 * 1. Watches the Pinia photos store for new/changed photos.
 * 2. Runs a single bulk IndexedDB check (bulkCheckCache) to filter out photos
 *    already cached — avoids per-photo IDB reads.
 * 3. Feeds uncached photos one by one into scheduleBackgroundCache() with
 *    priority='low', so user-visible photos (priority='high') always win.
 * 4. Feeding is gated behind requestIdleCallback — the browser only advances
 *    the work queue when it has spare time, keeping the UI fully responsive.
 *
 * Relationship with useBackgroundImageCache
 * ─────────────────────────────────────────
 * Both services share the same underlying queue and the `scheduled` Set.
 * This composable only feeds items into that queue; all download/cache
 * logic lives in useBackgroundImageCache. There is zero duplication.
 *
 * Usage (once, in App.vue or equivalent top-level component):
 *
 *   import { useProactiveCacheSync } from '@/composables/useProactiveCacheSync.js';
 *   useProactiveCacheSync();  // auto-cleans up on component unmount
 */

import { watch, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { usePhotosStore } from "@/stores/photos.js";
import { useIndexedDBCache } from "./useIndexedDBCache.js";
import {
  scheduleBackgroundCache,
  scheduled,
} from "./useBackgroundImageCache.js";

// ─── Tunables ────────────────────────────────────────────────────────────────

/**
 * Photos fed to the queue per idle callback.
 * Keeping this small means the idle callback returns quickly and the browser
 * scheduler stays in control of timing.
 */
const FEED_BATCH_SIZE = 10;

/**
 * Delay (ms) before the first sync attempt after photos load.
 * Gives the app time to finish rendering before we start background work.
 */
const INITIAL_DELAY_MS = 5000;

// ─── Module-level state (one service instance regardless of how many Vue
//     components call useProactiveCacheSync) ──────────────────────────────────

let isRunning = false;
let idleCallbackId = null;
let feedQueue = []; // { photoId: string, imageUrl: string }[] — pending items to feed

const { bulkCheckCache } = useIndexedDBCache();

// ─── Core logic ──────────────────────────────────────────────────────────────

/**
 * Given the current photo list, determine which photos are not yet in
 * IndexedDB and not already scheduled, then replace feedQueue with them.
 */
const rebuildFeedQueue = async (photos) => {
  if (!Array.isArray(photos) || photos.length === 0) {
    feedQueue = [];
    return;
  }

  // Gather all IDs that have a usable URL.
  const candidates = photos
    .map((p) => ({
      photoId: p.id,
      dedupeKey: String(p.id),
      imageUrl: p.thumbnailUrl || p.url || null,
    }))
    .filter((c) => c.imageUrl);

  if (candidates.length === 0) {
    feedQueue = [];
    return;
  }

  // Single bulk IDB read — O(n) but one round-trip.
  const photoIds = candidates.map((c) => c.photoId);
  const cachedIds = await bulkCheckCache(photoIds);

  // Only enqueue photos that are neither cached nor already scheduled/pending.
  feedQueue = candidates.filter(
    (c) => !cachedIds.has(c.photoId) && !scheduled.has(c.dedupeKey),
  );
};

/**
 * Feed the next FEED_BATCH_SIZE items from feedQueue into the shared cache
 * queue, then schedule the next idle callback if work remains.
 */
const idleStep = (deadline) => {
  idleCallbackId = null;

  let fed = 0;

  while (
    feedQueue.length > 0 &&
    fed < FEED_BATCH_SIZE &&
    deadline.timeRemaining() > 4 // ms — leave headroom for browser tasks
  ) {
    const { photoId, imageUrl } = feedQueue.shift();
    scheduleBackgroundCache(photoId, imageUrl, "low");
    fed++;
  }

  if (feedQueue.length > 0) {
    scheduleNextIdle();
  }
};

const scheduleNextIdle = () => {
  if (idleCallbackId !== null) return; // already scheduled
  if (typeof requestIdleCallback !== "undefined") {
    // timeout: 60 s — eventually forces execution even if browser is busy
    idleCallbackId = requestIdleCallback(idleStep, { timeout: 60_000 });
  } else {
    // Fallback for environments without requestIdleCallback (old Safari, SSR).
    idleCallbackId = setTimeout(() => {
      idleCallbackId = null;
      const fakeDeadline = {
        timeRemaining: () => 50,
        didTimeout: false,
      };
      idleStep(fakeDeadline);
    }, 200);
  }
};

const cancelIdleHandle = () => {
  if (idleCallbackId === null) return;
  if (typeof requestIdleCallback !== "undefined") {
    window.cancelIdleCallback(idleCallbackId);
  } else {
    clearTimeout(idleCallbackId);
  }
  idleCallbackId = null;
};

// ─── Composable ──────────────────────────────────────────────────────────────

export const useProactiveCacheSync = () => {
  if (isRunning) {
    // Only one instance needed app-wide; subsequent calls are no-ops.
    return;
  }
  isRunning = true;

  const photosStore = usePhotosStore();
  const { photos } = storeToRefs(photosStore);

  let initTimer = null;

  const startSync = async (photoList) => {
    cancelIdleHandle();
    await rebuildFeedQueue(photoList);
    if (feedQueue.length > 0) {
      scheduleNextIdle();
    }
  };

  // Delay the first sync so the initial render isn't competing with cache work.
  const scheduleInitialSync = (photoList) => {
    clearTimeout(initTimer);
    initTimer = setTimeout(() => startSync(photoList), INITIAL_DELAY_MS);
  };

  // Re-sync whenever the photos array changes (new uploads, deletions, etc.).
  const stopWatch = watch(
    photos,
    (newPhotos) => {
      if (Array.isArray(newPhotos) && newPhotos.length > 0) {
        scheduleInitialSync(newPhotos);
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    isRunning = false;
    stopWatch();
    cancelIdleHandle();
    clearTimeout(initTimer);
    feedQueue = [];
  });
};
