/**
 * Pack the original photos with GPS-injected EXIF into a single ZIP, streamed
 * out so we don't hold N copies of the raw bytes in memory at once.
 */

import JSZip from "jszip";

import { injectGps } from "./exif";
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
  options: { includeUnlocated?: boolean } = {},
  onProgress?: (p: ZipProgress) => void,
): Promise<ZipSummary> {
  const includeUnlocated = options.includeUnlocated ?? false;

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
      zip.file(
        safeName(photo.originalName, photo.clientPhotoId),
        photo.originalBlob,
      );
      includedWithoutGps++;
      continue;
    }

    try {
      const tagged = await injectGps(
        photo.originalBlob,
        photo.originalMime,
        lat,
        lng,
      );
      zip.file(safeName(photo.originalName, photo.clientPhotoId), tagged);
      includedWithGps++;
    } catch (error) {
      console.warn(
        "[geoRecovery/zip] EXIF injection failed for",
        photo.originalName,
        error,
      );
      zip.file(
        safeName(photo.originalName, photo.clientPhotoId),
        photo.originalBlob,
      );
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
