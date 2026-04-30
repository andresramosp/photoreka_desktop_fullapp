/**
 * useCollectionSelection
 *
 * Google-Photos-style multi-selection for collection cards.
 *
 * Interaction model:
 *   • Click the selection circle (top-left)  → toggles item, enters selection mode
 *   • Regular click, nothing selected        → consumer opens the collection (returns false)
 *   • Regular click, selection mode active   → toggles the clicked card (returns true)
 *   • Shift + click (in selection mode)      → range select from last anchor (returns true)
 *   • Escape                                 → clearAll() — wired in the parent view
 *
 * Usage in CollectionsView:
 *
 *   const { selectedCollectionIds, isSelectionMode, isSelected,
 *           handleCollectionSelect, toggleSelectItem, clearAll } =
 *     useCollectionSelection();
 *
 *   // Card body click
 *   const onCardClick = (collection, nativeEvent, orderedIds) => {
 *     const handled = handleCollectionSelect(collection.id, nativeEvent, orderedIds);
 *     if (!handled) openCollection(collection);
 *   };
 *
 *   // Circle click (always enters/stays in selection mode)
 *   const onCircleClick = (collection, orderedIds) => {
 *     toggleSelectItem(collection.id, orderedIds);
 *   };
 *
 * For drag:
 *   Pass :isSelected and :selectedIds to CollectionCard so it can encode all IDs in dragstart.
 */

import { ref, computed } from "vue";

export function useCollectionSelection() {
  /** Map of id → true for selected collections */
  const selectedRecord = ref({});

  /** Index of the last interacted item — range anchor */
  const lastClickedIndex = ref(-1);

  /** Reactive array of selected collection IDs (as strings) */
  const selectedCollectionIds = computed(() =>
    Object.keys(selectedRecord.value).filter(
      (id) => !!selectedRecord.value[id],
    ),
  );

  /** True when at least one collection is selected */
  const isSelectionMode = computed(
    () => selectedCollectionIds.value.length > 0,
  );

  /** Returns true when the given id is selected */
  const isSelected = (id) => !!selectedRecord.value[String(id)];

  const _toggle = (id) => {
    const key = String(id);
    if (selectedRecord.value[key]) {
      delete selectedRecord.value[key];
    } else {
      selectedRecord.value[key] = true;
    }
  };

  const _selectRange = (ids) => {
    ids.forEach((id) => {
      selectedRecord.value[String(id)] = true;
    });
  };

  /** Clear entire selection and reset anchor */
  const clearAll = () => {
    selectedRecord.value = {};
    lastClickedIndex.value = -1;
  };

  /**
   * Called when the selection circle is clicked.
   * Always toggles the item and stays in / enters selection mode.
   *
   * @param {string|number} collectionId
   * @param {Array<string|number>} orderedIds
   */
  const toggleSelectItem = (collectionId, orderedIds) => {
    const strId = String(collectionId);
    const currentIdx = orderedIds
      ? orderedIds.findIndex((id) => String(id) === strId)
      : -1;
    _toggle(collectionId);
    if (currentIdx !== -1) lastClickedIndex.value = currentIdx;
  };

  /**
   * Handle a collection card body click.
   *
   * @param {string|number} collectionId  – id of the clicked card
   * @param {MouseEvent|null} event       – native click event
   * @param {Array<string|number>} orderedIds – current ordered list of collection ids (no sets)
   * @returns {boolean} true if selection was mutated (consumer should NOT open the collection),
   *                    false if a plain click with no active selection (consumer should open).
   */
  const handleCollectionSelect = (collectionId, event, orderedIds) => {
    const strId = String(collectionId);
    const currentIdx = orderedIds.findIndex((id) => String(id) === strId);
    const isShift = event?.shiftKey ?? false;

    // ── Shift-click in selection mode: range select ──────────────────────────
    if (
      isShift &&
      isSelectionMode.value &&
      lastClickedIndex.value !== -1 &&
      currentIdx !== -1
    ) {
      const start = Math.min(lastClickedIndex.value, currentIdx);
      const end = Math.max(lastClickedIndex.value, currentIdx);
      _selectRange(orderedIds.slice(start, end + 1));
      // Anchor stays at lastClickedIndex (Lightroom / Finder behaviour)
      return true;
    }

    // ── Regular click while in selection mode: toggle ────────────────────────
    if (isSelectionMode.value) {
      _toggle(collectionId);
      if (currentIdx !== -1) lastClickedIndex.value = currentIdx;
      return true;
    }

    // ── Plain click, nothing selected → consumer opens ───────────────────────
    if (currentIdx !== -1) lastClickedIndex.value = currentIdx;
    return false;
  };

  /** Reset the range anchor without clearing selection (call when the list changes) */
  const resetRangeState = () => {
    lastClickedIndex.value = -1;
  };

  return {
    selectedCollectionIds,
    isSelectionMode,
    isSelected,
    handleCollectionSelect,
    toggleSelectItem,
    clearAll,
    resetRangeState,
  };
}
