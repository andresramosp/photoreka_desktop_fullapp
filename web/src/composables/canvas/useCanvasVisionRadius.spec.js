import { describe, expect, it } from "vitest";
import {
  buildCanvasLayout,
  getViewportBounds,
  isPhotoCenterInBounds,
  layoutHasSeparateGroups,
  photosInViewport,
  sortPhotosInReadingOrder,
} from "./useCanvasVisionRadius.js";

/** A board photo, carrying only the geometry these functions actually read. */
const photo = (id, x, y, width = 100, height = 100, extra = {}) => ({
  id,
  config: { x, y, width, height },
  ...extra,
});

describe("getViewportBounds", () => {
  it("maps the stage rect into board coordinates", () => {
    expect(
      getViewportBounds({ width: 800, height: 600, x: -100, y: -50, scale: 1 }),
    ).toEqual({ left: 100, top: 50, right: 900, bottom: 650 });
  });

  it("divides by the scale, so zooming in shrinks what the viewport covers", () => {
    expect(
      getViewportBounds({ width: 800, height: 600, x: -100, y: -50, scale: 2 }),
    ).toEqual({ left: 50, top: 25, right: 450, bottom: 325 });
  });

  it("treats a zero scale as 1 rather than dividing by zero", () => {
    const bounds = getViewportBounds({
      width: 800,
      height: 600,
      x: -100,
      y: -50,
      scale: 0,
    });
    expect(bounds).toEqual({ left: 100, top: 50, right: 900, bottom: 650 });
    expect(Object.values(bounds).every(Number.isFinite)).toBe(true);
  });
});

describe("isPhotoCenterInBounds", () => {
  const bounds = { left: 0, top: 0, right: 200, bottom: 200 };

  it("includes a photo by its CENTRE, not by overlap", () => {
    // Straddles the left edge: its centre is outside, so it is out — the rule that stops
    // photos flickering in and out of the halo as the user pans.
    expect(isPhotoCenterInBounds(photo(1, -60, 50), bounds)).toBe(false);
    expect(isPhotoCenterInBounds(photo(2, -40, 50), bounds)).toBe(true);
  });

  it("counts a centre exactly on the edge as inside", () => {
    expect(isPhotoCenterInBounds(photo(3, 150, 150), bounds)).toBe(true);
  });
});

describe("photosInViewport", () => {
  const viewport = { width: 200, height: 200, x: 0, y: 0, scale: 1 };

  it("keeps only the photos whose centres are on screen", () => {
    const kept = photosInViewport(
      [photo(1, 0, 0), photo(2, 500, 500)],
      viewport,
    );
    expect(kept.map((p) => p.id)).toEqual([1]);
  });

  it("skips trashed photos even when they sit inside", () => {
    const kept = photosInViewport(
      [photo(1, 0, 0), photo(2, 10, 10, 100, 100, { inTrash: true })],
      viewport,
    );
    expect(kept.map((p) => p.id)).toEqual([1]);
  });

  it("survives a null list", () => {
    expect(photosInViewport(null, viewport)).toEqual([]);
  });
});

