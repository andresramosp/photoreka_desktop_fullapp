import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The axios wrapper drags a .vue component into the graph, which this node-only vitest
// config does not compile; the layout under test never touches the network anyway.
vi.mock("@/utils/axios", () => ({ api: { post: vi.fn(), get: vi.fn() } }));

import { useCanvasStore } from "./canvas.js";

/** A board of `count` photos scattered on a coarse grid, plus a few bystanders. */
const makeBoard = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    selected: false,
    config: {
      x: (i % 7) * 260,
      y: Math.floor(i / 7) * 220,
      width: i % 3 === 0 ? 120 : 180,
      height: i % 3 === 0 ? 180 : 120,
      zIndex: 1,
    },
  }));

/** The server's answer for a board: three groups and a cell-unit position per photo. */
const makeResult = (ids) => {
  const groups = [[], [], []];
  ids.forEach((id, i) => groups[i % 3].push(id));
  const centres = [
    [0, 0],
    [6, 0],
    [3, 5],
  ];
  const positions = {};
  ids.forEach((id, i) => {
    const [cx, cy] = centres[i % 3];
    const m = Math.floor(i / 3);
    positions[String(id)] = [cx + Math.cos(m) * 1.2, cy + Math.sin(m) * 1.2];
  });
  return {
    chunkName: "general",
    groups: groups.map((memberIds, g) => ({
      id: g,
      size: memberIds.length,
      memberIds,
    })),
    positions,
    missingIds: [],
  };
};

const rectsOverlap = (a, b) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const rectOf = ({ photo, x, y }) => ({
  x,
  y,
  width: photo.config.width,
  height: photo.config.height,
});

const expectNoOverlaps = (rects) => {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(rectsOverlap(rects[i], rects[j])).toBe(false);
    }
  }
};

describe("canvas store: planClusterLayout", () => {
  let store;
  let board;
  let memberIds;
  let result;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useCanvasStore();
    board = makeBoard(24);
    store.photos = board;
    // The last four photos are bystanders the layout must leave alone.
    memberIds = board.slice(0, 20).map((photo) => photo.id);
    result = makeResult(memberIds);
  });

  it.each(["cloud", "blocks"])(
    "%s: places every member once, without overlaps, and leaves others alone",
    (layout) => {
      const plan = store.planClusterLayout(result, layout);

      expect(plan).not.toBeNull();
      const placed = plan.targets.map(({ photo }) => photo.id).sort((a, b) => a - b);
      expect(placed).toEqual([...memberIds].sort((a, b) => a - b));

      const rects = plan.targets.map(rectOf);
      const bystanders = board.slice(20).map((photo) => photo.config);
      expectNoOverlaps([...rects, ...bystanders]);

      for (const rect of rects) {
        expect(rect.x).toBeGreaterThanOrEqual(plan.bounds.minX - 1e-6);
        expect(rect.y).toBeGreaterThanOrEqual(plan.bounds.minY - 1e-6);
        expect(rect.x + rect.width).toBeLessThanOrEqual(plan.bounds.maxX + 1e-6);
        expect(rect.y + rect.height).toBeLessThanOrEqual(plan.bounds.maxY + 1e-6);
      }
    },
  );

  it("blocks: each group is a separate block, no two blocks touch", () => {
    const plan = store.planClusterLayout(result, "blocks");
    const boxes = result.groups.map((group) => {
      const members = new Set(group.memberIds);
      const rects = plan.targets
        .filter(({ photo }) => members.has(photo.id))
        .map(rectOf);
      return {
        x: Math.min(...rects.map((r) => r.x)),
        y: Math.min(...rects.map((r) => r.y)),
        width:
          Math.max(...rects.map((r) => r.x + r.width)) -
          Math.min(...rects.map((r) => r.x)),
        height:
          Math.max(...rects.map((r) => r.y + r.height)) -
          Math.min(...rects.map((r) => r.y)),
      };
    });
    expectNoOverlaps(boxes);
  });

  it("blocks: inside a block the cloud's arrangement survives", () => {
    const plan = store.planClusterLayout(result, "blocks");
    for (const group of result.groups) {
      const members = new Set(group.memberIds);
      const targets = plan.targets.filter(({ photo }) => members.has(photo.id));
      const cloudY = (t) => result.positions[String(t.photo.id)][1];
      const cloudX = (t) => result.positions[String(t.photo.id)][0];

      // Rows of the block, top to bottom; each row's photos were higher in the cloud
      // than every photo of the row below.
      // Photos are centred in their cell, so a row is identified by its centre line.
      const centreY = (t) => Math.round(t.y + t.photo.config.height / 2);
      const rowKeys = [...new Set(targets.map(centreY))].sort((a, b) => a - b);
      const rows = rowKeys.map((y) => targets.filter((t) => centreY(t) === y));
      for (let r = 0; r + 1 < rows.length; r++) {
        const maxAbove = Math.max(...rows[r].map(cloudY));
        const minBelow = Math.min(...rows[r + 1].map(cloudY));
        expect(maxAbove).toBeLessThanOrEqual(minBelow);
      }
      // And inside a row, left to right follows the cloud's x.
      for (const row of rows) {
        const sorted = [...row].sort((a, b) => a.x - b.x);
        for (let i = 0; i + 1 < sorted.length; i++) {
          expect(cloudX(sorted[i])).toBeLessThanOrEqual(cloudX(sorted[i + 1]));
        }
      }
    }
  });

  it("planGroupPlacement with keepArrangement reads the board, not the id list", () => {
    // Ids in reverse; on the board photo 1 is top-left and photo 7 is further right/down.
    const ids = [7, 6, 5, 4, 3, 2, 1];
    const plan = store.planGroupPlacement(ids, { keepArrangement: true });
    // Seven photos fit one row, so reading order is left to right.
    const order = [...plan.targets]
      .sort((a, b) => a.x - b.x)
      .map(({ photo }) => photo.id);
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("cloud: groups stay apart, in the arrangement the server drew", () => {
    const plan = store.planClusterLayout(result, "cloud");
    const centreOf = (group) => {
      const members = new Set(group.memberIds);
      const rects = plan.targets
        .filter(({ photo }) => members.has(photo.id))
        .map(rectOf);
      return {
        x: rects.reduce((s, r) => s + r.x + r.width / 2, 0) / rects.length,
        y: rects.reduce((s, r) => s + r.y + r.height / 2, 0) / rects.length,
      };
    };
    const [a, b, c] = result.groups.map(centreOf);
    // Server put group 1 to the right of group 0 and group 2 below both.
    expect(b.x).toBeGreaterThan(a.x + 300);
    expect(c.y).toBeGreaterThan(Math.max(a.y, b.y) + 300);
  });

  it("skips members that left the board and returns null when none remain", () => {
    const partial = { ...result, groups: [{ id: 0, size: 2, memberIds: [999, 998] }] };
    expect(store.planClusterLayout(partial, "cloud")).toBeNull();

    const mixed = {
      ...result,
      groups: [{ id: 0, size: 3, memberIds: [1, 999, 2] }],
    };
    const plan = store.planClusterLayout(mixed, "blocks");
    expect(plan.targets.map(({ photo }) => photo.id)).toEqual([1, 2]);
  });
});
