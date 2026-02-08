/**
 * use2DLod.js
 *
 * Centralized LOD (Level of Detail) + HiRes system for the 2D PixiJS atlas.
 * Extracted from Photos2D.vue to isolate texture quality management.
 *
 * Responsibilities:
 * - Determine desired LOD quality based on zoom level (low / mid / high)
 * - Upgrade viewport sprites and downgrade off-screen ones in batches
 * - Manage hi-res (original URL) texture swap for the closest photo when zoomed in
 * - Spatial index for efficient hi-res candidate picking
 * - Debounced scheduling so LOD work never competes with user interaction
 */

import { ref, shallowRef, watch } from "vue";

// ─── LOD constants ──────────────────────────────────────────────────────
const LOD_MID_MIN_SCREEN_PX = 100;
const LOD_HIGH_MIN_SCREEN_PX = 160;
const LOD_DEBOUNCE_MS = 400;
const LOD_BATCH_SIZE = 12;

// ─── HiRes constants ────────────────────────────────────────────────────
const HIRES_MIN_SCALE = 4.0;
const HIRES_MIN_SCREEN_SIZE_PX = 360;
const HIRES_IDLE_DELAY_MS = 160;
const HIRES_MIN_UPDATE_INTERVAL_MS = 250;
const HIRES_SPATIAL_CELL_SIZE = 220;
const HIRES_MAX_CELL_RING = 6;

// ─── Texture size configuration (per-LOD-level caps) ────────────────
// Controls the maximum pixel side length for each quality level.
// Pixi uploads the full source dimensions to GPU. Downscaling aggressively
// avoids OOM when rendering thousands of sprites.
const CONFIG_2D_TEXTURE = {
  lowMaxSideLowPerf: 96,
  lowMaxSideDesktop: 512,

  // midMaxSideLowPerf: 96,
  // midMaxSideDesktop: 96,
  // highMaxSideLowPerf: 96,
  // highMaxSideDesktop: 96,
  // originalMaxSideLowPerf: 96,
  // originalMaxSideDesktop: 96,

  midMaxSideLowPerf: 256,
  midMaxSideDesktop: 512,
  highMaxSideLowPerf: 384,
  highMaxSideDesktop: 512,
  originalMaxSideLowPerf: 768,
  originalMaxSideDesktop: 1024,
};

const getDeviceMemoryGb = () => {
  try {
    const dm = Number(globalThis?.navigator?.deviceMemory);
    return Number.isFinite(dm) && dm > 0 ? dm : null;
  } catch (_) {
    return null;
  }
};

// Scale texture caps based on device RAM hint.
const getMaxSideCapsByDeviceMemory = () => {
  const dm = getDeviceMemoryGb();
  if (dm === null) return null;
  if (dm <= 1) {
    return {
      lowMaxSide: 80,
      midMaxSide: 192,
      highMaxSide: 256,
      originalMaxSide: 640,
    };
  }
  if (dm <= 2) {
    return {
      lowMaxSide: 96,
      midMaxSide: 256,
      highMaxSide: 384,
      originalMaxSide: 768,
    };
  }
  if (dm <= 4) {
    return {
      lowMaxSide: 128,
      midMaxSide: 320,
      highMaxSide: 512,
      originalMaxSide: 896,
    };
  }
  return {
    lowMaxSide: null,
    midMaxSide: null,
    highMaxSide: null,
    originalMaxSide: null,
  };
};

/**
 * @param {Object} deps - Reactive dependencies from the host component.
 * @param {import('vue').Ref<HTMLElement|null>} deps.pixiContainer
 * @param {import('vue').Ref<number>}           deps.scale
 * @param {import('vue').Ref<number>}           deps.offsetX
 * @param {import('vue').Ref<number>}           deps.offsetY
 * @param {import('vue').Ref<number>}           deps.photoSize
 * @param {import('vue').ShallowRef<Map>}       deps.photoSprites
 * @param {import('vue').ComputedRef<Map>}      deps.photoById
 * @param {import('vue').Ref<boolean>}          deps.isTransitioning
 * @param {import('vue').Ref<boolean>}          deps.isLoadingTextures
 * @param {Object}                              deps.textureManager
 * @param {Function}                            deps.getPhotoOriginalUrl
 * @param {boolean}                             deps.useLowPerformance
 */
