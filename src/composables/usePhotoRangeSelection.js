/**
 * usePhotoRangeSelection
 *
 * Extends useLocalPhotoSelection with standard photo-catalog selection behaviour:
 *   • Regular click         → toggle individual photo (same as before)
 *   • Ctrl / Cmd + click   → additive toggle (never clears existing selection)
 *   • Shift + click        → extend selection from the last clicked photo to
 *                            the current one (range selection)
 *
 * Keyboard navigation (grid must call attachKeyboardListeners):
 *   • ↑ ↓ ← →             → move focus cursor through the ordered photo list
 *   • Shift + ↑↓←→        → extend selection from the anchor
 *   • Space                → toggle selection of the focused photo
 *   • Escape               → clear selection and focus
 *
 * Usage (grid owner):
 *
 *   const { selectedPhotoIds, clearAllSelections, handlePhotoSelect,
 *           resetRangeState, attachKeyboardListeners, detachKeyboardListeners,
 *           focusedPhotoId } =
 *     usePhotoRangeSelection();
 *
 *   // In template, pass the ordered visible photo ids:
 *   // @select="(id, evt) => handlePhotoSelect(id, evt, displayedPhotos.map(p => p.id))"
 *
 *   // Mount / unmount keyboard listeners:
 *   // onMounted(() => attachKeyboardListeners(() => displayedPhotos.value.map(p => p.id), gridColumns))
 *   // onUnmounted(() => detachKeyboardListeners())
 *
 * The third argument `orderedPhotoIds` must reflect the *current display order* so
 * that range indices are correct.  Pass it at call-time (not as a reactive ref)
 * so the composable stays stateless with respect to the photo list.
 */

import { ref } from "vue";
import { useLocalPhotoSelection } from "./useLocalPhotoSelection";

