/**
 * usePhotoAtlas.js
 *
 * Texture-atlas cache for the 2D (PixiJS) photo viewer.
 *
 * Problem: with 30k photos, even a fully-IndexedDB-cached reload still costs
 * ~3 minutes, because the bottleneck isn't network — it's 30,000 individual
 * image decodes + 30,000 individual GPU texture uploads (one Texture.from()
 * per photo, see use2DTextureManager.js).
 *
 * Fix: pack the "low" LOD tier (the only tier persisted to IndexedDB today)
 * into ~4096x4096 atlas sheets. Loading becomes ~30 decodes + ~30 GPU
 * uploads, and every photo's low-tier texture becomes a cheap `frame`
 * sub-texture of a shared sheet.
 *
 * Scope (deliberate, see plan): additive/incremental only — existing sheets
 * are never rewritten, so there's no real cache invalidation (edits/deletes
 * to already-atlased photos won't be reflected). Building (the write path)
 * only runs on desktop/high-performance sessions, since it needs decoded
 * bitmaps to stay resident in memory long enough to composite a sheet —
 * exactly what the low-perf/mobile path deliberately avoids to prevent OOM.
 * Mobile still benefits as a *reader* of an atlas built by a desktop session
 * for the same browser profile.
 */

import * as PIXI from "pixi.js";
import { useIndexedDBCache } from "@/composables/useIndexedDBCache.js";

const SHEET_SIZE = 4096;
const PADDING = 2;
const ENCODE_QUALITY = 0.85;
// Below this, appending would create near-empty sheets for little gain —
// leave stragglers on the per-photo IndexedDB blob path until enough pile up.
const MIN_CANDIDATES_TO_APPEND = 50;

const DEBUG_ATLAS = false;

