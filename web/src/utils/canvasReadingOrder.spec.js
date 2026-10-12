import { describe, it, expect } from "vitest";
import { sortByReadingOrder } from "./canvasReadingOrder.js";

const photo = (id, x, y, height = 100) => ({ id, config: { x, y, height } });
const ids = (photos) => sortByReadingOrder(photos).map((p) => p.id);

describe("sortByReadingOrder", () => {
  it("orders a single row left to right", () => {
    expect(ids([photo("c", 300, 0), photo("a", 0, 5), photo("b", 150, -5)])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("reads several rows top to bottom, each left to right", () => {
    const photos = [
      photo("d", 0, 200),
      photo("b", 150, 10),
      photo("f", 300, 190),
      photo("a", 0, 0),
      photo("e", 150, 210),
      photo("c", 300, -10),
    ];
    expect(ids(photos)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("keeps photos of different heights centred on the same line together", () => {
    const photos = [photo("b", 200, -50, 200), photo("a", 0, 20, 60), photo("c", 0, 300)];
    expect(ids(photos)).toEqual(["a", "b", "c"]);
  });

  it("does not chain a diagonal staircase into one row", () => {
    const photos = [photo("c", 0, 120), photo("a", 200, 0), photo("b", 100, 60)];
    expect(ids(photos)).toEqual(["a", "b", "c"]);
  });
});
