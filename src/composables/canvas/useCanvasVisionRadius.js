import { computed, reactive, ref } from "vue";

/**
 * How many photos the radius may hand the chat.
 *
 * Mirrors CANVAS_VIEW_MAX_PHOTOS on the server, which caps it again — this copy exists so
 * the user can SEE the limit ("12 / 18 in view") instead of discovering it in an answer
 * that quietly ignored half the board.
 */
export const VISION_MAX_PHOTOS = 12;

/**
 * Default radius, as a multiple of the average photo's longest side.
 *
 * Measured off the PHOTOS, not off the viewport, so the radius is a fixed world size:
 * the circle then shrinks and grows on screen along with the photos it sits among,
 * because it is one more thing on the board.
 *
 * The previous formula was a fraction of the screen divided by the zoom, which fixed the
 * circle's size in SCREEN pixels — it never changed visually, and it swallowed more and
 * more photos the further out the user zoomed. Worse, it read the zoom from
 * `toolbarState.zoomLevel`, which starts at 0 and is only synced on pan, zoom and the end
 * of a fit: every read that landed before a sync fell back to 1 and produced a radius
 * scale-times too large, so the circle jumped about seemingly at random.
 *
 * Two photo-widths of radius is four across the circle, which on an ordinary grid holds
 * the order of ten photos — close enough to the cap that the count and the picture agree.
 */
const DEFAULT_RADIUS_IN_PHOTOS = 5;

/** Fallback while the board is empty and there is no photo to measure against. */
const EMPTY_BOARD_RADIUS_RATIO = 0.58;

/** Hard floor and ceiling, in world units, for a radius the user has resized by hand. */
const MIN_WORLD_RADIUS = 60;
const MAX_WORLD_RADIUS = 12000;

/**
 * The chat's vision radius: a circle over the part of the board the user is working on,
 * and the photos it currently covers.
 *
 * Two modes, and dragging the circle is what moves between them. They differ only in
 * where the circle IS — the radius is world-sized in both, so zooming never changes which
 * photos are covered, only how large they and the circle appear:
 *
 * - **follow** — centred on the middle of the viewport, so it keeps meaning "roughly what
 *   I am looking at" as the user pans around the board.
 * - **pinned** — frozen at a point on the board. It means "these photos", and it goes on
 *   meaning that while the user zooms out to look for something else.
 *
 * The radius is a WINDOW, not a filter: it decides what the chat is told about, never
 * where it searches.
 *
 * @param {import("vue").Ref} photos    canvas store photos (each with `config`)
 * @param {import("vue").Ref<{width: number, height: number, x: number, y: number, scale: number}>} viewport
 *        The stage as it actually is. A resolved value rather than the stage's own reactive
 *        config, because that config is not the source of truth: the canvas resizes and
 *        zooms the Konva stage imperatively and syncs only some of it back. The caller
 *        knows where each number really lives; this does not need to.
 */
