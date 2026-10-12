// utils/canvasPhotoSizing.js
//
// Shared sizing helpers for placing photos on the canvas. Used by both the
// canvas store (`createPhoto` / interactive add) and the headless ChatLab
// quick-create service so a canvas built either way sizes photos identically:
// each photo is scaled into a base box while preserving its real aspect ratio,
// so verticals aren't stretched into a horizontal cell.

export const HORIZONTAL_PHOTO_WIDTH = 150 * 1.5;
export const HORIZONTAL_PHOTO_HEIGHT = 100 * 1.5;
export const VERTICAL_PHOTO_WIDTH = 100 * 1.5;
export const VERTICAL_PHOTO_HEIGHT = 150 * 1.5;

/** Returns a promise with the intrinsic dimensions of an image URL. */
export function getImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Scale intrinsic dimensions into the canvas base box, preserving aspect ratio.
 * Falls back to the horizontal default box for invalid/degenerate input.
 * @param {{ width: number, height: number }} dims - intrinsic image dimensions
 * @returns {{ width: number, height: number }}
 */
export function fitPhotoToBaseBox(dims) {
  const dimsAreValid =
    Number.isFinite(dims?.width) &&
    Number.isFinite(dims?.height) &&
    dims.width > 0 &&
    dims.height > 0;
  if (!dimsAreValid) {
    return { width: HORIZONTAL_PHOTO_WIDTH, height: HORIZONTAL_PHOTO_HEIGHT };
  }

  const maxW = HORIZONTAL_PHOTO_WIDTH;
  const maxH = VERTICAL_PHOTO_HEIGHT;
  const aspectRatio = dims.width / dims.height;

  let width;
  let height;
  if (dims.width > dims.height) {
    // Horizontal: limit by width
    width = Math.min(dims.width, maxW);
    height = width / aspectRatio;
    if (height > maxH) {
      height = maxH;
      width = height * aspectRatio;
    }
  } else {
    // Vertical: limit by height
    height = Math.min(dims.height, maxH);
    width = height * aspectRatio;
    if (width > maxW) {
      width = maxW;
      height = width / aspectRatio;
    }
  }

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { width: HORIZONTAL_PHOTO_WIDTH, height: HORIZONTAL_PHOTO_HEIGHT };
  }
  return { width, height };
}
