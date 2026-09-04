/**
 * Dragging a photo onto the canvas, from anywhere.
 *
 * The board's drop handler (`useCanvasPhoto.handlePhotoDrop`) is source-agnostic: it
 * reads an array of photos off `application/json` and places them where the pointer is.
 * This is the other half of that contract — the payload, and the preview image the cursor
 * carries.
 *
 * `RelatedPhotosToolbar` still carries its own copy of this. It was left alone on purpose:
 * its version is entangled with a synthetic touch-drag path (pointer tracking, a manually
 * positioned element, a dispatched `touchDrop`) that has nothing to do with the payload,
 * and unpicking a working gesture was not worth doing for the sake of the diff. Anything
 * NEW that drags photos onto the board should use this.
 *
 * The drag image matters more than it looks: the browser's default is a screenshot of the
 * source element, which for a chat bubble means dragging a card complete with its buttons
 * and its selection ring. A bare thumbnail at roughly the size it will land is what makes
 * the gesture read as "moving this photo onto the board".
 */

/** Ceiling for the drag preview, in CSS pixels. Also clamped against the viewport. */
const MAX_PREVIEW_WIDTH = 140;
const MAX_PREVIEW_HEIGHT = 105;

/** Floors, so a very wide or very tall photo still leaves something grabbable. */
const MIN_PREVIEW_SIDE = 60;

export function usePhotoDragToCanvas() {
  /**
   * Natural dimensions, keyed by photo id.
   *
   * `dragstart` cannot await anything — the drag image has to be set synchronously inside
   * the event or the browser has already taken its own screenshot — so a photo whose size
   * is not known yet gets a square preview the first time and the right one afterwards.
   * Warming this on hover would be possible; it has not been worth the listener.
   */
  const dimensions = new Map();

  const previewSize = (photo) => {
    const known =
      dimensions.get(photo.id) ??
      (photo.width && photo.height
        ? { width: photo.width, height: photo.height }
        : null);

    if (!known) return { width: 100, height: 100 };

    const maxWidth = Math.min(MAX_PREVIEW_WIDTH, window.innerWidth * 0.15);
    const maxHeight = Math.min(MAX_PREVIEW_HEIGHT, window.innerHeight * 0.12);
    const ratio = known.width / known.height;

    return ratio > 1
      ? {
          width: Math.max(maxWidth, MIN_PREVIEW_SIDE),
          height: Math.max(maxWidth / ratio, MIN_PREVIEW_SIDE),
        }
      : {
          width: Math.max(maxHeight * ratio, MIN_PREVIEW_SIDE),
          height: Math.max(maxHeight, MIN_PREVIEW_SIDE),
        };
  };

  /** Remember a photo's real size for the next drag. Cheap, and never blocks one. */
  const cacheDimensions = (photo) => {
    if (dimensions.has(photo.id)) return;
    if (photo.width && photo.height) {
      dimensions.set(photo.id, { width: photo.width, height: photo.height });
      return;
    }
    const src = photo.thumbnailUrl || photo.url;
    if (!src) return;

    const image = new Image();
    image.onload = () =>
      dimensions.set(photo.id, {
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    image.src = src;
  };

  const buildDragImage = (event, photo) => {
    const { width, height } = previewSize(photo);

    const preview = document.createElement("div");
    Object.assign(preview.style, {
      position: "absolute",
      // Off-screen: the element only has to exist long enough for the browser to
      // snapshot it, and it must never be visible in the page while it does.
      top: "-1000px",
      left: "-1000px",
      width: `${width}px`,
      height: `${height}px`,
      borderRadius: "8px",
      overflow: "hidden",
      border: "2px solid #22d3ee",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      background: "#000",
    });

    const image = document.createElement("img");
    image.src = photo.thumbnailUrl || photo.url;
    Object.assign(image.style, {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
    });
    preview.appendChild(image);
    document.body.appendChild(preview);

    try {
      event.dataTransfer?.setDragImage(preview, width / 2, height / 2);
    } catch {
      // Some browsers refuse a drag image mid-gesture; the default screenshot is used.
    }

    // The snapshot is taken synchronously, but removing the node in the same tick can
    // race it in some engines. A frame is enough and keeps it out of the layout.
    setTimeout(() => preview.remove(), 1000);
  };

  /**
   * Start a drag carrying `photos` to the board.
   *
   * The payload is the array `handlePhotoDrop` expects, and every photo in it needs at
   * least `id` and `thumbnailUrl` — that is what the canvas store rebuilds the card from.
   *
   * @param {DragEvent} event
   * @param {object|object[]} photos  one photo, or a group being dragged together
   */
  const onPhotoDragStart = (event, photos) => {
    const list = Array.isArray(photos) ? photos : [photos];
    if (list.length === 0) return;

    event.dataTransfer?.setData("application/json", JSON.stringify(list));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";

    buildDragImage(event, list[0]);
    for (const photo of list) cacheDimensions(photo);
  };

  return { onPhotoDragStart, cacheDimensions };
}
