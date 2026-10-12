import { computed, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import {
  LEVELS,
  MAX_FOCUSED_PHOTOS,
  useCanvasChatContext,
} from "./useCanvasChatContext.js";

/**
 * A board laid out as one tidy row, so reading order is just id order and a test can talk
 * about "the first three" without caring about geometry.
 */
const makeBoard = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    selected: false,
    config: { x: i * 120, y: 0, width: 100, height: 100 },
  }));

/** Mount the context over a board, with helpers to drive the two inputs it reads. */
const setup = ({ board = makeBoard(MAX_FOCUSED_PHOTOS + 8), visible = [] } = {}) => {
  const photos = ref(board);
  const visionPhotos = ref(visible);
  const boardPhotoIds = computed(() => photos.value.map((p) => Number(p.id)));
  const ctx = useCanvasChatContext({ photos, visionPhotos, boardPhotoIds });

  /** Select the first `n` photos, the way a drag-box does. */
  const select = (n) => {
    photos.value = photos.value.map((photo, i) => ({
      ...photo,
      selected: i < n,
    }));
  };

  return { ctx, photos, visionPhotos, select };
};

describe("level", () => {
  it("is 'board' with nothing marked", () => {
    const { ctx } = setup();
    expect(ctx.level.value).toBe(LEVELS.BOARD);
  });

  it("is 'focus' for a hand-picked selection", () => {
    const { ctx, select } = setup();
    select(3);
    expect(ctx.level.value).toBe(LEVELS.FOCUS);
  });

  it("is 'focus' for what the halo covers, with nothing picked", () => {
    const { ctx, visionPhotos } = setup();
    visionPhotos.value = makeBoard(5);
    expect(ctx.level.value).toBe(LEVELS.FOCUS);
    expect(ctx.focus.value.source).toBe("halo");
  });

  it("is 'local' once a spotlight sits inside a wider focus", () => {
    const { ctx, photos, select } = setup();
    select(3);
    ctx.togglePhotoSpotlight(photos.value[0]);
    expect(ctx.level.value).toBe(LEVELS.LOCAL);
  });

  it("stays 'focus' when the spotlight leaves no zone behind it", () => {
    // One photo picked and that same photo spotlighted: the zone is empty, so there is no
    // surrounding group to read the subject against.
    const { ctx, photos, select } = setup();
    select(1);
    ctx.togglePhotoSpotlight(photos.value[0]);
    expect(ctx.zoneIds.value).toEqual([]);
    expect(ctx.level.value).toBe(LEVELS.FOCUS);
  });

  it("is 'region' once the selection passes the cap", () => {
    const { ctx, select } = setup();
    select(MAX_FOCUSED_PHOTOS + 1);
    expect(ctx.level.value).toBe(LEVELS.REGION);
  });
});

describe("the focus / region threshold", () => {
  it("is still a focus at exactly MAX_FOCUSED_PHOTOS", () => {
    const { ctx, select } = setup();
    select(MAX_FOCUSED_PHOTOS);
    expect(ctx.focus.value.isRegion).toBe(false);
    expect(ctx.level.value).toBe(LEVELS.FOCUS);
    expect(ctx.focusIds.value).toHaveLength(MAX_FOCUSED_PHOTOS);
  });

  it("becomes a region one photo later, and sends no focus at all", () => {
    const { ctx, select } = setup();
    select(MAX_FOCUSED_PHOTOS + 1);
    expect(ctx.focus.value.isRegion).toBe(true);
    expect(ctx.focus.value.sentPhotos).toEqual([]);
    expect(ctx.focusIds.value).toEqual([]);
    // The whole selection still reaches the chat, as metadata.
    expect(ctx.regionIds.value).toHaveLength(MAX_FOCUSED_PHOTOS + 1);
  });

  it("keeps the full selection in `photos` and `total` either side of it", () => {
    const { ctx, select } = setup();
    select(MAX_FOCUSED_PHOTOS + 5);
    expect(ctx.focus.value.total).toBe(MAX_FOCUSED_PHOTOS + 5);
    expect(ctx.focus.value.photos).toHaveLength(MAX_FOCUSED_PHOTOS + 5);
  });
});