export function usePhotoRangeSelection() {
  const selection = useLocalPhotoSelection();

  /** Index of the last photo that was clicked (non-shift) — range anchor. -1 = none. */
  const lastClickedIndex = ref(-1);

  /** Index of the photo currently under the keyboard cursor. -1 = none. */
  const focusedIndex = ref(-1);

  /** Id of the photo currently under the keyboard cursor (reactive, for visual highlight). */
  const focusedPhotoId = ref(null);

  /** True only when the focus cursor was last moved by the keyboard (not a mouse click). */
  const focusedByKeyboard = ref(false);

  // Stored references needed to remove the event listener on cleanup
  let _keyHandler = null;
  let _getOrderedIds = null;
  let _getColumns = null;

  /**
   * Main selection handler – call this from the grid @select listener.
   *
   * @param {string|number} photoId        – id of the clicked photo
   * @param {MouseEvent|null} event        – native click event (may be null on mobile)
   * @param {Array<string|number>} orderedIds – current ordered list of visible photo ids
   */
  const handlePhotoSelect = (photoId, event, orderedIds) => {
    // Normalise id to string for consistent comparison
    const strId = String(photoId);
    const currentIdx = orderedIds.findIndex((id) => String(id) === strId);

    const isShift = event?.shiftKey ?? false;
    const isCtrlOrCmd = (event?.ctrlKey || event?.metaKey) ?? false;

    if (isShift && lastClickedIndex.value !== -1 && currentIdx !== -1) {
      // ── Range selection ────────────────────────────────────────────────────
      // Select every photo between the anchor and the current photo (inclusive).
      // Existing selection outside the range is preserved (standard catalogue UX).
      const start = Math.min(lastClickedIndex.value, currentIdx);
      const end = Math.max(lastClickedIndex.value, currentIdx);
      const rangeIds = orderedIds.slice(start, end + 1);
      selection.selectAllPhotos(rangeIds);
      // Anchor does NOT move on shift-click (matches Lightroom / Finder behaviour)
    } else if (isCtrlOrCmd) {
      // ── Additive / subtractive toggle ──────────────────────────────────────
      // Toggle the clicked photo without touching the rest of the selection.
      selection.togglePhotoSelection(photoId);
      if (currentIdx !== -1) lastClickedIndex.value = currentIdx;
    } else {
      // ── Simple toggle ──────────────────────────────────────────────────────
      selection.togglePhotoSelection(photoId);
      if (currentIdx !== -1) lastClickedIndex.value = currentIdx;
    }

    // Sync keyboard cursor to the clicked photo (not a keyboard action)
    if (currentIdx !== -1) {
      focusedIndex.value = currentIdx;
      focusedPhotoId.value = String(photoId);
      focusedByKeyboard.value = false;
    }
  };

  /**
   * Reset the range anchor and keyboard cursor.
   * Call whenever the photo list changes so stale indices don't produce
   * unexpected ranges.
   */
  const resetRangeState = () => {
    lastClickedIndex.value = -1;
    focusedIndex.value = -1;
    focusedPhotoId.value = null;
    focusedByKeyboard.value = false;
  };

  /**
   * Keyboard event handler.
   * Supports arrow key navigation, Shift+arrow range extension, Space toggle,
   * and Escape to clear selection.
   *
   * @param {KeyboardEvent} e
   */
  const _handleKeyDown = (e) => {
    if (!_getOrderedIds) return;
    const orderedIds = _getOrderedIds();
    if (!orderedIds || orderedIds.length === 0) return;

    const columns = _getColumns ? _getColumns() : 1;
    const total = orderedIds.length;
    const currentFocus = focusedIndex.value;

    const NAV_KEYS = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      " ",
      "Escape",
    ];
    if (!NAV_KEYS.includes(e.key)) return;

    // Only intercept if focus is inside the grid (not in an input/textarea)
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    e.preventDefault();

    if (e.key === "Escape") {
      selection.clearAllSelections();
      focusedIndex.value = -1;
      focusedPhotoId.value = null;
      focusedByKeyboard.value = false;
      lastClickedIndex.value = -1;
      return;
    }

    if (e.key === " ") {
      if (currentFocus === -1) return;
      const photoId = orderedIds[currentFocus];
      selection.togglePhotoSelection(photoId);
      lastClickedIndex.value = currentFocus;
      return;
    }

    // Compute next index based on arrow direction
    let nextIdx = currentFocus === -1 ? 0 : currentFocus;
    if (currentFocus !== -1) {
      if (e.key === "ArrowRight")
        nextIdx = Math.min(currentFocus + 1, total - 1);
      else if (e.key === "ArrowLeft") nextIdx = Math.max(currentFocus - 1, 0);
      else if (e.key === "ArrowDown")
        nextIdx = Math.min(currentFocus + columns, total - 1);
      else if (e.key === "ArrowUp")
        nextIdx = Math.max(currentFocus - columns, 0);
    }

    if (e.shiftKey && lastClickedIndex.value !== -1) {
      // Extend selection from the anchor to the new focused position
      const start = Math.min(lastClickedIndex.value, nextIdx);
      const end = Math.max(lastClickedIndex.value, nextIdx);
      selection.selectAllPhotos(orderedIds.slice(start, end + 1));
    }

    focusedIndex.value = nextIdx;
    focusedPhotoId.value = String(orderedIds[nextIdx]);
    focusedByKeyboard.value = true;

    // If moving without shift and there's no prior anchor, set one
    if (!e.shiftKey) {
      lastClickedIndex.value = nextIdx;
    }
  };

  /**
   * Attach keyboard listeners.
   * Call from onMounted in the grid component.
   *
   * @param {() => Array<string|number>} getOrderedIds – getter returning current ordered ids
   * @param {() => number} getColumns                  – getter returning current column count
   */
  const attachKeyboardListeners = (getOrderedIds, getColumns) => {
    _getOrderedIds = getOrderedIds;
    _getColumns = getColumns;
    _keyHandler = _handleKeyDown;
    window.addEventListener("keydown", _keyHandler);
  };

  /**
   * Detach keyboard listeners.
   * Call from onUnmounted in the grid component.
   */
  const detachKeyboardListeners = () => {
    if (_keyHandler) {
      window.removeEventListener("keydown", _keyHandler);
      _keyHandler = null;
    }
    _getOrderedIds = null;
    _getColumns = null;
  };

  return {
    // Re-export everything from the base selection composable
    ...selection,
    // Range-aware additions
    focusedPhotoId,
    focusedByKeyboard,
    handlePhotoSelect,
    resetRangeState,
    attachKeyboardListeners,
    detachKeyboardListeners,
  };
}
