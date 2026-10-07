import pLimit from "p-limit";
import { createBatcher } from "./batcher";
import { createLocalThumb } from "./localThumbs";
import { getUploadUrls, registerPhotos, uploadBlobToR2 } from "./api";
import type { PicksSource } from "./types";

// Photos in flight at once (resize → sign → PUT). Bounded so thumbnails waiting
// on the network never pile up in memory; resizing has its own, CPU-sized cap.
const IN_FLIGHT = 12;
const RESIZE_CONCURRENCY = 4;
const PUT_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export interface UploadedThumb {
  clientPhotoId: string;
  name: string;
  thumbUrl: string;
  width: number;
  height: number;
}

export interface DuplicateCopy {
  clientPhotoId: string;
  name: string;
  /** client id of the photo that is judged in its place */
  duplicateOf: string;
}

interface UploaderCallbacks {
  onUploaded: (thumb: UploadedThumb, source: PicksSource) => void;
  onDuplicate: (copy: DuplicateCopy, source: PicksSource) => void;
  onFailed: (source: PicksSource, error: unknown) => void;
}

interface UploadedOriginal {
  clientPhotoId: string;
  r2Key: string;
}

// The thumbnail is exactly what the jury sees, so identical thumbnail bytes mean
// the same image even when the file name or the EXIF differ.
async function thumbSignature(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function withRetry<T>(task: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= PUT_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
}

export function createPicksUploader(token: string, callbacks: UploaderCallbacks) {
  const inFlight = pLimit(IN_FLIGHT);
  const resize = pLimit(RESIZE_CONCURRENCY);
  let cancelled = false;
  // First photo seen per signature; copies wait on it and are never uploaded.
  const originals = new Map<string, Promise<UploadedOriginal | null>>();

  const sign = createBatcher(
    async (items: { clientPhotoId: string; contentType: string }[]) => {
      const urls = await getUploadUrls(token, items);
      return items.map((item) => urls[item.clientPhotoId] ?? null);
    },
    { maxSize: 50, delayMs: 150 },
  );

  const register = createBatcher(
    async (items: Parameters<typeof registerPhotos>[1]) => {
      await registerPhotos(token, items);
      return items.map(() => undefined);
    },
    { maxSize: 50, delayMs: 1000 },
  );

  function add(source: PicksSource, clientPhotoId: string): void {
    inFlight(async () => {
      if (cancelled) return null;
      const thumb = await resize(() => createLocalThumb(source.file));
      const signature = await thumbSignature(thumb.blob);

      // Lookup and claim happen with no await in between, so two copies can never
      // both become the original. A copy whose twin failed tries again itself.
      let twin = originals.get(signature);
      while (twin) {
        const original = await twin;
        if (original) {
          URL.revokeObjectURL(thumb.url);
          return { thumb, r2Key: original.r2Key, duplicateOf: original.clientPhotoId };
        }
        twin = originals.get(signature);
      }

      let settle: (value: UploadedOriginal | null) => void = () => {};
      originals.set(signature, new Promise((resolve) => (settle = resolve)));
      try {
        const signed = await sign({ clientPhotoId, contentType: thumb.blob.type });
        if (!signed) throw new Error("The upload URL was refused");
        await withRetry(() => uploadBlobToR2(signed.uploadUrl, thumb.blob));
        settle({ clientPhotoId, r2Key: signed.r2Key });
        return { thumb, r2Key: signed.r2Key, duplicateOf: null };
      } catch (error) {
        originals.delete(signature);
        settle(null);
        throw error;
      }
    })
      .then(async (uploaded) => {
        if (!uploaded || cancelled) return;
        const { thumb, r2Key, duplicateOf } = uploaded;
        if (duplicateOf) {
          await register({
            clientPhotoId,
            r2Key,
            originalName: source.file.name,
            width: thumb.width,
            height: thumb.height,
            duplicateOf,
          });
          if (!cancelled) {
            callbacks.onDuplicate({ clientPhotoId, name: source.file.name, duplicateOf }, source);
          }
          return;
        }
        // Registered outside the in-flight slot: waiting for the batch must not stall uploads.
        await register({
          clientPhotoId,
          r2Key,
          originalName: source.file.name,
          width: thumb.width,
          height: thumb.height,
        });
        if (cancelled) return URL.revokeObjectURL(thumb.url);
        callbacks.onUploaded(
          {
            clientPhotoId,
            name: source.file.name,
            thumbUrl: thumb.url,
            width: thumb.width,
            height: thumb.height,
          },
          source,
        );
      })
      .catch((error) => {
        if (!cancelled) callbacks.onFailed(source, error);
      });
  }

  return {
    add,
    cancel: () => {
      cancelled = true;
    },
  };
}

export type PicksUploader = ReturnType<typeof createPicksUploader>;
