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

export const UPLOAD_MAX_WIDTH = 1500;
export const UPLOAD_THUMB_MAX_WIDTH = 800;
export const UPLOAD_MAX_SIZE_BYTES = 512000;
export const UPLOAD_THUMB_MAX_SIZE_BYTES = Math.floor(
  UPLOAD_MAX_SIZE_BYTES * (UPLOAD_THUMB_MAX_WIDTH / UPLOAD_MAX_WIDTH),
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
