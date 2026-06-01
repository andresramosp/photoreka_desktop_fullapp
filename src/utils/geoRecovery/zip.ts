/**
 * Pack the original photos with GPS-injected EXIF into a single ZIP, streamed
 * out so we don't hold N copies of the raw bytes in memory at once.
 */

import JSZip from "jszip";

import { injectGps, copyJpegExif } from "./exif";
import { listPhotos, loadResults } from "./db";

export interface ZipProgress {
  done: number;
  total: number;
  current: string;
  skipped: number;
}

export interface ZipSummary {
  blob: Blob;
  totalPhotos: number;
  includedWithGps: number;
  includedWithoutGps: number;
  skipped: number;
}

export async function buildZip(
  options: { includeUnlocated?: boolean; watermarkText?: string } = {},
  onProgress?: (p: ZipProgress) => void,
): Promise<ZipSummary> {
  const includeUnlocated = options.includeUnlocated ?? false;
  const watermarkText = options.watermarkText ?? null;
  const [photos, results] = await Promise.all([listPhotos(), loadResults()]);
  const zip = new JSZip();

  let includedWithGps = 0;
  let includedWithoutGps = 0;
  let skipped = 0;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const result = results[photo.clientPhotoId];

    const manualLat = photo.manualLat;
    const manualLng = photo.manualLng;
    const hasManual =
      Number.isFinite(manualLat as number) &&
      Number.isFinite(manualLng as number);

    let lat: number | null = null;
    let lng: number | null = null;
    if (hasManual) {
      lat = manualLat as number;
      lng = manualLng as number;
    } else if (result?.status === "located") {
      lat = result.lat;
      lng = result.lng;
    }

    onProgress?.({
      done: i,
      total: photos.length,
      current: photo.originalName,
      skipped,
    });

    if (lat === null || lng === null) {
      if (!includeUnlocated) {
        skipped++;
        continue;
      }
      const blob = watermarkText
        ? await applyWatermark(
            photo.originalBlob,
            photo.originalMime,
            watermarkText,
          ).catch(() => photo.originalBlob)
        : photo.originalBlob;
      zip.file(safeName(photo.originalName, photo.clientPhotoId), blob);
      includedWithoutGps++;
      continue;
    }

    try {
      let final: Blob;
      if (watermarkText) {
        // ── With watermark ──────────────────────────────────────────────────────
        // 1. Inject GPS+EXIF into the original (preserves full original EXIF)
        const tagged = await injectGps(
          photo.originalBlob,
          photo.originalMime,
          lat,
          lng,
        );
        // 2. Burn watermark pixels via canvas (this strips all EXIF)
        const watermarked = await applyWatermark(
          tagged,
          photo.originalMime,
          watermarkText,
        ).catch(() => tagged);
        // 3. Re-attach the full EXIF (including GPS) from the tagged blob
        final =
          photo.originalMime === "image/png"
            ? await injectGps(watermarked, photo.originalMime, lat, lng)
            : await copyJpegExif(tagged, watermarked);
      } else {
        // ── Without watermark ─────────────────────────────────────────────
        final = await injectGps(
          photo.originalBlob,
          photo.originalMime,
          lat,
          lng,
        );
      }
      zip.file(safeName(photo.originalName, photo.clientPhotoId), final);
      includedWithGps++;
    } catch (error) {
      console.warn(
        "[geoRecovery/zip] EXIF injection failed for",
        photo.originalName,
        error,
      );
      // Fallback: include original blob (with watermark if requested, without GPS)
      const blob = watermarkText
        ? await applyWatermark(
            photo.originalBlob,
            photo.originalMime,
            watermarkText,
          ).catch(() => photo.originalBlob)
        : photo.originalBlob;
      zip.file(safeName(photo.originalName, photo.clientPhotoId), blob);
      includedWithoutGps++;
    }
  }

  onProgress?.({
    done: photos.length,
    total: photos.length,
    current: "",
    skipped,
  });

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "STORE", // images are already compressed; STORE is faster
  });

  return {
    blob,
    totalPhotos: photos.length,
    includedWithGps,
    includedWithoutGps,
    skipped,
  };
}

function safeName(name: string, fallbackId: string): string {
  const cleaned = name.replace(/[\/\\:*?"<>|]+/g, "_").trim();
  return cleaned.length > 0 ? cleaned : `${fallbackId}.jpg`;
}

/**
 * Burn a text watermark centered on an image blob using the browser Canvas
 * API. Returns a new Blob of the same MIME type.
 */
function applyWatermark(blob: Blob, mime: string, text: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0);

      const shortSide = Math.min(img.naturalWidth, img.naturalHeight);
      const fontSize = Math.max(20, Math.round(shortSide * 0.05));
      const subFontSize = Math.max(12, Math.round(fontSize * 0.5));
      const paddingH = Math.round(fontSize * 1.2);
      const paddingV = Math.round(fontSize * 0.7);
      const lineGap = Math.round(fontSize * 0.35);
      const subtitle = "Run the real analysis to remove this watermark";

      ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
      const mainW = ctx.measureText(text).width;
      ctx.font = `${subFontSize}px Arial, Helvetica, sans-serif`;
      const subW = ctx.measureText(subtitle).width;

      const blockW = Math.max(mainW, subW) + paddingH * 2;
      const blockH = fontSize + lineGap + subFontSize + paddingV * 2;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const rx = cx - blockW / 2;
      const ry = cy - blockH / 2;

      // Semi-transparent dark backdrop for legibility
      ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
      ctx.beginPath();
      ctx.roundRect(rx, ry, blockW, blockH, 6);
      ctx.fill();

      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      // Main watermark text
      ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = Math.round(fontSize * 0.2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
      ctx.fillText(text, cx, ry + paddingV);

      // Subtitle – smaller and more discreet
      ctx.font = `${subFontSize}px Arial, Helvetica, sans-serif`;
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillText(subtitle, cx, ry + paddingV + fontSize + lineGap);

      const outMime = mime === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("canvas.toBlob returned null"));
        },
        outMime,
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}