export function use2DLod({
  pixiContainer,
  scale,
  offsetX,
  offsetY,
  photoSize,
  photoSprites,
  photoById,
  isTransitioning,
  isLoadingTextures,
  textureManager,
  getPhotoOriginalUrl,
  useLowPerformance,
}) {
  // ─── LOD state ──────────────────────────────────────────────────────
  const LOD_ENABLED = ref(true);
  let lodTimer = null;
  let lodToken = 0;
  let lodRunning = false;

  // Track current LOD level per photo so we know what to upgrade/downgrade.
  const lodCurrentLevel = new Map(); // photoId -> 'low' | 'mid' | 'high' | 'original'

  // ─── HiRes state ────────────────────────────────────────────────────
  const HIRES_ENABLED = ref(true);
  const activeHiResPhotoId = ref(null);
  let hiResUpdateScheduled = false;
  let hiResRequestToken = 0;
  let hiResIdleTimer = null;
  let lastHiResUpdateAt = 0;

  // Spatial index for hi-res candidate picking (avoids scanning all visible photos)
  const hiResSpatialIndex = shallowRef(new Map());

  // ─── LOD sizing (quality → maxSide mapping) ────────────────────────

  /**
   * Map a quality name to its maximum pixel side length,
   * taking device memory constraints into account.
   */
  const getMaxSideForQuality = (qualityRaw) => {
    const q = String(qualityRaw || "low");
    const normalized = q === "thumb" ? "low" : q;
    const dmCaps = getMaxSideCapsByDeviceMemory();

    const pick = (base, dmCap) => {
      if (dmCaps && Number.isFinite(dmCap) && dmCap > 0) {
        return Math.min(base, dmCap);
      }
      return base;
    };

    if (normalized === "original") {
      const base = useLowPerformance
        ? CONFIG_2D_TEXTURE.originalMaxSideLowPerf
        : CONFIG_2D_TEXTURE.originalMaxSideDesktop;
      return pick(base, dmCaps?.originalMaxSide);
    }
    if (normalized === "high") {
      const base = useLowPerformance
        ? CONFIG_2D_TEXTURE.highMaxSideLowPerf
        : CONFIG_2D_TEXTURE.highMaxSideDesktop;
      return pick(base, dmCaps?.highMaxSide);
    }
    if (normalized === "mid") {
      const base = useLowPerformance
        ? CONFIG_2D_TEXTURE.midMaxSideLowPerf
        : CONFIG_2D_TEXTURE.midMaxSideDesktop;
      return pick(base, dmCaps?.midMaxSide);
    }
    // low
    const base = useLowPerformance
      ? CONFIG_2D_TEXTURE.lowMaxSideLowPerf
      : CONFIG_2D_TEXTURE.lowMaxSideDesktop;
    return pick(base, dmCaps?.lowMaxSide);
  };

  // ─── Shared helpers ─────────────────────────────────────────────────

  /**
   * Adjust sprite dimensions to match texture aspect ratio.
   */
  const applySpriteAspectFromTexture = (sprite, texture) => {
    if (!sprite || !texture) return;
    const w = texture.width || texture.baseTexture?.width;
    const h = texture.height || texture.baseTexture?.height;
    if (!w || !h) return;
    const aspectRatio = h / w;
    sprite.width = photoSize.value;
    sprite.height = photoSize.value * aspectRatio;
  };

  const getViewportWorldBounds = () => {
    const w = pixiContainer.value?.clientWidth || 0;
    const h = pixiContainer.value?.clientHeight || 0;
    const s = Number(scale.value) || 1;
    const minX = (0 - offsetX.value) / s;
    const maxX = (w - offsetX.value) / s;
    const minY = (0 - offsetY.value) / s;
    const maxY = (h - offsetY.value) / s;
    return {
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minY: Math.min(minY, maxY),
      maxY: Math.max(minY, maxY),
    };
  };

  const getApproxScreenSizePx = () => {
    const s = Number(scale.value) || 1;
    return Math.max(0, (Number(photoSize.value) || 0) * s);
  };

  /**
   * Determine the desired LOD quality for the current zoom level.
   * When LOD is disabled, always returns "high" so every sprite is max quality.
   */
  const getDesiredLodQuality = () => {
    if (!LOD_ENABLED.value) return "high";
    const screenSize = getApproxScreenSizePx();
    if (screenSize >= LOD_HIGH_MIN_SCREEN_PX) return "high";
    if (screenSize >= LOD_MID_MIN_SCREEN_PX) return "mid";
    return "low";
  };

  /**
   * Get all visible photo IDs that are inside (or near) the viewport.
   * Uses generous padding to preload textures before they enter the visible area,
   * preventing the "quality pop" effect during panning.
   */
  const getViewportPhotoIds = () => {
    if (!pixiContainer.value || !photoSprites.value?.size) return [];

    const bounds = getViewportWorldBounds();

    const w = pixiContainer.value?.clientWidth || 0;
    const h = pixiContainer.value?.clientHeight || 0;
    const s = Number(scale.value) || 1;
    const viewportWorldWidth = w / s;
    const viewportWorldHeight = h / s;

    // Scale padding by zoom level: more padding when zoomed out (covers more photos),
    // less padding when zoomed in (fewer photos, but each is more expensive to load)
    const paddingFactor = Math.max(0.3, Math.min(1.0, 2.0 / s));
    const marginX = viewportWorldWidth * paddingFactor;
    const marginY = viewportWorldHeight * paddingFactor;

    const minX = bounds.minX - marginX;
    const maxX = bounds.maxX + marginX;
    const minY = bounds.minY - marginY;
    const maxY = bounds.maxY + marginY;

    const ids = [];
    photoSprites.value.forEach((sprite, photoId) => {
      if (!sprite || !sprite.visible) return;
      const x = sprite.x;
      const y = sprite.y;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        ids.push(photoId);
      }
    });
    return ids;
  };

  /** Yield to the event loop so the browser can process input events. */
  const yieldToEventLoop = () => new Promise((r) => setTimeout(r, 0));

  // ─── LOD core ───────────────────────────────────────────────────────

  /**
   * Apply a LOD texture to a single sprite. Returns true on success.
   */
  const applyLodToSprite = async (photoId, quality) => {
    if (!photoId) return false;
    // Don't touch the active hi-res (original URL) sprite
    if (activeHiResPhotoId.value === photoId) return false;

    const sprite = photoSprites.value.get(photoId);
    if (!sprite) return false;

    const photo = photoById.value.get(photoId);
    if (!photo) return false;

    const currentLevel = lodCurrentLevel.get(photoId) || "low";
    if (currentLevel === quality) return false; // already at desired level

    const texture = await textureManager.getOrCreateTexture(photo, {
      quality,
      // After initial load, source images are freed from RAM to avoid OOM.
      // Allow re-downloading the thumbnail for the small set of viewport photos
      // that need LOD upgrades (typically 20–100 at mid/high zoom levels).
      allowDownload: true,
      maxSide: getMaxSideForQuality(quality),
    });
    if (!texture) return false;

    sprite.texture = texture;
    sprite.__lodLevel = quality;
    applySpriteAspectFromTexture(sprite, texture);
    lodCurrentLevel.set(photoId, quality);

    // After the texture is created and assigned, free the re-downloaded source
    // image from RAM so it doesn't accumulate as the user pans around.
    // The texture is already in textureCache; the source is no longer needed.
    textureManager.freeSourceImage(photoId);

    // Release textures for levels above what we're setting
    if (quality === "low") {
      textureManager.releaseTexture(photoId, "mid");
      textureManager.releaseTexture(photoId, "high");
    } else if (quality === "mid") {
      textureManager.releaseTexture(photoId, "high");
    }

    return true;
  };

  /**
   * Core LOD update: upgrade viewport sprites, downgrade off-screen ones.
   * Processes in small batches to avoid blocking zoom/pan.
   * May re-download thumbnails for viewport photos whose source images
   * were freed after initial load (to prevent OOM with 5000+ photos).
   */
  const runLodUpdate = async () => {
    const token = ++lodToken;
    if (isTransitioning.value) return;
    if (isLoadingTextures.value) return; // don't compete with initial load
    if (lodRunning) return; // prevent overlapping runs

    lodRunning = true;
    try {
      const desiredQuality = getDesiredLodQuality();
      const viewportIds = new Set(getViewportPhotoIds());

      // 1) Upgrade viewport sprites to the desired quality (in small batches)
      const toUpgrade = [];
      for (const photoId of viewportIds) {
        if (activeHiResPhotoId.value === photoId) continue;
        const current = lodCurrentLevel.get(photoId) || "low";
        if (current !== desiredQuality) {
          toUpgrade.push(photoId);
        }
      }

      for (let i = 0; i < toUpgrade.length; i += LOD_BATCH_SIZE) {
        if (token !== lodToken) return; // cancelled by new interaction
        const batch = toUpgrade.slice(i, i + LOD_BATCH_SIZE);
        await Promise.all(
          batch.map((id) => applyLodToSprite(id, desiredQuality)),
        );
        if (i + LOD_BATCH_SIZE < toUpgrade.length) {
          await yieldToEventLoop(); // let browser process input
        }
      }

      if (token !== lodToken) return;

      // 2) Downgrade off-screen sprites back to "low" to free GPU memory
      const toDowngrade = [];
      for (const [photoId, level] of lodCurrentLevel) {
        if (level === "low") continue;
        if (viewportIds.has(photoId)) continue;
        if (activeHiResPhotoId.value === photoId) continue;
        toDowngrade.push(photoId);
      }

      for (let i = 0; i < toDowngrade.length; i += LOD_BATCH_SIZE) {
        if (token !== lodToken) return;
        const batch = toDowngrade.slice(i, i + LOD_BATCH_SIZE);
        await Promise.all(batch.map((id) => applyLodToSprite(id, "low")));
        if (i + LOD_BATCH_SIZE < toDowngrade.length) {
          await yieldToEventLoop();
        }
      }
    } finally {
      lodRunning = false;
    }
  };

  /**
   * Cancel any pending or in-progress LOD update.
   * Call this when a new interaction starts to abort stale work immediately.
   */
  const cancelLodUpdate = () => {
    lodToken++; // invalidates any running async LOD work
    if (lodTimer) {
      clearTimeout(lodTimer);
      lodTimer = null;
    }
  };

  /**
   * Schedule a LOD update after interaction settles.
   * Multiple calls within the debounce window only trigger one update.
   */
  const scheduleLodUpdate = () => {
    if (lodTimer) {
      clearTimeout(lodTimer);
      lodTimer = null;
    }
    lodTimer = setTimeout(() => {
      lodTimer = null;
      runLodUpdate().catch(() => {});
    }, LOD_DEBOUNCE_MS);
  };

  // ─── HiRes core ────────────────────────────────────────────────────

  const buildHiResSpatialIndex = () => {
    const index = new Map();
    const cellSize = HIRES_SPATIAL_CELL_SIZE;

    photoSprites.value.forEach((sprite, photoId) => {
      if (!sprite) return;
      const cx = Math.floor(sprite.x / cellSize);
      const cy = Math.floor(sprite.y / cellSize);
      const key = `${cx},${cy}`;
      let list = index.get(key);
      if (!list) {
        list = [];
        index.set(key, list);
      }
      list.push(photoId);
    });

    hiResSpatialIndex.value = index;
  };

  const getPhotoScreenSizePx = (sprite) => {
    if (!sprite) return 0;
    return Math.max(sprite.width, sprite.height) * (scale.value || 1);
  };

  const pickHiResCandidatePhotoId = () => {
    if (!pixiContainer.value) return null;
    if (scale.value < HIRES_MIN_SCALE) return null;
    if (!photoSprites.value?.size) return null;
    if (isTransitioning.value) return null;

    const centerX = pixiContainer.value.clientWidth / 2;
    const centerY = pixiContainer.value.clientHeight / 2;

    // Convert viewport center to world coordinates (sprite.x/y space)
    const centerWorldX = (centerX - offsetX.value) / (scale.value || 1);
    const centerWorldY = (centerY - offsetY.value) / (scale.value || 1);

    const index = hiResSpatialIndex.value;
    if (!index || index.size === 0) {
      // Best-effort fallback; index should normally exist after load.
      buildHiResSpatialIndex();
    }

    const cellSize = HIRES_SPATIAL_CELL_SIZE;
    const baseCx = Math.floor(centerWorldX / cellSize);
    const baseCy = Math.floor(centerWorldY / cellSize);

    let bestId = null;
    let bestDist2 = Infinity;

    // Search nearby cells around the viewport center.
    for (let r = 0; r <= HIRES_MAX_CELL_RING; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

          const key = `${baseCx + dx},${baseCy + dy}`;
          const ids = hiResSpatialIndex.value.get(key);
          if (!ids?.length) continue;

          for (const photoId of ids) {
            const sprite = photoSprites.value.get(photoId);
            if (!sprite || !sprite.visible) continue;
            if (!getPhotoOriginalUrl(photoId)) continue;

            const ddx = sprite.x - centerWorldX;
            const ddy = sprite.y - centerWorldY;
            const d2 = ddx * ddx + ddy * ddy;

            if (d2 < bestDist2) {
              bestDist2 = d2;
              bestId = photoId;
            }
          }
        }
      }
    }

    if (!bestId) return null;

    const bestSprite = photoSprites.value.get(bestId);
    const screenSize = getPhotoScreenSizePx(bestSprite);
    if (screenSize < HIRES_MIN_SCREEN_SIZE_PX) return null;

    return bestId;
  };

  const downgradeActiveHiRes = async () => {
    const currentId = activeHiResPhotoId.value;
    if (!currentId) return;

    console.log(`⬇️ HiRes degradar: ${currentId} → LOW`);

    const photo = photoById.value.get(currentId);
    const sprite = photoSprites.value.get(currentId);

    try {
      if (photo && sprite) {
        const thumbTexture = await textureManager.getOrCreateTexture(photo, {
          quality: "thumb",
          maxSide: getMaxSideForQuality("low"),
        });
        if (thumbTexture) {
          sprite.texture = thumbTexture;
          applySpriteAspectFromTexture(sprite, thumbTexture);
          sprite.__lodLevel = "low";
          lodCurrentLevel.set(currentId, "low");
        }
      }
    } finally {
      // Free hi-res GPU memory
      textureManager.releaseTexture(currentId, "original");
      activeHiResPhotoId.value = null;
    }
  };

  const updateHiResTarget = async () => {
    if (!HIRES_ENABLED.value) {
      if (activeHiResPhotoId.value) {
        console.log(
          `📵 HiRes deshabilitado, degradando ${activeHiResPhotoId.value}`,
        );
      }
      await downgradeActiveHiRes();
      return;
    }

    const targetId = pickHiResCandidatePhotoId();
    if (!targetId) {
      if (activeHiResPhotoId.value) {
        console.log(
          `📥 HiRes sin candidatos cerca, degradando ${activeHiResPhotoId.value}`,
        );
      }
      await downgradeActiveHiRes();
      return;
    }

    if (activeHiResPhotoId.value === targetId) {
      console.log(`🔄 HiRes ya está en ${targetId}`);
      return;
    }

    // Switch target: downgrade old first
    await downgradeActiveHiRes();

    const token = ++hiResRequestToken;
    const photo = photoById.value.get(targetId);
    const sprite = photoSprites.value.get(targetId);
    if (!photo || !sprite) return;

    const originalUrl = getPhotoOriginalUrl(targetId);
    if (!originalUrl) return;

    const originalTexture = await textureManager.getOrCreateTexture(photo, {
      quality: "original",
      urlOverride: originalUrl,
      maxSide: getMaxSideForQuality("original"),
    });

    // If another request superseded this one, abort.
    if (token !== hiResRequestToken) return;

    if (originalTexture) {
      sprite.texture = originalTexture;
      applySpriteAspectFromTexture(sprite, originalTexture);
      activeHiResPhotoId.value = targetId;
      console.log(`🖼️ HiRes cargado: foto ${targetId} (original URL)`);

      // Ensure we don't keep additional mid/high LOD textures for the same photo.
      lodCurrentLevel.set(targetId, "original");
      try {
        textureManager.releaseTexture(targetId, "high");
        textureManager.releaseTexture(targetId, "mid");
      } catch (_) {}
      sprite.__lodLevel = "original";
    }
  };

  const scheduleHiResUpdate = () => {
    // Fast path: if we're not zoomed in enough, ensure we drop back to thumb.
    if (scale.value < HIRES_MIN_SCALE) {
      // Don't await inside pointer handlers.
      downgradeActiveHiRes().catch(() => {});
      return;
    }

    if (hiResIdleTimer) {
      clearTimeout(hiResIdleTimer);
      hiResIdleTimer = null;
    }

    hiResIdleTimer = setTimeout(() => {
      // Throttle: avoid doing heavy work too frequently.
      const now = performance.now();
      if (now - lastHiResUpdateAt < HIRES_MIN_UPDATE_INTERVAL_MS) return;
      lastHiResUpdateAt = now;

      if (hiResUpdateScheduled) return;
      hiResUpdateScheduled = true;
      requestAnimationFrame(async () => {
        hiResUpdateScheduled = false;
        try {
          await updateHiResTarget();
        } catch (_) {
          // Non-fatal: keep viewer responsive
        }
      });
    }, HIRES_IDLE_DELAY_MS);
  };

  // ─── Reset (for loadPhotosToPixi before fresh load) ─────────────────

  /**
   * Reset all LOD + HiRes state. Call before loading new photos.
   * Releases the active hi-res texture, clears timers and level tracking.
   */
  const resetState = () => {
    cancelLodUpdate();

    if (hiResIdleTimer) {
      clearTimeout(hiResIdleTimer);
      hiResIdleTimer = null;
    }

    lodCurrentLevel.clear();

    try {
      textureManager.releaseTexture(activeHiResPhotoId.value, "original");
    } catch (_) {}
    activeHiResPhotoId.value = null;

    hiResSpatialIndex.value = new Map();
  };

  // ─── Internal watcher ───────────────────────────────────────────────

  // When LOD_ENABLED changes, immediately re-evaluate all sprites.
  watch(LOD_ENABLED, () => {
    scheduleLodUpdate();
  });

  // ─── Cleanup (call from onUnmounted) ────────────────────────────────

  const cleanup = () => {
    resetState();
  };

  // ─── Public API ─────────────────────────────────────────────────────

  return {
    // Toggles (reactive, for potential config panel binding)
    LOD_ENABLED,
    HIRES_ENABLED,

    // State (exposed for direct access from loadPhotosToPixi, cleanup, etc.)
    activeHiResPhotoId,
    lodCurrentLevel,

    // Scheduling (called from interaction handlers)
    scheduleLodUpdate,
    cancelLodUpdate,
    scheduleHiResUpdate,

    // Spatial index management
    buildHiResSpatialIndex,

    // LOD sizing
    getMaxSideForQuality,

    // State management
    resetState,
    cleanup,
  };
}
