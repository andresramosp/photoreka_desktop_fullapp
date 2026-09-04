import { computed, ref } from "vue";

/**
 * Default radius, as a multiple of the average photo's longest side.
 *
 * Measured off the PHOTOS, not off the viewport, so the radius is a fixed world size:
 * the halo then shrinks and grows on screen along with the photos it sits among, because
 * it is one more thing on the board.
 *
 * A screen fraction divided by the zoom would instead fix its size in SCREEN pixels — it
 * would never change visually, and it would swallow more and more photos the further out
 * the user zoomed.
 */
const DEFAULT_RADIUS_IN_PHOTOS = 10;

/** Fallback while the board is empty and there is no photo to measure against. */
const EMPTY_BOARD_RADIUS_RATIO = 0.58;

/**
 * The outer, ambient halo layer.
 *
 * The focus halo marks the photos the chat sees in FULL detail. But the chat is also aware
 * of the WHOLE canvas at a coarser level, so a second, wider and fainter band drawn around
 * the focus halo says exactly that: attention narrows to the middle, but does not stop at
 * the ring.
 *
 * Flip `OUTER_HALO_ENABLED` to false to drop the second layer entirely — nothing else
 * needs changing; `outerCircle` simply goes null and the template renders only the focus
 * halo.
 */
const OUTER_HALO_ENABLED = true;

/**
 * Floor for the outer band, as a multiple of the focus halo — so it stays clearly wider
 * even on a near-empty board where the farthest photo is close (or there is none).
 */
const OUTER_MIN_MULTIPLE = 1.8;

/** Hard floor and ceiling, in world units, for a radius the user has resized by hand. */
const MIN_WORLD_RADIUS = 60;
const MAX_WORLD_RADIUS = 12000;

/**
 * Below this stage scale the halo's per-photo highlight is only a pixel or two of border on
 * screen and all but vanishes, so the selection is reinforced instead with a translucent
 * accent fill laid over the whole photo. Above it the board is close enough that the border
 * alone reads, and the overlay is dropped. `scale` is the real Konva stage scale, so 1 = 100%.
 *
 * This is also the line the uncovered-photo fade keys off (see `HALO_FADED_OPACITY`): it only
 * bites in the border regime, never while the overlay wash is doing the reinforcing.
 */
const SELECTION_FILL_ZOOM_THRESHOLD = 0.4;

/**
 * How far the photos the halo does NOT cover are dimmed, so the covered ones read at full
 * strength against them. Gentle on purpose — the outside photos stay legible, they just
 * recede. Multiplied into each uncovered photo's own opacity by the caller.
 *
 * Only applied in the border regime (zoomed in past `SELECTION_FILL_ZOOM_THRESHOLD`); zoomed
 * further out the overlay wash already separates covered from uncovered, so the fade would be
 * redundant — see `selectionFillActive`.
 */
export const HALO_FADED_OPACITY = 0.55;

/**
 * The chat's vision halo: a soft region over the middle of the board, and the photos it
 * covers.
 *
 * Always centred on the viewport, and not draggable. It used to be movable and pinnable,
 * which made it a second way of saying "these photos" competing with selecting them — and
 * the selection is the better one, because it is exact. So the halo went back to being
 * only what it is good at: an ambient "roughly what I am looking at", free of any gesture.
 *
 * It is a WINDOW, not a filter: it decides what the chat is told about, never where it
 * searches. And it yields entirely to a manual selection — see `chatFocus` in CanvasView.
 *
 * @param {import("vue").Ref} photos    canvas store photos (each with `config`)
 * @param {import("vue").Ref<{width: number, height: number, x: number, y: number, scale: number}>} viewport
 *        The stage as it actually is. A resolved value rather than the stage's own reactive
 *        config, because that config is not the source of truth: the canvas resizes and
 *        zooms the Konva stage imperatively and syncs only some of it back. The caller
 *        knows where each number really lives; this does not need to.
 */
