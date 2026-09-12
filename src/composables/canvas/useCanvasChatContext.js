import { computed, ref, watch } from "vue";
import {
  buildCanvasLayout,
  layoutHasSeparateGroups,
  sortPhotosInReadingOrder,
} from "@/composables/canvas/useCanvasVisionRadius.js";

/**
 * What the chat is being told about the board, as ONE model.
 *
 * This is the answer to "which level is this turn about", and it is deliberately the only
 * place that answers it. It used to be re-derived in six: the board view, the chat panel's
 * send-time snapshot, its focus counter, the transcript's per-message counts, the empty
 * state's prompt picker and the context readout — each with its own slightly different
 * spelling of the same rule. Every one of those spellings was a place the levels could
 * disagree, and they did.
 *
 * MODEL ONLY, no presentation. It says nothing about whether the chat panel is open, the
 * board is a playground, or the halo is drawn — those decide whether a level is SHOWN, not
 * what it is. Mixing the two is what once made the ambient ring vanish on an ordinary
 * selection: a view condition had been folded into the level itself. Callers layer their
 * own visibility on top, e.g. `level === "region" && isChatPanelOpen`.
 *
 * @param {object}   deps
 * @param {import("vue").Ref<Array>}    deps.photos       every photo on the board
 * @param {import("vue").Ref<Array>}    deps.visionPhotos what the halo currently covers
 * @param {import("vue").Ref<number[]>} deps.boardPhotoIds ids on the board, for pruning
 */
