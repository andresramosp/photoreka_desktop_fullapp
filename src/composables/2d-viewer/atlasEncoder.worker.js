// atlasEncoder.worker.js
//
// Encodes composed atlas-sheet canvases (see usePhotoAtlas.js) to WebP off
// the main thread. This is the only genuinely CPU-heavy step of atlas
// building (~0.5-1.5s per 4096x4096 sheet) — packing and drawImage()
// compositing stay on the main thread because they're cheap once the source
// bitmaps are already decoded; only the encode is worth the postMessage cost.
//
// Protocol:
//   main -> worker: { id, sheetIndex, bitmap (transferred), quality }
//   worker -> main: { id, sheetIndex, blob, mimeType } | { id, sheetIndex, error }

const WEBP_QUALITY_DEFAULT = 0.85;
const JPEG_QUALITY_FALLBACK = 0.9;

// One-time probe (mirrors the pattern in useImageProcessing.js probeWebpEncoding):
// some engines silently fall back to PNG for 'image/webp' and ignore quality,
// which would break the atlas's disk-size assumptions. Cached for the worker's
// lifetime since it never changes mid-session.
let webpSupportPromise = null;
function probeWebpSupport() {
  if (webpSupportPromise) return webpSupportPromise;
  webpSupportPromise = (async () => {
    try {
      const probe = new OffscreenCanvas(1, 1);
      const ctx = probe.getContext("2d");
      ctx.fillRect(0, 0, 1, 1);
      const blob = await probe.convertToBlob({ type: "image/webp" });
      return blob?.type === "image/webp";
    } catch (_) {
      return false;
    }
  })();
  return webpSupportPromise;
}

self.onmessage = async (event) => {
  const { id, sheetIndex, bitmap, quality } = event.data || {};

  try {
    if (!bitmap) {
      throw new Error("No bitmap received");
    }

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const useWebp = await probeWebpSupport();
    const mimeType = useWebp ? "image/webp" : "image/jpeg";
    const encodeQuality = useWebp
      ? (quality ?? WEBP_QUALITY_DEFAULT)
      : JPEG_QUALITY_FALLBACK;

    const blob = await canvas.convertToBlob({
      type: mimeType,
      quality: encodeQuality,
    });

    self.postMessage({ id, sheetIndex, blob, mimeType });
  } catch (error) {
    self.postMessage({
      id,
      sheetIndex,
      error: error?.message || String(error),
    });
  }
};