export function usePhotoAtlas() {
  const {
    getAtlasManifest,
    putAtlasManifest,
    getAllAtlasSheets,
    putAtlasSheets,
  } = useIndexedDBCache();

  // photoId -> PIXI.Texture (frame sub-texture of a shared sheet TextureSource)
  const frameTextures = new Map();
  // Shared sheet sources, kept for explicit cleanup on unmount.
  const sheetTextureSources = [];

  let rawManifest = null; // { id, version, sheetSize, padding, sheetCount, entries: Map, updatedAt }
  let texturesLoaded = false;
  let worker = null;
  let workerRequestId = 0;
  const pendingWorkerRequests = new Map(); // id -> {resolve, reject}

  const supportsOffscreenEncoding = () =>
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined";

  const yieldToEventLoop = () => new Promise((r) => setTimeout(r, 0));

  const emptyManifest = () => ({
    id: "manifest",
    version: 1,
    sheetSize: SHEET_SIZE,
    padding: PADDING,
    sheetCount: 0,
    entries: new Map(),
    updatedAt: 0,
  });

  /**
   * Read the manifest once per session (cheap — a single IDB record).
   * Does NOT decode sheets or build textures; use loadAtlasFromCache() for that.
   */
  const ensureManifestLoaded = async () => {
    if (rawManifest) return rawManifest;
    try {
      const stored = await getAtlasManifest();
      rawManifest =
        stored && stored.entries instanceof Map ? stored : emptyManifest();
    } catch (_) {
      rawManifest = emptyManifest();
    }
    return rawManifest;
  };

  /**
   * Load the atlas (manifest + all sheets) and build frame textures for
   * every photo the manifest covers. Safe to call multiple times per
   * session — only does real work once.
   */
  const loadAtlasFromCache = async () => {
    if (texturesLoaded) return;
    texturesLoaded = true; // set eagerly: a failed load shouldn't retry every call site

    const manifest = await ensureManifestLoaded();
    if (!manifest.entries.size) return;

    let sheetRecords = [];
    try {
      sheetRecords = await getAllAtlasSheets();
    } catch (error) {
      console.warn("⚠️ [Atlas] Failed to read sheets:", error);
      return;
    }
    if (!sheetRecords.length) return;

    const sourceByIndex = new Map();
    for (const rec of sheetRecords) {
      try {
        const bitmap = await createImageBitmap(rec.blob);
        const tex = PIXI.Texture.from(bitmap);
        // The GC (textureGCActive, see Photos2D.vue initPixi) frees textures
        // it thinks are idle. A sheet backs hundreds of frame textures whose
        // individual sprites may be off-screen at any moment — never let the
        // GC unload the shared sheet itself.
        tex.source.autoGarbageCollect = false;
        sourceByIndex.set(rec.index, tex.source);
        sheetTextureSources.push(tex.source);
      } catch (error) {
        console.warn(`⚠️ [Atlas] Failed to decode sheet ${rec.index}:`, error);
      }
    }

    let built = 0;
    for (const [photoId, coords] of manifest.entries) {
      const [sheetIndex, x, y, w, h] = coords;
      const source = sourceByIndex.get(sheetIndex);
      if (!source) continue;
      const frame = new PIXI.Rectangle(x, y, w, h);
      frameTextures.set(photoId, new PIXI.Texture({ source, frame }));
      built++;
    }

    console.log(
      `🗂️ [Atlas] loaded ${built}/${manifest.entries.size} photos from ${sourceByIndex.size} sheet(s)`,
    );
  };

  /** O(1) lookup — returns undefined if this photo isn't atlas-covered. */
  const getFrameTexture = (photoId) => frameTextures.get(photoId);

  const hasFrameTexture = (photoId) => frameTextures.has(photoId);

  // ─── Worker (encode-only) ──────────────────────────────────────────
  const ensureWorker = () => {
    if (worker) return worker;
    worker = new Worker(
      new URL("./atlasEncoder.worker.js", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event) => {
      const { id, sheetIndex, blob, mimeType, error } = event.data || {};
      const pending = pendingWorkerRequests.get(id);
      if (!pending) return;
      pendingWorkerRequests.delete(id);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve({ sheetIndex, blob, mimeType });
      }
    };
    worker.onerror = (event) => {
      console.warn("⚠️ [Atlas] Worker error:", event?.message || event);
    };
    return worker;
  };

  const encodeSheetInWorker = (sheetIndex, sheetBitmap) => {
    const w = ensureWorker();
    const id = ++workerRequestId;
    return new Promise((resolve, reject) => {
      pendingWorkerRequests.set(id, { resolve, reject });
      w.postMessage(
        { id, sheetIndex, bitmap: sheetBitmap, quality: ENCODE_QUALITY },
        [sheetBitmap],
      );
    });
  };

  // ─── Packing (shelf algorithm) ──────────────────────────────────────
  /**
   * @param {Array<{photoId:string, width:number, height:number}>} items
   * @param {number} startSheetIndex - continue numbering after existing sheets
   * @returns {Array<{index:number, entries:Array<{photoId,x,y,w,h}>}>}
   */
  const packShelf = (items, startSheetIndex) => {
    const sorted = [...items].sort((a, b) => b.height - a.height);
    const sheets = [];

    let sheetIndex = startSheetIndex;
    let cursorX = 0;
    let shelfY = 0;
    let shelfHeight = 0;
    let currentEntries = [];

    const flushSheet = () => {
      if (currentEntries.length) {
        sheets.push({ index: sheetIndex, entries: currentEntries });
      }
      sheetIndex++;
      currentEntries = [];
      cursorX = 0;
      shelfY = 0;
      shelfHeight = 0;
    };

    // Clamp strictly below SHEET_SIZE (not <=): guarantees any single item
    // always fits into a freshly-flushed empty sheet, so flushSheet() can
    // never be re-triggered by the same item it just made room for.
    const maxCell = SHEET_SIZE - PADDING;
    for (const item of sorted) {
      const w = Math.min(Math.max(1, Math.round(item.width)), maxCell);
      const h = Math.min(Math.max(1, Math.round(item.height)), maxCell);

      if (cursorX + w + PADDING > SHEET_SIZE) {
        cursorX = 0;
        shelfY += shelfHeight + PADDING;
        shelfHeight = 0;
      }
      if (shelfY + h + PADDING > SHEET_SIZE) {
        flushSheet();
      }

      currentEntries.push({ photoId: item.photoId, x: cursorX, y: shelfY, w, h });
      cursorX += w + PADDING;
      shelfHeight = Math.max(shelfHeight, h);
    }

    if (currentEntries.length) {
      sheets.push({ index: sheetIndex, entries: currentEntries });
    }

    return sheets;
  };

  // ─── Append (build + persist new sheets) ────────────────────────────
  /**
   * @param {Array<{photoId:string, bitmap:(ImageBitmap|HTMLImageElement|HTMLCanvasElement), width:number, height:number}>} items
   */
  const appendToAtlas = async (items) => {
    if (!items || items.length < MIN_CANDIDATES_TO_APPEND) return;
    if (!supportsOffscreenEncoding()) return; // unsupported browser: silent no-op, per-photo cache still works

    try {
      const manifest = await ensureManifestLoaded();
      const startSheetIndex = manifest.sheetCount || 0;
      const packed = packShelf(items, startSheetIndex);
      if (!packed.length) return;

      const bitmapByPhotoId = new Map(items.map((i) => [i.photoId, i.bitmap]));
      const newSheetRecords = [];
      const t0 = performance.now();

      for (const sheet of packed) {
        const canvas = document.createElement("canvas");
        canvas.width = SHEET_SIZE;
        canvas.height = SHEET_SIZE;
        const ctx = canvas.getContext("2d");

        for (const entry of sheet.entries) {
          const bmp = bitmapByPhotoId.get(entry.photoId);
          if (!bmp) continue;
          try {
            ctx.drawImage(bmp, entry.x, entry.y, entry.w, entry.h);
          } catch (_) {
            // Skip photos whose bitmap can't be drawn (e.g. zero-size); non-fatal.
          }
        }

        // Yield between sheets so compositing 30k photos worth of shelves
        // doesn't block pan/zoom on the very first big backfill.
        await yieldToEventLoop();

        try {
          const sheetBitmap = await createImageBitmap(canvas);
          const { blob } = await encodeSheetInWorker(sheet.index, sheetBitmap);
          if (blob) {
            newSheetRecords.push({
              index: sheet.index,
              blob,
              builtAt: Date.now(),
            });
          }
        } catch (error) {
          console.warn(`⚠️ [Atlas] Failed to encode sheet ${sheet.index}:`, error);
        }
      }

      if (!newSheetRecords.length) return;

      await putAtlasSheets(newSheetRecords);

      const mergedEntries = manifest.entries;
      const encodedIndices = new Set(newSheetRecords.map((s) => s.index));
      for (const sheet of packed) {
        if (!encodedIndices.has(sheet.index)) continue; // encode failed for this sheet — don't record its entries
        for (const entry of sheet.entries) {
          mergedEntries.set(entry.photoId, [
            sheet.index,
            entry.x,
            entry.y,
            entry.w,
            entry.h,
          ]);
        }
      }

      const updatedManifest = {
        id: "manifest",
        version: 1,
        sheetSize: SHEET_SIZE,
        padding: PADDING,
        sheetCount: Math.max(manifest.sheetCount, startSheetIndex + packed.length),
        entries: mergedEntries,
        updatedAt: Date.now(),
      };
      await putAtlasManifest(updatedManifest);
      rawManifest = updatedManifest;

      console.log(
        `🗂️ [Atlas] appended ${items.length} photos into ${newSheetRecords.length} new sheet(s) in ${Math.round(performance.now() - t0)}ms`,
      );
    } catch (error) {
      console.warn("⚠️ [Atlas] appendToAtlas failed:", error);
    }
  };

  // ─── Cleanup ─────────────────────────────────────────────────────────
  const destroy = () => {
    for (const source of sheetTextureSources) {
      try {
        if (!source.destroyed) source.destroy();
      } catch (_) {}
    }
    sheetTextureSources.length = 0;
    frameTextures.clear();
    rawManifest = null;
    texturesLoaded = false;

    if (worker) {
      try {
        worker.terminate();
      } catch (_) {}
      worker = null;
    }
    pendingWorkerRequests.clear();
  };

  return {
    loadAtlasFromCache,
    getFrameTexture,
    hasFrameTexture,
    appendToAtlas,
    destroy,
  };
}