export function useCanvasChatContext({ photos, visionPhotos, boardPhotoIds }) {
  // ── The spotlight: board state, picked by hand ────────────────────────────
  const spotlightIds = ref(new Set());

  const isPhotoSpotlighted = (photo) =>
    spotlightIds.value.has(Number(photo.id));

  // A click (or tap) spotlights a photo while the chat is open: already spotlighted →
  // dropped, otherwise added.
  const togglePhotoSpotlight = (photo) => {
    const id = Number(photo.id);
    if (!Number.isFinite(id)) return;
    const next = new Set(spotlightIds.value);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_SPOTLIGHTED_PHOTOS) next.add(id);
    spotlightIds.value = next;
  };

  /**
   * Drop the whole spotlight. Used by the same empty-space click that clears the board
   * selection, so both kinds of pick let go together.
   */
  const clearChatSpotlight = () => {
    if (spotlightIds.value.size) spotlightIds.value = new Set();
  };

  // ── The focus: the board's own selection, or the halo ─────────────────────

  /**
   * Photos the user picked by hand, in the board's reading order.
   *
   * `photo.selected` is the board's own selection — set by clicking a photo or dragging a
   * rectangle around a group — and it already means "these ones" for moving and expanding.
   * Pointing the chat at the same set is the third reading of the same gesture, not a
   * fourth one to learn.
   */
  const focusedPhotos = computed(() =>
    sortPhotosInReadingOrder(
      (photos.value ?? []).filter((photo) => photo.selected),
    ),
  );

  /** A hand-picked set overrides the halo entirely. */
  const hasManualFocus = computed(() => focusedPhotos.value.length > 0);

  /**
   * What the chat actually sees: the hand-picked photos when there are any, the halo's
   * otherwise.
   *
   * `total` is what the focus holds, `photos` is every focused object for the visual
   * readout, and `sentPhotos` is what travels to the backend AS A FOCUS — photos described
   * and shown.
   *
   * A hand-picked selection past MAX_FOCUSED_PHOTOS is a REGION (`isRegion`): nothing is
   * sent as focus, and the whole selection reaches the chat only as `regionIds` — a reduced
   * canvas it partitions, profiles and searches within as metadata. No cap on the region
   * and no "first twelve": either the chat looks at the photos or it does not. The halo
   * never becomes a region: it caps itself to the same twelve.
   *
   * The threshold is EXCLUSIVE — exactly MAX_FOCUSED_PHOTOS is still a focus. Every copy
   * that quotes the number to the user ("select 12 or fewer") depends on that.
   */
  const focus = computed(() => {
    const source = hasManualFocus.value ? "selection" : "halo";
    const all = hasManualFocus.value
      ? focusedPhotos.value
      : (visionPhotos.value ?? []);
    const isRegion = source === "selection" && all.length > MAX_FOCUSED_PHOTOS;

    return {
      source,
      isRegion,
      total: all.length,
      photos: all,
      sentPhotos: isRegion ? [] : all.slice(0, MAX_FOCUSED_PHOTOS),
    };
  });

  const focusIds = computed(() => toIds(focus.value.sentPhotos));

  /**
   * The hand-picked selection ENTIRE, for the agent's tools rather than its eyes: the pool
   * `canvas_partition`, `canvas_overview` and a scoped search run over when the question is
   * about "this area". Unlike `focusIds` it is not capped — an id here costs nothing to
   * send and no thumbnail to show — and it is never the halo's: what falls under the ring
   * is a viewport, not a set the user drew.
   */
  const regionIds = computed(() =>
    focus.value.source === "selection" ? toIds(focus.value.photos) : [],
  );

  const hasFocus = computed(() => focusIds.value.length > 0);

  /**
   * The ZONE: focus photos that are not themselves spotlighted — what is left AROUND the
   * subject, and the only thing that makes a spotlight mean something different from a focus.
   *
   * The distinction matters because an empty zone is the degenerate shape, not an empty
   * focus. Mark one photo, spotlight that same photo, and the focus is still non-empty while
   * the zone is gone: the agent would be handed a zone that is its own subject.
   */
  const zoneIds = computed(() =>
    focusIds.value.filter((id) => !spotlightIds.value.has(id)),
  );

  /**
   * Whether this photo may be spotlighted right now — the gate the button hangs on, and what
   * makes "a spotlight always has a zone around it" structural rather than a rule: where the
   * mark would be degenerate there is simply no control to press.
   *
   * An already-spotlighted photo always passes, or there would be no way to unmark it. For
   * any other, what matters is what the zone is left holding: spotlighting a photo from
   * INSIDE the focus takes one out of the zone, so another must remain behind it; one from
   * elsewhere on the board takes nothing, so it only needs a zone to be read against. With
   * no zone at all both fail, which is the no-focus case falling out of the same rule.
   */
  const canSpotlight = (photo) => {
    if (isPhotoSpotlighted(photo)) return true;
    const zone = zoneIds.value;
    return zone.length > (zone.includes(Number(photo.id)) ? 1 : 0);
  };

  /**
   * The spotlighted photos as objects, in the board's reading order — what the context
   * readout renders, and the order they are described to the agent in.
   */
  const spotlightPhotos = computed(() =>
    sortPhotosInReadingOrder(
      (photos.value ?? []).filter((photo) =>
        spotlightIds.value.has(Number(photo.id)),
      ),
    ),
  );

  const spotlightPhotoIds = computed(() => toIds(spotlightPhotos.value));

  // ── The arrangement ───────────────────────────────────────────────────────

  /**
   * Focus and spotlight as a GRID of ids, so the agent reads the arrangement instead of
   * inferring it from a flat list.
   *
   * The union, not the focus alone, because a spotlighted photo is very often held up
   * against a zone it is not inside — "does this fit here" — and the answer is where it sits
   * relative to that zone. Everything in it is described to the agent, so the grid never
   * names a photo it knows nothing about.
   *
   * Only ids leave: `buildCanvasLayout` resolves the geometry here and returns cells.
   */
  const layout = computed(() => {
    const ids = new Set([...focusIds.value, ...spotlightPhotoIds.value]);
    if (ids.size === 0) return [];
    return buildCanvasLayout(
      (photos.value ?? []).filter((photo) => ids.has(Number(photo.id))),
    );
  });

  /**
   * Whether that grid reads as more than one cluster apart from each other — live off
   * `layout`, so dragging a photo across the gap (or closing it) updates this the same
   * frame the grid itself changes.
   */
  const hasSeparateGroups = computed(() =>
    layoutHasSeparateGroups(layout.value),
  );

  // ── The level ─────────────────────────────────────────────────────────────

  /**
   * Which level this turn is about — the single name for a state that four surfaces used to
   * spell out for themselves.
   *
   * Derived from the sets rather than asserted, so it cannot drift from them: a region is a
   * region because the focus says so, and "local" exists only where a spotlight has a zone
   * left around it to be read against.
   */
  const level = computed(() => {
    if (focus.value.isRegion) return LEVELS.REGION;
    const hasZone = zoneIds.value.length > 0;
    const hasSpotlight = spotlightPhotoIds.value.length > 0;
    if (hasZone && hasSpotlight) return LEVELS.LOCAL;
    if (hasZone || hasSpotlight) return LEVELS.FOCUS;
    return LEVELS.BOARD;
  });

  // ── Keeping the marks honest ──────────────────────────────────────────────

  /**
   * A spotlighted photo thrown in the trash (or otherwise removed from the board) must stop
   * being the chat's subject too. The focus self-heals because it is recomputed from
   * `photos`; the spotlight is a set the user built by hand, so it has to be pruned.
   */
  watch(boardPhotoIds, (ids) => {
    if (!spotlightIds.value.size) return;
    const onBoard = new Set(ids);
    const kept = [...spotlightIds.value].filter((id) => onBoard.has(id));
    if (kept.length !== spotlightIds.value.size)
      spotlightIds.value = new Set(kept);
  });

  /**
   * A spotlight cannot outlive the focus it was marked under. Dropping the focus — turning
   * the halo off, clearing the selection — takes the button away, so leaving the marks
   * behind would strand photos the user can see are lit and has no control left to unlight,
   * and would send the agent the one shape it is not written for.
   */
  watch(hasFocus, (has) => {
    if (!has) clearChatSpotlight();
  });

  return {
    level,
    focus,
    focusedPhotos,
    hasManualFocus,
    hasFocus,
    focusIds,
    regionIds,
    zoneIds,
    spotlightIds,
    spotlightPhotos,
    spotlightPhotoIds,
    layout,
    hasSeparateGroups,
    isPhotoSpotlighted,
    togglePhotoSpotlight,
    clearChatSpotlight,
    canSpotlight,
  };
}

/**
 * The four levels a turn can be about, innermost last. Exported as constants because they
 * travel into template conditions and prompt pools, where a typo in a string literal fails
 * silently — which is exactly how the levels drifted apart in the first place.
 */
export const LEVELS = {
  BOARD: "board",
  REGION: "region",
  FOCUS: "focus",
  LOCAL: "local",
};

/**
 * The most photos the chat can be SHOWN in one turn. Past it a hand-picked selection stops
 * being a focus and becomes a region — metadata, no images. Exclusive: exactly this many is
 * still a focus.
 */
export const MAX_FOCUSED_PHOTOS = 12;

/** The most photos that may carry the spotlight at once. */
export const MAX_SPOTLIGHTED_PHOTOS = 12;

/** Board ids as the numbers every id set downstream is made of. */
const toIds = (photos) =>
  (photos ?? []).map((photo) => Number(photo.id)).filter(Number.isFinite);
