import { ref, computed, nextTick } from "vue";
import { useCanvasStore } from "@/stores/canvas";

/**
 * Undo/redo for the board's geometry.
 *
 * A history entry is one snapshot of exactly what a save persists — the same shape
 * `useCanvasPersistence.serializeCanvas` produces:
 *
 *   { photos: [{id, config}], discardedPhotos: [{id, config}], currentZIndex }
 *
 * Nothing transient (selection, spotlight, halo, pan/zoom, the loaded image) is part of a
 * snapshot, so undo never fights the chat's context or the viewport.
 *
 * A snapshot only carries `{id, config}`, never the loaded Konva image or the tags, so
 * restoring cannot just swap in the pared-down objects — it would drop the images and force
 * a refetch. The registry below keeps every photo object the store has held this session, so
 * undo/redo rebuild the board by REUSING those objects (same identity, image intact) and
 * only writing the snapshot's config back onto them.
 *
 * Commits are explicit and idempotent: callers fire `commit()` at action boundaries (drag
 * end, add, trash, unstack, group), and a commit whose snapshot equals the baseline is a
 * no-op — so committing liberally (e.g. both the store action AND the drag-end that called
 * it) never produces duplicate or empty entries.
 */
const CAP = 50;

export function useCanvasHistory() {
  const canvasStore = useCanvasStore();

  const registry = new Map();
  const key = (id) => String(id);

  const past = ref([]); // committed snapshots before the baseline
  const future = ref([]); // snapshots undone, waiting to be redone
  let baseline = null; // the current committed snapshot (string)
  let isRestoring = false; // guards commits fired by our own restore
  let batching = 0; // >0 while a multi-step action collapses to one entry

  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  const register = () => {
    for (const p of canvasStore.photos) registry.set(key(p.id), p);
    for (const p of canvasStore.discardedPhotos) registry.set(key(p.id), p);
  };

  const snapshot = () => ({
    photos: canvasStore.photos.map((p) => ({
      id: p.id,
      config: { ...p.config },
    })),
    discardedPhotos: canvasStore.discardedPhotos.map((p) => ({
      id: p.id,
      config: { ...p.config },
    })),
    currentZIndex: canvasStore.currentZIndex,
  });

  const serialize = () => JSON.stringify(snapshot());

  const restore = (snap) => {
    const data = JSON.parse(snap);
    isRestoring = true;

    const rebuild = (list) =>
      list
        .map(({ id, config }) => {
          const obj = registry.get(key(id));
          if (!obj) return null; // never seen this session — cannot rebuild it
          obj.config = { ...config };
          obj.selected = false;
          obj.checked = false;
          obj.inTrash = false;
          obj.hovered = false;
          return obj;
        })
        .filter(Boolean);

    canvasStore.photos = rebuild(data.photos);
    canvasStore.discardedPhotos = rebuild(data.discardedPhotos);
    if (typeof data.currentZIndex === "number") {
      canvasStore.currentZIndex = data.currentZIndex;
    }
    canvasStore.updateBasicMode();

    baseline = snap;
    // The store mutations above settle synchronously; clear the guard on the next tick so
    // any commit a downstream watcher schedules for them is swallowed.
    nextTick(() => {
      isRestoring = false;
    });
  };

  /** Record the current board as a new history entry, if it differs from the last one. */
  const commit = () => {
    if (isRestoring || batching > 0) return;
    register();
    const snap = serialize();
    if (snap === baseline) return;
    if (baseline !== null) {
      past.value.push(baseline);
      if (past.value.length > CAP) past.value.shift();
    }
    baseline = snap;
    future.value = [];
  };

  const undo = () => {
    if (!canUndo.value) return;
    future.value.push(baseline);
    restore(past.value.pop());
  };

  const redo = () => {
    if (!canRedo.value) return;
    past.value.push(baseline);
    restore(future.value.pop());
  };

  /**
   * Start over from the board as it is now — no undo crosses into it. Called on canvas
   * load, switch, create and reset, since a board's history belongs to that board alone.
   */
  const reset = () => {
    registry.clear();
    register();
    past.value = [];
    future.value = [];
    baseline = serialize();
  };

  /** Collapse a multi-step action (e.g. add-then-arrange) into a single history entry. */
  const beginBatch = () => {
    batching += 1;
  };
  const endBatch = () => {
    batching = Math.max(0, batching - 1);
    if (batching === 0) commit();
  };

  // Baseline is never null: the empty board at construction is a valid starting point until
  // a load or create resets it to the real one.
  reset();

  return {
    commit,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
    beginBatch,
    endBatch,
  };
}