describe("the halo", () => {
  it("never becomes a region, however much it covers", () => {
    // The radius caps itself upstream; this pins that a halo is never treated as one here.
    const { ctx, visionPhotos } = setup();
    visionPhotos.value = makeBoard(40);
    expect(ctx.focus.value.isRegion).toBe(false);
    expect(ctx.focusIds.value).toHaveLength(MAX_FOCUSED_PHOTOS);
  });

  it("contributes no region ids — a viewport is not a set the user drew", () => {
    const { ctx, visionPhotos } = setup();
    visionPhotos.value = makeBoard(5);
    expect(ctx.regionIds.value).toEqual([]);
  });

  it("yields entirely to a hand-picked selection", () => {
    const { ctx, visionPhotos, select } = setup();
    visionPhotos.value = makeBoard(5);
    select(2);
    expect(ctx.focus.value.source).toBe("selection");
    expect(ctx.focusIds.value).toEqual([1, 2]);
  });
});

describe("zone and spotlight", () => {
  it("partitions the focus: zone is the focus minus the spotlight", () => {
    const { ctx, photos, select } = setup();
    select(4);
    ctx.togglePhotoSpotlight(photos.value[0]);
    ctx.togglePhotoSpotlight(photos.value[1]);
    expect(ctx.spotlightPhotoIds.value).toEqual([1, 2]);
    expect(ctx.zoneIds.value).toEqual([3, 4]);
  });

  it("toggles a photo off when it is already spotlighted", () => {
    const { ctx, photos, select } = setup();
    select(3);
    ctx.togglePhotoSpotlight(photos.value[0]);
    ctx.togglePhotoSpotlight(photos.value[0]);
    expect(ctx.spotlightPhotoIds.value).toEqual([]);
  });

  it("refuses a spotlight that would leave no zone", () => {
    const { ctx, photos, select } = setup();
    select(2);
    ctx.togglePhotoSpotlight(photos.value[0]);
    // One of the two is now the subject and the other is the whole zone. Taking that last
    // one too would leave a subject with nothing to be read against.
    expect(ctx.canSpotlight(photos.value[1])).toBe(false);
    // The one already marked can always be unmarked.
    expect(ctx.canSpotlight(photos.value[0])).toBe(true);
  });

  it("allows a spotlight from outside the focus, which takes nothing from the zone", () => {
    const { ctx, photos, select } = setup();
    select(2);
    expect(ctx.canSpotlight(photos.value[10])).toBe(true);
  });

  it("drops the spotlight when the focus goes away", async () => {
    const { ctx, photos, select } = setup();
    select(3);
    // Let the focus watcher settle before marking. Without this the two changes to
    // `hasFocus` (on, then off) coalesce into one flush, cancel out, and the callback
    // never runs — an artefact of driving it synchronously, not of the rule.
    await nextTick();
    ctx.togglePhotoSpotlight(photos.value[0]);
    expect(ctx.spotlightPhotoIds.value).toEqual([1]);

    select(0);
    await nextTick();
    expect(ctx.spotlightPhotoIds.value).toEqual([]);
  });

  it("prunes a spotlighted photo that leaves the board", async () => {
    const { ctx, photos, select } = setup();
    select(3);
    ctx.togglePhotoSpotlight(photos.value[0]);

    photos.value = photos.value.filter((photo) => photo.id !== 1);
    await nextTick();
    expect(ctx.spotlightPhotoIds.value).toEqual([]);
  });
});

describe("layout", () => {
  it("is empty when nothing is marked", () => {
    const { ctx } = setup();
    expect(ctx.layout.value).toEqual([]);
    expect(ctx.hasSeparateGroups.value).toBe(false);
  });

  it("covers the focus and the spotlight together, not the focus alone", () => {
    // The spotlight is picked from far along the row, outside the selection: the grid has
    // to place it, because "does this fit here" is answered by where it sits.
    const { ctx, photos, select } = setup();
    select(2);
    ctx.togglePhotoSpotlight(photos.value[15]);
    const ids = ctx.layout.value.flat().filter((id) => id !== null);
    expect(ids).toContain(16);
    expect(ids).toEqual(expect.arrayContaining([1, 2, 16]));
  });

  it("reports separate groups when the marked photos sit far apart", () => {
    const { ctx, photos, select } = setup();
    select(2);
    ctx.togglePhotoSpotlight(photos.value[15]);
    expect(ctx.hasSeparateGroups.value).toBe(true);
  });

  it("reports one group when they are adjacent", () => {
    const { ctx, photos, select } = setup();
    select(3);
    ctx.togglePhotoSpotlight(photos.value[0]);
    expect(ctx.hasSeparateGroups.value).toBe(false);
  });
});
