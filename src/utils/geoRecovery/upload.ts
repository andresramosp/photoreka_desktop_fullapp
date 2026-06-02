/**
 * Upload pipeline for the geo-recovery flow.
 *
 * Per file:
 *   1. Generate a stable clientPhotoId (uuid)
 *   2. Read EXIF DateTimeOriginal (for temporal clustering)
 *   3. Resize → thumb blob (uses the project's existing pica-based resizer)
 *   4. Persist the ORIGINAL in IndexedDB (never leaves the browser)
 *   5. Ask backend for a signed R2 upload URL
 *   6. PUT the thumb to R2
 *   7. Register the photo in the session (server-side metadata only)
 *
 * The server never sees the original bytes.
 */

import pLimit from "p-limit";

import { useImageProcessing } from "@/composables/useImageProcessing.js";
import {
  UPLOAD_MIME,
  UPLOAD_THUMB_MAX_SIZE_BYTES,
  UPLOAD_THUMB_MAX_WIDTH,
} from "@/config/uploadConfig.js";

import { getUploadUrl, registerPhotos, uploadBlobToR2 } from "./api";
import { getPhoto, putPhoto } from "./db";
import { convertHeicToJpeg, readTakenAtMs } from "./exif";
import type { PhotoEntry } from "./types";

const UPLOAD_CONCURRENCY = 4;

function generateId(): string {
  // crypto.randomUUID is available everywhere we target; fall back just in case.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface UploadProgress {
  total: number;
  done: number;
  failed: number;
  current: string | null;
}

export interface UploadOptions {
  token: string;
  files: File[];
  onProgress?: (p: UploadProgress) => void;
}

export interface UploadResult {
  registered: PhotoEntry[];
  failed: Array<{ file: File; error: string }>;
}

export async function uploadFiles(
  options: UploadOptions,
): Promise<UploadResult> {
  const { token, files, onProgress } = options;
  const { resizeImage } = useImageProcessing();
  const limit = pLimit(UPLOAD_CONCURRENCY);

  const total = files.length;
  let done = 0;
  let failed = 0;

  const progress = (current: string | null) => {
    onProgress?.({ total, done, failed, current });
  };
  progress(null);

  const registered: PhotoEntry[] = [];
  const failures: Array<{ file: File; error: string }> = [];

  const batchStartMs = Date.now();

  await Promise.all(
    files.map((file, fileIndex) =>
      limit(async () => {
        progress(file.name);
        try {
          const entry = await processFile(
            file,
            token,
            resizeImage,
            batchStartMs + fileIndex,
          );
          registered.push(entry);
          done++;
        } catch (error: any) {
          failed++;
          failures.push({
            file,
            error: error?.message ?? String(error),
          });
          console.error("[geoRecovery/upload] failed:", file.name, error);
        }
        progress(file.name);
      }),
    ),
  );

  // Batch-register all successfully uploaded photos in one round-trip.
  // The backend returns a thumbUrl per photo (composed from IMAGES_WORKER + r2Key).
  if (registered.length > 0) {
    const { photoUrls } = await registerPhotos(token, registered);
    // Persist the thumb URLs into the local IDB records so they survive reloads.
    await Promise.all(
      registered.map(async ({ clientPhotoId }) => {
        const url = photoUrls[clientPhotoId];
        if (!url) return;
        const rec = await getPhoto(clientPhotoId);
        if (rec) await putPhoto({ ...rec, thumbUrl: url });
      }),
    );
  }

  progress(null);
  return { registered, failed: failures };
}

async function processFile(
  file: File,
  token: string,
  resizeImage: (file: File, width: number, maxBytes: number) => Promise<Blob>,
  addedAt: number,
): Promise<PhotoEntry> {
  const clientPhotoId = generateId();

  // Normalize HEIC/HEIF → JPEG: browsers can't draw these on canvas, and we
  // can't write GPS into them either. The converted JPEG is stored as the
  // "original" — quality loss is negligible and behaviour is consistent.
  let originalMime = file.type || "image/jpeg";
  let fileForProcessing: File = file;

  // Detect HEIC/HEIF by MIME type OR extension (Windows reports empty MIME for HEIC)
  const isHeic =
    originalMime === "image/heic" ||
    originalMime === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name);

  if (isHeic) {
    const jpegBlob = await convertHeicToJpeg(file);
    const jpegName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    fileForProcessing = new File([jpegBlob], jpegName, { type: "image/jpeg" });
    originalMime = "image/jpeg";
  }

  const [takenAtMs, thumbBlob] = await Promise.all([
    readTakenAtMs(fileForProcessing),
    resizeImage(
      fileForProcessing,
      UPLOAD_THUMB_MAX_WIDTH,
      UPLOAD_THUMB_MAX_SIZE_BYTES,
    ),
  ]);

  // Persist the original locally (this is the user's "warehouse" — it never
  // leaves the browser, so even if R2 deletes the thumb after 7 days, we still
  // have the full-res file to ship out as ZIP).
  await putPhoto({
    clientPhotoId,
    originalBlob: fileForProcessing,
    originalName: fileForProcessing.name,
    originalMime,
    takenAtMs,
    r2Key: "", // filled in below
    addedAt,
  });

  const contentType = thumbBlob.type || UPLOAD_MIME;
  const { uploadUrl, r2Key } = await getUploadUrl(
    token,
    clientPhotoId,
    contentType,
  );
  await uploadBlobToR2(uploadUrl, thumbBlob);

  // Update the local record with the now-known r2Key.
  await putPhoto({
    clientPhotoId,
    originalBlob: fileForProcessing,
    originalName: fileForProcessing.name,
    originalMime,
    takenAtMs,
    r2Key,
    addedAt,
  });

  return {
    clientPhotoId,
    r2Key,
    mime: contentType,
    originalName: fileForProcessing.name,
    takenAtMs,
  };
}
