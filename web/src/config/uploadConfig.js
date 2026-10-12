/**
 * Upload format configuration.
 *
 * Control via env var VITE_UPLOAD_FORMAT:
 *   jpeg  – classic JPEG (default, current behaviour)
 *   webp  – WebP (roughly same visual quality, ~30-40% smaller files in R2)
 *
 * Changing this to "webp" affects ALL upload paths (main image, thumbnail,
 * and every in-component resize that imports these constants).
 */

const RAW_FORMAT = import.meta.env.VITE_UPLOAD_FORMAT || "jpeg";

const UPLOAD_MAIN_PRESETS = {
  longEdge: { size: 1800, fit: "longEdge" }, // caps the longer side, never upscales
  legacyWidth: { size: 1500, fit: "width" }, // fixed width: portraits get ~2x the pixels of landscapes
};
// Rolling back also needs LrPlugin Config.lua EXPORT_FULL_MAX_* and app_knowledge_content.ts reverted.
const UPLOAD_MAIN_PRESET = "longEdge";

export const UPLOAD_MAIN_SIZE = UPLOAD_MAIN_PRESETS[UPLOAD_MAIN_PRESET].size;
export const UPLOAD_MAIN_FIT = UPLOAD_MAIN_PRESETS[UPLOAD_MAIN_PRESET].fit;
export const UPLOAD_THUMB_MAX_WIDTH = 800;
export const UPLOAD_MAX_SIZE_BYTES = 512000;
// Anchored to the legacy main width so switching presets never changes the thumb budget.
export const UPLOAD_THUMB_MAX_SIZE_BYTES = Math.floor(
  UPLOAD_MAX_SIZE_BYTES *
    (UPLOAD_THUMB_MAX_WIDTH / UPLOAD_MAIN_PRESETS.legacyWidth.size),
);

// Normalise to the two supported values; fall back to jpeg if misconfigured.
export const UPLOAD_FORMAT = RAW_FORMAT === "webp" ? "webp" : "jpeg";

/** MIME type string passed to canvas.toBlob() / picaInstance.toBlob() */
export const UPLOAD_MIME =
  UPLOAD_FORMAT === "webp" ? "image/webp" : "image/jpeg";

/**
 * Starting quality for the iterative compression loop.
 *  - JPEG q0.90 is the traditional baseline.
 *  - WebP q0.82 produces visually equivalent output at ~30-40% smaller size.
 */
export const UPLOAD_QUALITY_INITIAL = UPLOAD_FORMAT === "webp" ? 0.82 : 0.9;

/**
 * Per-step quality decrement when the blob exceeds maxSizeBytes.
 * WebP uses a finer step (0.07) because its quality curve is steeper
 * than JPEG in the 0.7-0.9 range, so large decrements overshoot easily.
 */
export const UPLOAD_QUALITY_DECREMENT = UPLOAD_FORMAT === "webp" ? 0.07 : 0.1;

// ---------------------------------------------------------------------------
// Safe Search – pre-upload content moderation (Google Vision API)
// ---------------------------------------------------------------------------

/** Fraction of the photo batch to sample for the safe search check (0–1). */
export const SAFE_SEARCH_SAMPLE_RATIO = 0.75;
/** Minimum number of photos always sampled, regardless of ratio. */
export const SAFE_SEARCH_MIN_SAMPLES = 1;
/** Maximum number of photos sampled per upload batch. */
export const SAFE_SEARCH_MAX_SAMPLES = 15;
/** Images are downscaled to this width (px) before the check – keeps payloads small. */
export const SAFE_SEARCH_MAX_WIDTH = 500;
/** Maximum byte size per image sent to the check endpoint (~150 KB). */
export const SAFE_SEARCH_MAX_SIZE_BYTES = 150_000;
