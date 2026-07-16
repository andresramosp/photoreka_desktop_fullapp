// services/canvasQuickCreate.js
//
// Headless "create a named canvas with photos in one shot" — used by ChatLab
// action suggestions so creating a canvas behaves like creating a collection or
// series (no board mount, no modal). The backend canvas `data` only persists
// { id, config } per photo, so we POST that directly (no board mount needed),
// but we still resolve each photo's real aspect ratio so verticals aren't
// stretched into the horizontal cell — mirroring canvas store `createPhoto`.
//
// Serialization contract: config = { x, y, width, height, opacity, zIndex }.

import { api } from "@/utils/axios";
import { usePhotosStore } from "@/stores/photos";
import {
  HORIZONTAL_PHOTO_WIDTH,
  HORIZONTAL_PHOTO_HEIGHT,
  getImageDimensions,
  fitPhotoToBaseBox,
} from "@/utils/canvasPhotoSizing";

const GAP = 35;

/** Resolve a { width, height } for a photo id, preferring dimensions already
 *  known on the store photo, falling back to loading the thumbnail, and finally
 *  to the horizontal default. */
async function resolvePhotoSize(id, photosById) {
  const photo = photosById.get(String(id));
  try {
    const dimsAreValid =
      Number.isFinite(photo?.width) &&
      Number.isFinite(photo?.height) &&
      photo.width > 0 &&
      photo.height > 0;
    if (dimsAreValid) {
      return fitPhotoToBaseBox({ width: photo.width, height: photo.height });
    }

    const url = photo?.thumbnailUrl || photo?.url;
    if (url) {
      return fitPhotoToBaseBox(await getImageDimensions(url));
    }
  } catch {
    // fall through to default
  }
  return { width: HORIZONTAL_PHOTO_WIDTH, height: HORIZONTAL_PHOTO_HEIGHT };
}

/** Build a { photos, discardedPhotos, currentZIndex } payload laying photoIds
 *  in a compact grid, each photo sized to its own aspect ratio and centered in
 *  a uniform cell. */
async function buildGridCanvasData(photoIds) {
  const photosStore = usePhotosStore();
  const photosById = new Map(
    (photosStore.photos || []).map((p) => [String(p.id), p]),
  );

  const sizes = await Promise.all(
    photoIds.map((id) => resolvePhotoSize(id, photosById)),
  );

  const count = photoIds.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));

  // Uniform cell based on the largest photo, so rows/columns line up while each
  // photo keeps its own aspect ratio (matches arrangeInGrid in the canvas store).
  const cellW = Math.max(HORIZONTAL_PHOTO_WIDTH, ...sizes.map((s) => s.width));
  const cellH = Math.max(HORIZONTAL_PHOTO_HEIGHT, ...sizes.map((s) => s.height));

  const photos = photoIds.map((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const { width, height } = sizes[i];
    return {
      id,
      config: {
        // Center each photo within its cell.
        x: 40 + col * (cellW + GAP) + (cellW - width) / 2,
        y: 40 + row * (cellH + GAP) + (cellH - height) / 2,
        width,
        height,
        opacity: 1,
        zIndex: i + 1,
      },
    };
  });

  return { photos, discardedPhotos: [], currentZIndex: count + 1 };
}

/**
 * Creates a new saved canvas with the given photos.
 * @param {string} name - canvas name (title suggested by the agent)
 * @param {(number|string)[]} photoIds
 * @returns {Promise<{ id: number, name: string }>} the created canvas
 */
export async function createCanvasWithPhotos(name, photoIds) {
  const ids = (photoIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  const data = await buildGridCanvasData(ids);
  const res = await api.post("/api/canvas", {
    name: name?.trim() || "New Canvas",
    data,
  });
  return { id: res.data.id, name: res.data.name };
}
