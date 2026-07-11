// services/canvasQuickCreate.js
//
// Headless "create a named canvas with photos in one shot" — used by ChatLab
// action suggestions so creating a canvas behaves like creating a collection or
// series (no board mount, no modal). The backend canvas `data` only persists
// { id, config } per photo, so we don't need image dimensions or the store: we
// just lay the photos out in an as-square-as-possible grid and POST.
//
// Mirrors the serialization contract in useCanvasPersistence.js /
// canvas store `createPhoto` (config = { x, y, width, height, opacity, zIndex }).

import { api } from "@/utils/axios";

// Approximate default cell size (the board is infinite; the user rearranges).
const CELL_W = 220;
const CELL_H = 160;
const GAP = 24;

/** Build a { photos, discardedPhotos, currentZIndex } payload laying photoIds
 *  in a compact grid starting near the origin. */
function buildGridCanvasData(photoIds) {
  const count = photoIds.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));

  const photos = photoIds.map((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id,
      config: {
        x: 40 + col * (CELL_W + GAP),
        y: 40 + row * (CELL_H + GAP),
        width: CELL_W,
        height: CELL_H,
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

  const data = buildGridCanvasData(ids);
  const res = await api.post("/api/canvas", {
    name: name?.trim() || "New Canvas",
    data,
  });
  return { id: res.data.id, name: res.data.name };
}