export function useCanvasVisionRadius(photos, viewport) {
  const enabled = ref(true);

  /** 'follow' | 'pinned' — see the modes above. */
  const mode = ref("follow");

  /** Only read in pinned mode; follow mode takes its centre from the viewport. */
  const pinned = reactive({ x: 0, y: 0 });

  /**
   * The radius in world units, once the user has resized it. Null means "use the default".
   *
   * Deliberately NOT part of the follow/pinned split: the two modes differ in where the
   * circle is, never in how big it is. A radius that belonged to the mode would resize
   * itself the moment the user dragged the circle, which is not what dragging means.
   */
  const worldRadius = ref(null);

  const scale = computed(() => viewport.value.scale || 1);

  /** The viewport's centre, in the board's own coordinates. */
  const viewportCenter = computed(() => ({
    x: (viewport.value.width / 2 - viewport.value.x) / scale.value,
    y: (viewport.value.height / 2 - viewport.value.y) / scale.value,
  }));

  /** A world-sized radius that holds a sensible handful of whatever is on this board. */
  const defaultRadius = computed(() => {
    const sides = (photos.value ?? [])
      .map((photo) =>
        Math.max(photo.config?.width ?? 0, photo.config?.height ?? 0),
      )
      .filter(Boolean);

    if (sides.length === 0) {
      // Nothing to measure. The circle covers no photos either way, so the value only has
      // to look reasonable on screen until the first photo lands.
      return (
        (Math.min(viewport.value.width, viewport.value.height) *
          EMPTY_BOARD_RADIUS_RATIO) /
        scale.value
      );
    }

    const average = sides.reduce((sum, side) => sum + side, 0) / sides.length;
    return average * DEFAULT_RADIUS_IN_PHOTOS;
  });

  const radius = computed(() => worldRadius.value ?? defaultRadius.value);

  /** Centre and radius in world units, whichever mode is active. */
  const circle = computed(() => ({
    ...(mode.value === "pinned"
      ? { x: pinned.x, y: pinned.y }
      : viewportCenter.value),
    radius: radius.value,
  }));

  const isPinned = computed(() => mode.value === "pinned");

  // ── Photos under the circle ───────────────────────────────────────────────

  const photoCenter = (photo) => ({
    x: (photo.config?.x ?? 0) + (photo.config?.width ?? 0) / 2,
    y: (photo.config?.y ?? 0) + (photo.config?.height ?? 0) / 2,
  });

  /**
   * Covered photos with their distance to the centre.
   *
   * Inclusion is by photo CENTRE, not by overlap: a rule the user can predict by eye
   * beats one that pulls in a photo because a corner of it grazed the edge.
   */
  const covered = computed(() => {
    if (!enabled.value) return [];
    const { x, y, radius } = circle.value;
    const r2 = radius * radius;

    const hits = [];
    for (const photo of photos.value ?? []) {
      if (photo.inTrash) continue;
      const c = photoCenter(photo);
      const d2 = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d2 <= r2) hits.push({ photo, d2, ...c });
    }
    return hits;
  });

  /** How many the circle covers, before the cap. Shown to the user beside the count. */
  const coveredCount = computed(() => covered.value.length);

  const isOverCap = computed(() => coveredCount.value > VISION_MAX_PHOTOS);

  /**
   * The photos handed to the chat: nearest the centre first when there are too many, then
   * put back into the board's reading order.
   *
   * The two steps are separate on purpose. Distance decides WHICH photos survive the cap,
   * because the middle of the circle is where the user is actually looking. Reading order
   * decides how they are LISTED, because that is the only thing that makes "the gap in
   * the middle" or "what comes after this one" answerable.
   */
  const visiblePhotos = computed(() => {
    const hits = [...covered.value];
    if (hits.length > VISION_MAX_PHOTOS) {
      hits.sort((a, b) => a.d2 - b.d2);
      hits.length = VISION_MAX_PHOTOS;
    }
    return sortInReadingOrder(hits).map((hit) => hit.photo);
  });

  const visiblePhotoIds = computed(() =>
    visiblePhotos.value
      .map((photo) => Number(photo.id))
      .filter(Number.isFinite),
  );

  // ── Moving it by hand ─────────────────────────────────────────────────────

  /**
   * Freeze the circle where it currently is. Called at the start of a drag: the user
   * grabbed a circle that was following the screen, and from here it is theirs.
   */
  const pin = () => {
    const current = circle.value;
    pinned.x = current.x;
    pinned.y = current.y;
    mode.value = "pinned";
  };

  /** Move a pinned circle. World coordinates — the caller converts from the pointer. */
  const moveTo = (x, y) => {
    if (mode.value !== "pinned") pin();
    pinned.x = x;
    pinned.y = y;
  };

  /**
   * Resize the circle, in world units. Does NOT pin it: size and position are independent
   * here, so a radius the user chose survives the circle going back to following them.
   */
  const setRadius = (next) => {
    worldRadius.value = Math.min(
      MAX_WORLD_RADIUS,
      Math.max(MIN_WORLD_RADIUS, next),
    );
  };

  /** Back to the board's own default size, whatever the user had set. */
  const resetRadius = () => {
    worldRadius.value = null;
  };

  /** Hand it back to the viewport. The pinned centre is left to be overwritten. */
  const unpin = () => {
    mode.value = "follow";
  };

  const toggle = () => {
    enabled.value = !enabled.value;
  };

  return {
    enabled,
    mode,
    isPinned,
    circle,
    coveredCount,
    isOverCap,
    visiblePhotos,
    visiblePhotoIds,
    pin,
    unpin,
    moveTo,
    setRadius,
    resetRadius,
    toggle,
  };
}

/**
 * Row-major order over a free-form layout: left to right, top to bottom.
 *
 * A canvas has no rows, so they are inferred — photos whose centres sit within a band of
 * each other belong to the same visual row. The band is derived from the photos' own
 * heights rather than fixed, so it holds at any zoom and for any photo size.
 *
 * This is what turns a set of ids into something the model can reason about as a layout,
 * which raw x/y coordinates never manage to be.
 */
function sortInReadingOrder(hits) {
  if (hits.length < 2) return hits;

  const heights = hits.map((h) => h.photo.config?.height ?? 0).filter(Boolean);
  const averageHeight = heights.length
    ? heights.reduce((sum, h) => sum + h, 0) / heights.length
    : 0;
  // Just over half a photo: two photos side by side are almost never offset by more than
  // that, and two photos genuinely stacked almost always are.
  const band = Math.max(averageHeight * 0.6, 1);

  const byY = [...hits].sort((a, b) => a.y - b.y);
  const rows = [];
  let row = [byY[0]];
  let rowTop = byY[0].y;

  for (const hit of byY.slice(1)) {
    if (hit.y - rowTop <= band) {
      row.push(hit);
      continue;
    }
    rows.push(row);
    row = [hit];
    rowTop = hit.y;
  }
  rows.push(row);

  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}