export function useCanvasVisionRadius(photos, viewport, maxCovered = 12) {
  const enabled = ref(true);

  /** The radius in world units, once the user has resized it. Null means "use the default". */
  const worldRadius = ref(null);

  const scale = computed(() => viewport.value.scale || 1);

  /**
   * True while the board is far enough out that the halo's per-photo highlight is drawn as a
   * translucent overlay wash rather than a thin border. The caller uses it both to pick which
   * highlight to render and to gate the uncovered-photo fade to the border regime only.
   */
  const selectionFillActive = computed(
    () => scale.value < SELECTION_FILL_ZOOM_THRESHOLD,
  );

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
      // Nothing to measure. The halo covers no photos either way, so the value only has
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

  /**
   * The radius, shrunk so it never holds more photo centres than the chat can actually be
   * shown (`maxCovered`).
   *
   * The chat is capped at the first 12 photos in reading order, so a halo that visibly
   * covers 40 is a lie: it says "these" and means "twelve of these". Rather than dim the
   * excess, the halo simply refuses to grow past them — in a dense patch it pulls in to hug
   * the twelve nearest, so what sits under the ring is exactly what the chat sees.
   *
   * Only ever pulls the radius IN. In a sparse patch the default already covers ≤12 and the
   * cap does nothing, so the halo keeps its calm default size and only reacts where density
   * would otherwise overflow it.
   */
  const radius = computed(() => {
    const base = worldRadius.value ?? defaultRadius.value;
    const all = photos.value ?? [];
    if (all.length <= maxCovered) return base;

    const { x, y } = viewportCenter.value;
    const distances = all
      .filter((photo) => !photo.inTrash)
      .map((photo) => {
        const cx = (photo.config?.x ?? 0) + (photo.config?.width ?? 0) / 2;
        const cy = (photo.config?.y ?? 0) + (photo.config?.height ?? 0) / 2;
        return Math.hypot(cx - x, cy - y);
      })
      .sort((a, b) => a - b);

    if (distances.length <= maxCovered) return base;

    // Sit the ring between the last photo it may keep and the first it must drop, so the
    // count is exact even when two photos share a distance to a rounding error.
    const last = distances[maxCovered - 1];
    const next = distances[maxCovered];
    const cap = next > last ? (last + next) / 2 : last;
    return Math.min(base, cap);
  });

  /** Centre and radius in world units. */
  const circle = computed(() => ({
    ...viewportCenter.value,
    radius: radius.value,
  }));

  /**
   * The outer ring: an unfilled circle, concentric with `circle`, sized to enclose EVERY
   * photo — so it always bounds the whole board, unlike the focus halo, which pulls in on
   * dense patches. That is the whole point of the second layer: the chat sees everything,
   * at a coarser level, so its boundary is drawn around everything.
   *
   * Its radius reaches the far edge of the farthest photo from the viewport centre, so no
   * photo ever sits outside it. Null when the second layer is turned off, so the template
   * can `v-if` on it directly.
   */
  const outerCircle = computed(() => {
    if (!OUTER_HALO_ENABLED) return null;
    const { x, y } = viewportCenter.value;

    let maxReach = 0;
    for (const photo of photos.value ?? []) {
      if (photo.inTrash) continue;
      const cx = (photo.config?.x ?? 0) + (photo.config?.width ?? 0) / 2;
      const cy = (photo.config?.y ?? 0) + (photo.config?.height ?? 0) / 2;
      // The far EDGE of the photo, not its centre, so the ring clears it completely.
      const half =
        Math.hypot(photo.config?.width ?? 0, photo.config?.height ?? 0) / 2;
      maxReach = Math.max(maxReach, Math.hypot(cx - x, cy - y) + half);
    }

    return {
      x,
      y,
      radius: Math.max(maxReach, radius.value * OUTER_MIN_MULTIPLE),
    };
  });

  // ── Photos under the halo ─────────────────────────────────────────────────

  /**
   * Covered photos, in the board's reading order.
   *
   * Inclusion is by photo CENTRE, not by overlap: the halo is ambient and the user pans
   * under it, so a rule that pulled a photo in because a corner grazed the edge would
   * have photos flickering in and out of the count. (The selection rectangle uses
   * intersection instead, and should — there you see exactly what you are enclosing.)
   */
  const visiblePhotos = computed(() => {
    if (!enabled.value) return [];
    const { x, y, radius: r } = circle.value;
    const r2 = r * r;

    const hits = (photos.value ?? []).filter((photo) => {
      if (photo.inTrash) return false;
      const cx = (photo.config?.x ?? 0) + (photo.config?.width ?? 0) / 2;
      const cy = (photo.config?.y ?? 0) + (photo.config?.height ?? 0) / 2;
      return (cx - x) ** 2 + (cy - y) ** 2 <= r2;
    });

    return sortPhotosInReadingOrder(hits);
  });

  const coveredCount = computed(() => visiblePhotos.value.length);

  const visiblePhotoIds = computed(() =>
    visiblePhotos.value
      .map((photo) => Number(photo.id))
      .filter(Number.isFinite),
  );

  // ── Size ──────────────────────────────────────────────────────────────────

  /** Resize the halo, in world units. */
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

  const toggle = () => {
    enabled.value = !enabled.value;
  };

  return {
    enabled,
    circle,
    outerCircle,
    selectionFillActive,
    coveredCount,
    visiblePhotos,
    visiblePhotoIds,
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
 * which raw x/y coordinates never manage to be. Exported because a manual selection feeds
 * the chat through the same door and has to arrive in the same order.
 */
export function sortPhotosInReadingOrder(photos) {
  if (photos.length < 2) return [...photos];

  const heights = photos.map((p) => p.config?.height ?? 0).filter(Boolean);
  const averageHeight = heights.length
    ? heights.reduce((sum, h) => sum + h, 0) / heights.length
    : 0;
  // Just over half a photo: two photos side by side are almost never offset by more than
  // that, and two photos genuinely stacked almost always are.
  const band = Math.max(averageHeight * 0.6, 1);

  const withCentres = photos.map((photo) => ({
    photo,
    x: (photo.config?.x ?? 0) + (photo.config?.width ?? 0) / 2,
    y: (photo.config?.y ?? 0) + (photo.config?.height ?? 0) / 2,
  }));

  const byY = [...withCentres].sort((a, b) => a.y - b.y);
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

  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x)).map((h) => h.photo);
}