describe("sortPhotosInReadingOrder", () => {
  it("reads left to right, top to bottom", () => {
    const sorted = sortPhotosInReadingOrder([
      photo("br", 200, 200),
      photo("tr", 200, 0),
      photo("bl", 0, 200),
      photo("tl", 0, 0),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["tl", "tr", "bl", "br"]);
  });

  it("keeps photos in one row when they are only slightly offset vertically", () => {
    // Well inside the 0.6 * mean-height band: a reader sees one row here.
    const sorted = sortPhotosInReadingOrder([
      photo("b", 200, 20),
      photo("a", 0, 0),
      photo("c", 400, 10),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("splits into rows once the vertical offset passes the band", () => {
    const sorted = sortPhotosInReadingOrder([
      photo("second-row", 0, 300),
      photo("first-row", 200, 0),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["first-row", "second-row"]);
  });

  it("returns a copy for 0 and 1 photos rather than the same array", () => {
    const one = [photo(1, 0, 0)];
    const sorted = sortPhotosInReadingOrder(one);
    expect(sorted).toEqual(one);
    expect(sorted).not.toBe(one);
    expect(sortPhotosInReadingOrder([])).toEqual([]);
  });
});

describe("buildCanvasLayout", () => {
  it("is empty for no photos and a single cell for one", () => {
    expect(buildCanvasLayout([])).toEqual([]);
    expect(buildCanvasLayout(null)).toEqual([]);
    expect(buildCanvasLayout([photo(7, 0, 0)])).toEqual([[7]]);
  });

  it("drops photos whose id is not a number", () => {
    expect(buildCanvasLayout([photo("not-an-id", 0, 0), photo(3, 200, 0)])).toEqual(
      [[3]],
    );
  });

  it("places a tidy 2x2 as a 2x2", () => {
    expect(
      buildCanvasLayout([
        photo(1, 0, 0),
        photo(2, 120, 0),
        photo(3, 0, 120),
        photo(4, 120, 120),
      ]),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("puts photos a fraction of a frame out of alignment in the SAME column", () => {
    // The grid pictures the arrangement, not the geometry: a 30px drift on a 100px photo
    // must not invent a second column.
    expect(buildCanvasLayout([photo(1, 0, 0), photo(2, 30, 150)])).toEqual([
      [1],
      [2],
    ]);
  });

  it("turns a wide horizontal gap into exactly ONE spacer column", () => {
    // Two clusters far apart: the grid says they ARE apart, never how far.
    expect(buildCanvasLayout([photo(1, 0, 0), photo(2, 2000, 0)])).toEqual([
      [1, null, 2],
    ]);
  });

  it("turns a tall vertical gap into exactly ONE empty row", () => {
    expect(buildCanvasLayout([photo(1, 0, 0), photo(2, 0, 2000)])).toEqual([
      [1],
      [null],
      [2],
    ]);
  });

  it("only spaces rows apart once the gap reads as a break", () => {
    // band = 0.6 * mean height = 60, and a spacer needs band * 3. So 150px apart is two
    // rows of one group; 200px apart is two groups.
    expect(buildCanvasLayout([photo(1, 0, 0), photo(2, 0, 150)])).toEqual([
      [1],
      [2],
    ]);
    expect(buildCanvasLayout([photo(1, 0, 0), photo(2, 0, 200)])).toEqual([
      [1],
      [null],
      [2],
    ]);
  });

  it("gives two overlapping photos separate cells instead of losing one", () => {
    const layout = buildCanvasLayout([photo(1, 0, 0), photo(2, 10, 0)]);
    expect(
      layout
        .flat()
        .filter((id) => id !== null)
        .sort(),
    ).toEqual([1, 2]);
  });

  it("falls back to dense packing past the column cap, keeping every photo", () => {
    // 20 in a row, past LAYOUT_MAX_COLUMNS: the gaps give way, but the left-to-right
    // order — the part the agent reasons over — survives.
    const many = Array.from({ length: 20 }, (_, i) => photo(i + 1, i * 120, 0));
    const layout = buildCanvasLayout(many);
    expect(layout).toHaveLength(1);
    expect(layout[0]).toEqual(many.map((p) => p.id));
  });

  it("pads every row to the same width so the grid is rectangular", () => {
    const layout = buildCanvasLayout([
      photo(1, 0, 0),
      photo(2, 120, 0),
      photo(3, 0, 150),
    ]);
    expect(new Set(layout.map((row) => row.length)).size).toBe(1);
    expect(layout).toEqual([
      [1, 2],
      [3, null],
    ]);
  });
});

describe("layoutHasSeparateGroups", () => {
  it("is false for an empty or absent layout", () => {
    expect(layoutHasSeparateGroups([])).toBe(false);
    expect(layoutHasSeparateGroups(null)).toBe(false);
    expect(layoutHasSeparateGroups(undefined)).toBe(false);
  });

  it("is false when every filled cell is 4-connected", () => {
    expect(
      layoutHasSeparateGroups([
        [1, 2],
        [3, null],
      ]),
    ).toBe(false);
  });

  it("is true across a spacer column", () => {
    expect(layoutHasSeparateGroups([[1, null, 2]])).toBe(true);
  });

  it("is true across a spacer row", () => {
    expect(layoutHasSeparateGroups([[1], [null], [2]])).toBe(true);
  });

  it("does NOT treat diagonal touching as connected", () => {
    expect(
      layoutHasSeparateGroups([
        [1, null],
        [null, 2],
      ]),
    ).toBe(true);
  });

  it("agrees with the layout it is built from, end to end", () => {
    const apart = buildCanvasLayout([photo(1, 0, 0), photo(2, 2000, 0)]);
    const together = buildCanvasLayout([photo(1, 0, 0), photo(2, 120, 0)]);
    expect(layoutHasSeparateGroups(apart)).toBe(true);
    expect(layoutHasSeparateGroups(together)).toBe(false);
  });
});
